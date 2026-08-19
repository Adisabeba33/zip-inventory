import {
  CURRENT_STATUSES,
  compareStrainNames,
  deriveBadge,
  entryKey,
  strainMatchKey,
  type CanonicalWeight,
  type DedupedStrain,
  type EntryState,
  type InventoryStatus,
  type NormalizedObservation,
} from '@inventory-index/core';
import { query, withTransaction } from '../pool.js';

interface EntryRow {
  id: string;
  canonical_strain_name: string;
  match_key: string;
  package_weight: CanonicalWeight;
  current_status: InventoryStatus;
  first_seen_at: Date;
  last_seen_at: Date | null;
  last_missing_at: Date | null;
  returned_at: Date | null;
  consecutive_hits: number;
  consecutive_misses: number;
  listing_count: number;
}

function toEntryState(row: EntryRow): EntryState & { id: string } {
  return {
    id: row.id,
    key: `${row.package_weight}::${row.match_key}`,
    canonicalStrainName: row.canonical_strain_name,
    packageWeight: row.package_weight,
    currentStatus: row.current_status,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastMissingAt: row.last_missing_at,
    returnedAt: row.returned_at,
    consecutiveHits: row.consecutive_hits,
    consecutiveMisses: row.consecutive_misses,
    listingCount: row.listing_count,
  };
}

/** All stored state for a dispensary, in the shape the status engine wants. */
export async function getEntryStates(dispensaryId: string): Promise<Array<EntryState & { id: string }>> {
  const { rows } = await query<EntryRow>(
    `SELECT id, canonical_strain_name, match_key, package_weight, current_status, first_seen_at,
            last_seen_at, last_missing_at, returned_at, consecutive_hits, consecutive_misses, listing_count
       FROM inventory_entries WHERE dispensary_id = $1`,
    [dispensaryId],
  );
  return rows.map(toEntryState);
}

export interface PublishSnapshotInput {
  dispensaryId: string;
  sourceId: string;
  crawlRunId: string;
  observedAt: Date;
  hash: string;
  parserVersion: string;
  itemCount: number;
  entries: readonly EntryState[];
  observations: readonly NormalizedObservation[];
  anomalyFlag: boolean;
  anomalyReason: string | null;
}

/**
 * Write a successful, anomaly-cleared snapshot and move public state to match.
 *
 * Everything here happens in one transaction: either the snapshot, the entry
 * state and the snapshot membership all land together, or the previous good
 * snapshot stays exactly as it was.
 */
export async function publishSnapshot(input: PublishSnapshotInput): Promise<string> {
  return withTransaction(async (client) => {
    const { rows: snapshotRows } = await client.query<{ id: string }>(
      `INSERT INTO inventory_snapshots (
         dispensary_id, source_id, crawl_run_id, observed_at, successful, item_count, hash,
         parser_version, published, published_at, anomaly_flag, anomaly_reason, review_state
       ) VALUES ($1,$2,$3,$4,true,$5,$6,$7,true,now(),$8,$9,'ACCEPTED')
       RETURNING id`,
      [
        input.dispensaryId,
        input.sourceId,
        input.crawlRunId,
        input.observedAt,
        input.itemCount,
        input.hash,
        input.parserVersion,
        input.anomalyFlag,
        input.anomalyReason,
      ],
    );
    const snapshotId = snapshotRows[0]?.id as string;

    for (const entry of input.entries) {
      const matchKey = strainMatchKey(entry.canonicalStrainName);
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO inventory_entries (
           dispensary_id, canonical_strain_name, match_key, package_weight, current_status,
           first_seen_at, last_seen_at, last_missing_at, returned_at, consecutive_hits,
           consecutive_misses, listing_count, last_snapshot_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (dispensary_id, package_weight, match_key) DO UPDATE SET
           canonical_strain_name = EXCLUDED.canonical_strain_name,
           current_status     = EXCLUDED.current_status,
           last_seen_at       = EXCLUDED.last_seen_at,
           last_missing_at    = EXCLUDED.last_missing_at,
           returned_at        = EXCLUDED.returned_at,
           consecutive_hits   = EXCLUDED.consecutive_hits,
           consecutive_misses = EXCLUDED.consecutive_misses,
           listing_count      = EXCLUDED.listing_count,
           last_snapshot_id   = EXCLUDED.last_snapshot_id,
           updated_at         = now()
         RETURNING id`,
        [
          input.dispensaryId,
          entry.canonicalStrainName,
          matchKey,
          entry.packageWeight,
          entry.currentStatus,
          entry.firstSeenAt,
          entry.lastSeenAt,
          entry.lastMissingAt,
          entry.returnedAt,
          entry.consecutiveHits,
          entry.consecutiveMisses,
          entry.listingCount,
          snapshotId,
        ],
      );

      // Snapshot membership records only what was observed in this snapshot.
      if (entry.consecutiveMisses === 0) {
        await client.query(
          `INSERT INTO snapshot_entries (snapshot_id, inventory_entry_id, canonical_strain_name, package_weight, listing_count)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (snapshot_id, inventory_entry_id) DO NOTHING`,
          [snapshotId, rows[0]?.id, entry.canonicalStrainName, entry.packageWeight, entry.listingCount],
        );
      }
    }

    for (const observation of input.observations) {
      await client.query(
        `INSERT INTO inventory_observations (
           crawl_run_id, snapshot_id, dispensary_id, source_item_id, raw_name, canonical_name, match_key,
           raw_weight, canonical_weight, product_type, flower_subtype, observed_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          input.crawlRunId,
          snapshotId,
          input.dispensaryId,
          observation.sourceItemId,
          observation.rawName,
          observation.canonicalName,
          strainMatchKey(observation.canonicalName),
          observation.rawWeight,
          observation.canonicalWeight,
          observation.productType,
          observation.flowerSubtype,
          input.observedAt,
        ],
      );
    }

    return snapshotId;
  });
}

/** Record a snapshot that must not move public state (blocked or failed). */
export async function recordUnpublishedSnapshot(input: {
  dispensaryId: string;
  sourceId: string;
  crawlRunId: string;
  observedAt: Date;
  successful: boolean;
  itemCount: number;
  hash: string;
  parserVersion: string;
  anomalyReason: string | null;
  reviewState: 'NEEDS_CONFIRMATION' | 'REJECTED';
}): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO inventory_snapshots (
       dispensary_id, source_id, crawl_run_id, observed_at, successful, item_count, hash,
       parser_version, published, anomaly_flag, anomaly_reason, review_state
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,true,$9,$10)
     RETURNING id`,
    [
      input.dispensaryId,
      input.sourceId,
      input.crawlRunId,
      input.observedAt,
      input.successful,
      input.itemCount,
      input.hash,
      input.parserVersion,
      input.anomalyReason,
      input.reviewState,
    ],
  );
  return rows[0]?.id as string;
}

// ---------------------------------------------------------------------------
// Public read paths. These only ever return factual observation fields.
// ---------------------------------------------------------------------------

export interface WeightCount {
  weight: CanonicalWeight;
  count: number;
}

export async function getWeightCounts(dispensaryId: string): Promise<WeightCount[]> {
  const { rows } = await query<{ package_weight: CanonicalWeight; count: number }>(
    `SELECT package_weight, count(*)::int AS count
       FROM inventory_entries
      WHERE dispensary_id = $1 AND current_status = ANY($2)
      GROUP BY package_weight`,
    [dispensaryId, CURRENT_STATUSES as unknown as string[]],
  );
  const byWeight = new Map(rows.map((row) => [row.package_weight, row.count]));
  return (['EIGHTH', 'QUARTER', 'HALF', 'OUNCE'] as CanonicalWeight[]).map((weight) => ({
    weight,
    count: byWeight.get(weight) ?? 0,
  }));
}

export interface PublicStrain {
  canonicalName: string;
  packageWeight: CanonicalWeight;
  badge: 'NEW' | 'RETURNED' | null;
  firstSeenAt: Date;
  lastSeenAt: Date | null;
  listingCount: number;
}

/** Alphabetical, always. Not by popularity, brand, potency or price. */
export async function getCurrentStrains(
  dispensaryId: string,
  weight: CanonicalWeight,
  now = new Date(),
): Promise<PublicStrain[]> {
  const { rows } = await query<EntryRow>(
    `SELECT id, canonical_strain_name, match_key, package_weight, current_status, first_seen_at,
            last_seen_at, last_missing_at, returned_at, consecutive_hits, consecutive_misses, listing_count
       FROM inventory_entries
      WHERE dispensary_id = $1 AND package_weight = $2 AND current_status = ANY($3)`,
    [dispensaryId, weight, CURRENT_STATUSES as unknown as string[]],
  );

  return rows
    .map((row) => ({
      canonicalName: row.canonical_strain_name,
      packageWeight: row.package_weight,
      badge: deriveBadge(
        { currentStatus: row.current_status, firstSeenAt: row.first_seen_at, returnedAt: row.returned_at },
        now,
      ),
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      listingCount: row.listing_count,
    }))
    .sort((a, b) => compareStrainNames(a.canonicalName, b.canonicalName));
}

export interface ChangeRow {
  canonicalName: string;
  packageWeight: CanonicalWeight;
  status: InventoryStatus;
  firstSeenAt: Date;
  lastSeenAt: Date | null;
}

export interface ChangesView {
  newlyListed: ChangeRow[];
  returned: ChangeRow[];
  noLongerListed: ChangeRow[];
}

export async function getChanges(dispensaryId: string, sinceDays = 14): Promise<ChangesView> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const { rows } = await query<EntryRow>(
    `SELECT id, canonical_strain_name, match_key, package_weight, current_status, first_seen_at,
            last_seen_at, last_missing_at, returned_at, consecutive_hits, consecutive_misses, listing_count
       FROM inventory_entries
      WHERE dispensary_id = $1
        AND current_status IN ('NEWLY_LISTED','RETURNED','NO_LONGER_LISTED')
        AND updated_at >= $2`,
    [dispensaryId, since],
  );

  const map = (row: EntryRow): ChangeRow => ({
    canonicalName: row.canonical_strain_name,
    packageWeight: row.package_weight,
    status: row.current_status,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  });
  const byName = (a: ChangeRow, b: ChangeRow) =>
    a.packageWeight.localeCompare(b.packageWeight) || compareStrainNames(a.canonicalName, b.canonicalName);

  return {
    newlyListed: rows.filter((r) => r.current_status === 'NEWLY_LISTED').map(map).sort(byName),
    returned: rows.filter((r) => r.current_status === 'RETURNED').map(map).sort(byName),
    noLongerListed: rows.filter((r) => r.current_status === 'NO_LONGER_LISTED').map(map).sort(byName),
  };
}

export interface InventoryHealth {
  lastSuccessAt: Date | null;
  lastAttemptAt: Date | null;
  hasApprovedSource: boolean;
  automationStatus: string | null;
}

export async function getInventoryHealth(dispensaryId: string): Promise<InventoryHealth> {
  const { rows } = await query<{
    last_success_at: Date | null;
    last_attempt_at: Date | null;
    automation_status: string;
    active: boolean;
  }>(
    `SELECT last_success_at, last_attempt_at, automation_status, active
       FROM inventory_sources
      WHERE dispensary_id = $1
      ORDER BY (active AND automation_status IN ('APPROVED','EXPLICIT_PERMISSION','API_LICENSED')) DESC,
               last_success_at DESC NULLS LAST
      LIMIT 1`,
    [dispensaryId],
  );
  const row = rows[0];
  if (!row) {
    return { lastSuccessAt: null, lastAttemptAt: null, hasApprovedSource: false, automationStatus: null };
  }
  return {
    lastSuccessAt: row.last_success_at,
    lastAttemptAt: row.last_attempt_at,
    hasApprovedSource:
      row.active && ['APPROVED', 'EXPLICIT_PERMISSION', 'API_LICENSED'].includes(row.automation_status),
    automationStatus: row.automation_status,
  };
}

/** Helper for tests and the worker: build a DedupedStrain key the same way. */
export function keyFor(weight: CanonicalWeight, name: string): string {
  return entryKey(weight, name);
}

export type { DedupedStrain };
