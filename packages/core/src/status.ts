import type { DedupedStrain } from './dedupe.js';
import { entryKey } from './dedupe.js';
import type { CanonicalWeight, InventoryEntryState, InventoryStatus } from './types.js';

export interface StatusRules {
  /**
   * How many consecutive *successful* observations must miss an entry before it
   * is de-listed. Two, so a single menu bug, pagination glitch or partial
   * parse never removes a strain from the public page.
   */
  requiredMissesToDelist: number;
  /** How long a first observation is badged NEW. */
  newlyListedWindowDays: number;
  /** How long a re-appearance is badged BACK. */
  returnedWindowDays: number;
}

export const DEFAULT_STATUS_RULES: StatusRules = {
  requiredMissesToDelist: 2,
  newlyListedWindowDays: 7,
  returnedWindowDays: 7,
};

/** Stored state plus the timestamps needed to time the badges. */
export interface EntryState extends InventoryEntryState {
  key: string;
  returnedAt: Date | null;
}

export interface EntryTransition {
  key: string;
  canonicalName: string;
  packageWeight: CanonicalWeight;
  previousStatus: InventoryStatus | null;
  status: InventoryStatus;
  kind: 'added' | 'returned' | 'delisted' | 'missed_once' | 'unchanged';
}

export interface ApplySnapshotResult {
  entries: EntryState[];
  transitions: EntryTransition[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function withinDays(from: Date | null, now: Date, days: number): boolean {
  if (!from) return false;
  return now.getTime() - from.getTime() <= days * DAY_MS;
}

/**
 * Advance inventory state by one **successful, published** snapshot.
 *
 * Callers must never invoke this for a failed, blocked or unconfirmed run: a
 * crawl that timed out, was rate limited, hit a challenge page or failed to
 * parse tells us nothing about the retailer's listings, and must leave the
 * previous state exactly as it was.
 */
export function applySnapshot(
  previous: readonly EntryState[],
  observed: readonly DedupedStrain[],
  observedAt: Date,
  rules: StatusRules = DEFAULT_STATUS_RULES,
): ApplySnapshotResult {
  const previousByKey = new Map(previous.map((entry) => [entry.key, entry]));
  const observedByKey = new Map(observed.map((entry) => [entry.key, entry]));

  const entries: EntryState[] = [];
  const transitions: EntryTransition[] = [];

  for (const item of observed) {
    const existing = previousByKey.get(item.key);

    if (!existing) {
      entries.push({
        key: item.key,
        canonicalStrainName: item.canonicalName,
        packageWeight: item.packageWeight,
        currentStatus: 'NEWLY_LISTED',
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        lastMissingAt: null,
        returnedAt: null,
        consecutiveHits: 1,
        consecutiveMisses: 0,
        listingCount: item.listingCount,
      });
      transitions.push({
        key: item.key,
        canonicalName: item.canonicalName,
        packageWeight: item.packageWeight,
        previousStatus: null,
        status: 'NEWLY_LISTED',
        // "First observed by this service" - not a claim about the retailer.
        kind: 'added',
      });
      continue;
    }

    const cameBack = existing.currentStatus === 'NO_LONGER_LISTED';
    const returnedAt = cameBack ? observedAt : existing.returnedAt;

    let status: InventoryStatus;
    if (cameBack) status = 'RETURNED';
    else if (existing.currentStatus === 'NEWLY_LISTED' && withinDays(existing.firstSeenAt, observedAt, rules.newlyListedWindowDays)) status = 'NEWLY_LISTED';
    else if (existing.currentStatus === 'RETURNED' && withinDays(returnedAt, observedAt, rules.returnedWindowDays)) status = 'RETURNED';
    else status = 'LISTED_NOW';

    entries.push({
      key: item.key,
      // Display spelling follows the latest observation; the match key, and so
      // the entry's identity, is unchanged.
      canonicalStrainName: item.canonicalName,
      packageWeight: item.packageWeight,
      currentStatus: status,
      firstSeenAt: existing.firstSeenAt,
      lastSeenAt: observedAt,
      lastMissingAt: existing.lastMissingAt,
      returnedAt,
      consecutiveHits: existing.consecutiveHits + 1,
      consecutiveMisses: 0,
      listingCount: item.listingCount,
    });

    transitions.push({
      key: item.key,
      canonicalName: item.canonicalName,
      packageWeight: item.packageWeight,
      previousStatus: existing.currentStatus,
      status,
      kind: cameBack ? 'returned' : 'unchanged',
    });
  }

  for (const existing of previous) {
    if (observedByKey.has(existing.key)) continue;

    const misses = existing.consecutiveMisses + 1;
    const delisted = misses >= rules.requiredMissesToDelist;
    // One miss is not evidence. The entry stays exactly as it was on the public
    // page until a second independent successful observation agrees.
    const status: InventoryStatus = delisted ? 'NO_LONGER_LISTED' : existing.currentStatus;

    entries.push({
      ...existing,
      currentStatus: status,
      lastMissingAt: observedAt,
      consecutiveHits: delisted ? 0 : existing.consecutiveHits,
      consecutiveMisses: misses,
    });

    transitions.push({
      key: existing.key,
      canonicalName: existing.canonicalStrainName,
      packageWeight: existing.packageWeight,
      previousStatus: existing.currentStatus,
      status,
      kind: delisted ? 'delisted' : 'missed_once',
    });
  }

  entries.sort((a, b) => a.key.localeCompare(b.key));
  return { entries, transitions };
}

/** Badge shown next to a strain. Nothing at all for an ordinary listing. */
export function deriveBadge(
  entry: Pick<EntryState, 'currentStatus' | 'firstSeenAt' | 'returnedAt'>,
  now: Date,
  rules: StatusRules = DEFAULT_STATUS_RULES,
): 'NEW' | 'RETURNED' | null {
  if (entry.currentStatus === 'NEWLY_LISTED' && withinDays(entry.firstSeenAt, now, rules.newlyListedWindowDays)) {
    return 'NEW';
  }
  if (entry.currentStatus === 'RETURNED' && withinDays(entry.returnedAt, now, rules.returnedWindowDays)) {
    return 'RETURNED';
  }
  return null;
}

/** Convenience for building state from a database row. */
export function toEntryState(row: Omit<EntryState, 'key'>): EntryState {
  return { ...row, key: entryKey(row.packageWeight, row.canonicalStrainName) };
}
