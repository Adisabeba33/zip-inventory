import type { CrawlRunStatus } from '@inventory-index/core';
import { query } from '../pool.js';

export interface CrawlRunRow {
  id: string;
  source_id: string;
  dispensary_id: string;
  started_at: Date;
  completed_at: Date | null;
  status: CrawlRunStatus;
  gate_allowed: boolean;
  gate_reason: string;
  http_status: number | null;
  pages_requested: number;
  raw_item_count: number;
  parsed_item_count: number;
  accepted_item_count: number;
  rejected_item_count: number;
  checksum: string | null;
  previous_checksum: string | null;
  anomaly_score: number | null;
  anomaly_reason: string | null;
  parser_version: string | null;
  error_code: string | null;
  error_message: string | null;
}

export interface StartRunInput {
  sourceId: string;
  dispensaryId: string;
  gateAllowed: boolean;
  gateReason: string;
  parserVersion: string;
  startedAt?: Date;
}

export async function startRun(input: StartRunInput): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO crawl_runs (source_id, dispensary_id, started_at, status, gate_allowed, gate_reason, parser_version,
                             policy_review_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,
             (SELECT id FROM source_policy_reviews WHERE source_id = $1 ORDER BY reviewed_at DESC LIMIT 1))
     RETURNING id`,
    [
      input.sourceId,
      input.dispensaryId,
      input.startedAt ?? new Date(),
      input.gateAllowed ? 'RUNNING' : 'SKIPPED',
      input.gateAllowed,
      input.gateReason,
      input.parserVersion,
    ],
  );
  return rows[0]?.id as string;
}

export interface FinishRunInput {
  runId: string;
  status: CrawlRunStatus;
  httpStatus?: number | null;
  pagesRequested?: number;
  rawItemCount?: number;
  parsedItemCount?: number;
  acceptedItemCount?: number;
  rejectedItemCount?: number;
  checksum?: string | null;
  previousChecksum?: string | null;
  anomalyScore?: number | null;
  anomalyReason?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export async function finishRun(input: FinishRunInput): Promise<void> {
  await query(
    `UPDATE crawl_runs SET
       completed_at = now(),
       status = $2,
       http_status = $3,
       pages_requested = COALESCE($4, pages_requested),
       raw_item_count = COALESCE($5, raw_item_count),
       parsed_item_count = COALESCE($6, parsed_item_count),
       accepted_item_count = COALESCE($7, accepted_item_count),
       rejected_item_count = COALESCE($8, rejected_item_count),
       checksum = $9,
       previous_checksum = $10,
       anomaly_score = $11,
       anomaly_reason = $12,
       error_code = $13,
       error_message = $14
     WHERE id = $1`,
    [
      input.runId,
      input.status,
      input.httpStatus ?? null,
      input.pagesRequested ?? null,
      input.rawItemCount ?? null,
      input.parsedItemCount ?? null,
      input.acceptedItemCount ?? null,
      input.rejectedItemCount ?? null,
      input.checksum ?? null,
      input.previousChecksum ?? null,
      input.anomalyScore ?? null,
      input.anomalyReason ?? null,
      input.errorCode ?? null,
      input.errorMessage ?? null,
    ],
  );
}

export async function listRuns(limit = 100, sourceId?: string): Promise<CrawlRunRow[]> {
  const { rows } = await query<CrawlRunRow>(
    sourceId
      ? 'SELECT * FROM crawl_runs WHERE source_id = $2 ORDER BY started_at DESC LIMIT $1'
      : 'SELECT * FROM crawl_runs ORDER BY started_at DESC LIMIT $1',
    sourceId ? [limit, sourceId] : [limit],
  );
  return rows;
}

/**
 * Store a fetched body for parser debugging with a hard expiry. Bodies are
 * purged by purgeExpiredRawArtifacts; we keep the hash afterwards so a run can
 * still be reasoned about without retaining anyone's page.
 */
export async function storeRawArtifact(input: {
  crawlRunId: string;
  url: string;
  contentHash: string;
  byteSize: number;
  body: string | null;
  retentionHours: number;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + Math.min(72, input.retentionHours) * 60 * 60 * 1000);
  await query(
    `INSERT INTO raw_fetch_artifacts (crawl_run_id, url, content_hash, byte_size, body, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [input.crawlRunId, input.url, input.contentHash, input.byteSize, input.body, expiresAt],
  );
}

export async function purgeExpiredRawArtifacts(now = new Date()): Promise<number> {
  const { rowCount } = await query(
    `UPDATE raw_fetch_artifacts
        SET body = NULL, purged_at = now()
      WHERE purged_at IS NULL AND expires_at <= $1`,
    [now],
  );
  return rowCount ?? 0;
}
