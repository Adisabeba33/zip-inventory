import { query, withTransaction } from '../pool.js';
import { recordAudit } from './audit.js';

export interface SnapshotRow {
  id: string;
  dispensary_id: string;
  source_id: string;
  crawl_run_id: string;
  observed_at: Date;
  successful: boolean;
  item_count: number;
  hash: string;
  parser_version: string;
  published: boolean;
  anomaly_flag: boolean;
  anomaly_reason: string | null;
  review_state: 'ACCEPTED' | 'NEEDS_CONFIRMATION' | 'REJECTED';
}

/** The snapshot the public site is currently serving for a dispensary. */
export async function getLatestPublished(dispensaryId: string): Promise<SnapshotRow | null> {
  const { rows } = await query<SnapshotRow>(
    `SELECT * FROM inventory_snapshots
      WHERE dispensary_id = $1 AND published AND successful
      ORDER BY observed_at DESC LIMIT 1`,
    [dispensaryId],
  );
  return rows[0] ?? null;
}

export async function getPreviousPublished(dispensaryId: string): Promise<SnapshotRow | null> {
  const { rows } = await query<SnapshotRow>(
    `SELECT * FROM inventory_snapshots
      WHERE dispensary_id = $1 AND published AND successful
      ORDER BY observed_at DESC OFFSET 1 LIMIT 1`,
    [dispensaryId],
  );
  return rows[0] ?? null;
}

export async function listPendingConfirmation(): Promise<SnapshotRow[]> {
  const { rows } = await query<SnapshotRow>(
    `SELECT * FROM inventory_snapshots WHERE review_state = 'NEEDS_CONFIRMATION' ORDER BY observed_at DESC`,
  );
  return rows;
}

export async function markReviewed(
  snapshotId: string,
  reviewState: 'ACCEPTED' | 'REJECTED',
  actor: string,
  reason: string,
): Promise<void> {
  await query(
    `UPDATE inventory_snapshots SET review_state = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $1`,
    [snapshotId, reviewState, actor],
  );
  await recordAudit({
    actor,
    action: `snapshot.${reviewState.toLowerCase()}`,
    entityType: 'inventory_snapshot',
    entityId: snapshotId,
    reason,
  });
}

/**
 * Accept a held snapshot.
 *
 * Recording the decision is not enough on its own: the next observation would
 * be measured against the same old baseline and blocked again. Accepting also
 * issues a one-shot override so the next successful run may publish past the
 * anomaly gate, and that override is itself audited and expires if unused.
 */
export async function acceptAnomaly(
  snapshotId: string,
  actor: string,
  reason: string,
  validForHours = 48,
): Promise<void> {
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ dispensary_id: string }>(
      `UPDATE inventory_snapshots
          SET review_state = 'ACCEPTED', reviewed_by = $2, reviewed_at = now()
        WHERE id = $1
        RETURNING dispensary_id`,
      [snapshotId, actor],
    );
    const dispensaryId = rows[0]?.dispensary_id;
    if (!dispensaryId) return;

    await client.query(
      `INSERT INTO anomaly_overrides (dispensary_id, snapshot_id, created_by, reason, expires_at)
       VALUES ($1,$2,$3,$4, now() + make_interval(hours => $5))`,
      [dispensaryId, snapshotId, actor, reason, validForHours],
    );

    await recordAudit(
      {
        actor,
        action: 'snapshot.anomaly_accepted',
        entityType: 'inventory_snapshot',
        entityId: snapshotId,
        afterState: { overrideValidForHours: validForHours },
        reason,
      },
      client,
    );
  });
}

export interface AnomalyOverride {
  id: string;
  reason: string;
  created_by: string;
  created_at: Date;
}

/** An unconsumed, unexpired override for this dispensary, if there is one. */
export async function findOpenAnomalyOverride(dispensaryId: string): Promise<AnomalyOverride | null> {
  const { rows } = await query<AnomalyOverride>(
    `SELECT id, reason, created_by, created_at
       FROM anomaly_overrides
      WHERE dispensary_id = $1 AND consumed_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1`,
    [dispensaryId],
  );
  return rows[0] ?? null;
}

export async function consumeAnomalyOverride(overrideId: string, crawlRunId: string): Promise<void> {
  await query(
    'UPDATE anomaly_overrides SET consumed_at = now(), consumed_run_id = $2 WHERE id = $1',
    [overrideId, crawlRunId],
  );
}
