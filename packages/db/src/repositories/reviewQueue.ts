import { query } from '../pool.js';
import { recordAudit } from './audit.js';

export type ReviewKind =
  | 'UNCLASSIFIED_WEIGHT'
  | 'LOW_CONFIDENCE_NAME'
  | 'ANOMALY'
  | 'SOURCE_FAILURE'
  | 'ALIAS_SUGGESTION';

export interface ReviewRow {
  id: string;
  kind: ReviewKind;
  dispensary_id: string | null;
  source_id: string | null;
  crawl_run_id: string | null;
  payload: Record<string, unknown>;
  status: 'OPEN' | 'RESOLVED' | 'DISMISSED';
  created_at: Date;
}

/** Anything the parser refused to guess at ends up here rather than published. */
export async function enqueueReview(input: {
  kind: ReviewKind;
  dispensaryId?: string | null;
  sourceId?: string | null;
  crawlRunId?: string | null;
  payload: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO review_queue (kind, dispensary_id, source_id, crawl_run_id, payload)
     VALUES ($1,$2,$3,$4,$5)`,
    [
      input.kind,
      input.dispensaryId ?? null,
      input.sourceId ?? null,
      input.crawlRunId ?? null,
      JSON.stringify(input.payload),
    ],
  );
}

export async function listReviews(status: ReviewRow['status'] = 'OPEN', kind?: ReviewKind): Promise<ReviewRow[]> {
  const { rows } = await query<ReviewRow>(
    kind
      ? 'SELECT * FROM review_queue WHERE status = $1 AND kind = $2 ORDER BY created_at DESC LIMIT 200'
      : 'SELECT * FROM review_queue WHERE status = $1 ORDER BY created_at DESC LIMIT 200',
    kind ? [status, kind] : [status],
  );
  return rows;
}

export async function resolveReview(
  id: string,
  status: 'RESOLVED' | 'DISMISSED',
  actor: string,
  reason: string,
): Promise<void> {
  await query('UPDATE review_queue SET status = $2, resolved_by = $3, resolved_at = now() WHERE id = $1', [
    id,
    status,
    actor,
  ]);
  await recordAudit({ actor, action: `review.${status.toLowerCase()}`, entityType: 'review_queue', entityId: id, reason });
}
