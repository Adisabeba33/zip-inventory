import type { DedupedStrain } from './dedupe.js';
import { compareStrainNames } from './strainName.js';
import type { EntryState } from './status.js';
import type { CanonicalWeight } from './types.js';

export interface DiffRow {
  key: string;
  canonicalName: string;
  packageWeight: CanonicalWeight;
  /** Present for removal candidates. */
  lastSeenAt?: Date | null;
  /** Present for additions that are re-appearances. */
  firstSeenAt?: Date | null;
}

export interface SnapshotDiff {
  added: DiffRow[];
  returned: DiffRow[];
  /**
   * Entries missing from this snapshot. "Candidate" because a single miss never
   * de-lists anything - it takes a second consecutive successful observation.
   */
  removalCandidates: DiffRow[];
  /** Entries that a second miss would de-list right now. */
  confirmedRemovals: DiffRow[];
  unchangedCount: number;
  previousCount: number;
  currentCount: number;
  noChange: boolean;
}

/**
 * Preview the effect of a snapshot without applying it. Used by the admin diff
 * review screen and by the anomaly gate before anything is published.
 */
export function previewDiff(
  previous: readonly EntryState[],
  observed: readonly DedupedStrain[],
  requiredMissesToDelist = 2,
): SnapshotDiff {
  const previousByKey = new Map(previous.map((entry) => [entry.key, entry]));
  const observedByKey = new Map(observed.map((entry) => [entry.key, entry]));

  const added: DiffRow[] = [];
  const returned: DiffRow[] = [];
  const removalCandidates: DiffRow[] = [];
  const confirmedRemovals: DiffRow[] = [];
  let unchangedCount = 0;

  for (const item of observed) {
    const existing = previousByKey.get(item.key);
    if (!existing) {
      added.push({ key: item.key, canonicalName: item.canonicalName, packageWeight: item.packageWeight });
    } else if (existing.currentStatus === 'NO_LONGER_LISTED') {
      returned.push({
        key: item.key,
        canonicalName: item.canonicalName,
        packageWeight: item.packageWeight,
        firstSeenAt: existing.firstSeenAt,
      });
    } else {
      unchangedCount += 1;
    }
  }

  for (const existing of previous) {
    if (observedByKey.has(existing.key)) continue;
    if (existing.currentStatus === 'NO_LONGER_LISTED') continue;
    const row: DiffRow = {
      key: existing.key,
      canonicalName: existing.canonicalStrainName,
      packageWeight: existing.packageWeight,
      lastSeenAt: existing.lastSeenAt,
    };
    removalCandidates.push(row);
    if (existing.consecutiveMisses + 1 >= requiredMissesToDelist) confirmedRemovals.push(row);
  }

  const byName = (a: DiffRow, b: DiffRow) =>
    a.packageWeight.localeCompare(b.packageWeight) || compareStrainNames(a.canonicalName, b.canonicalName);
  added.sort(byName);
  returned.sort(byName);
  removalCandidates.sort(byName);
  confirmedRemovals.sort(byName);

  const previousLive = previous.filter((entry) => entry.currentStatus !== 'NO_LONGER_LISTED');

  return {
    added,
    returned,
    removalCandidates,
    confirmedRemovals,
    unchangedCount,
    previousCount: previousLive.length,
    currentCount: observed.length,
    noChange: added.length === 0 && returned.length === 0 && removalCandidates.length === 0,
  };
}
