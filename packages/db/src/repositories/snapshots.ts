import { query } from '../pool.js';
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
