import 'server-only';
import { evaluateFreshness, evaluateSourceGate } from '@inventory-index/core';
import { query, sources } from '@inventory-index/db';

export interface AdminOverview {
  dispensaries: { total: number; active: number };
  sourcesByStatus: Array<{ status: string; count: number }>;
  crawlable: number;
  openReviews: number;
  openCorrections: number;
  pendingSnapshots: number;
  runsLast24h: Array<{ status: string; count: number }>;
  reviewsDueSoon: number;
}

export async function getOverview(): Promise<AdminOverview> {
  const [dispensaryCounts, sourceStatuses, reviews, corrections, pending, runs, due] = await Promise.all([
    query<{ total: number; active: number }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE directory_active)::int AS active FROM dispensaries`,
    ),
    query<{ status: string; count: number }>(
      `SELECT automation_status AS status, count(*)::int FROM inventory_sources GROUP BY 1 ORDER BY 1`,
    ),
    query<{ count: number }>(`SELECT count(*)::int FROM review_queue WHERE status = 'OPEN'`),
    query<{ count: number }>(`SELECT count(*)::int FROM corrections WHERE status = 'OPEN'`),
    query<{ count: number }>(
      `SELECT count(*)::int FROM inventory_snapshots WHERE review_state = 'NEEDS_CONFIRMATION'`,
    ),
    query<{ status: string; count: number }>(
      `SELECT status, count(*)::int FROM crawl_runs WHERE started_at > now() - interval '24 hours' GROUP BY 1 ORDER BY 1`,
    ),
    query<{ count: number }>(
      `SELECT count(*)::int FROM inventory_sources
        WHERE next_review_due_at IS NOT NULL AND next_review_due_at < now() + interval '14 days'`,
    ),
  ]);

  return {
    dispensaries: dispensaryCounts.rows[0] ?? { total: 0, active: 0 },
    sourcesByStatus: sourceStatuses.rows,
    crawlable: (await sources.listCrawlableSources()).length,
    openReviews: reviews.rows[0]?.count ?? 0,
    openCorrections: corrections.rows[0]?.count ?? 0,
    pendingSnapshots: pending.rows[0]?.count ?? 0,
    runsLast24h: runs.rows,
    reviewsDueSoon: due.rows[0]?.count ?? 0,
  };
}

export interface AdminDispensaryRow {
  id: string;
  slug: string;
  display_name: string;
  city: string | null;
  zip: string | null;
  directory_active: boolean;
  license_status: string | null;
  latitude: number | null;
  longitude: number | null;
  source_id: string | null;
  automation_status: string | null;
  source_active: boolean | null;
  parser_adapter: string | null;
  last_success_at: Date | null;
  current_strains: number;
}

export async function listAdminDispensaries(): Promise<
  Array<AdminDispensaryRow & { freshness: string; gate: string }>
> {
  const { rows } = await query<AdminDispensaryRow & {
    terms_reviewed_at: Date | null;
    robots_reviewed_at: Date | null;
    allowed_frequency_hours: number | null;
    last_attempt_at: Date | null;
    consecutive_failures: number | null;
  }>(`
    SELECT d.id, d.slug, d.display_name, d.city, d.zip, d.directory_active, d.license_status,
           d.latitude, d.longitude,
           s.id AS source_id, s.automation_status, s.active AS source_active, s.parser_adapter,
           s.last_success_at, s.terms_reviewed_at, s.robots_reviewed_at, s.allowed_frequency_hours,
           s.last_attempt_at, s.consecutive_failures,
           COALESCE(e.current_strains, 0)::int AS current_strains
      FROM dispensaries d
      LEFT JOIN LATERAL (
        SELECT * FROM inventory_sources WHERE dispensary_id = d.id
        ORDER BY (active AND automation_status IN ('APPROVED','EXPLICIT_PERMISSION','API_LICENSED')) DESC,
                 last_success_at DESC NULLS LAST
        LIMIT 1
      ) s ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS current_strains FROM inventory_entries
         WHERE dispensary_id = d.id AND current_status IN ('LISTED_NOW','NEWLY_LISTED','RETURNED')
      ) e ON true
     ORDER BY d.display_name
  `);

  const now = new Date();
  return rows.map((row) => ({
    ...row,
    freshness: evaluateFreshness(row.last_success_at, now).state,
    gate: row.source_id
      ? evaluateSourceGate(
          {
            automationStatus: (row.automation_status ?? 'PENDING_REVIEW') as never,
            active: row.source_active ?? false,
            termsReviewedAt: row.terms_reviewed_at,
            robotsReviewedAt: row.robots_reviewed_at,
            allowedFrequencyHours: row.allowed_frequency_hours ?? 24,
            lastSuccessAt: row.last_success_at,
            lastAttemptAt: row.last_attempt_at,
            consecutiveFailures: row.consecutive_failures ?? 0,
          },
          { now },
        ).reason
      : 'no_source',
  }));
}

export interface DiffSummaryRow {
  slug: string;
  display_name: string;
  last_observed: Date | null;
  current_count: number;
  newly_listed: number;
  returned: number;
  no_longer_listed: number;
  previous_count: number | null;
}

/** One row per dispensary: yesterday's published count against today's. */
export async function listDiffSummaries(): Promise<DiffSummaryRow[]> {
  const { rows } = await query<DiffSummaryRow>(`
    SELECT d.slug, d.display_name,
           latest.observed_at AS last_observed,
           COALESCE(latest.item_count, 0)::int AS current_count,
           prev.item_count::int AS previous_count,
           COALESCE(counts.newly_listed, 0)::int AS newly_listed,
           COALESCE(counts.returned, 0)::int AS returned,
           COALESCE(counts.no_longer_listed, 0)::int AS no_longer_listed
      FROM dispensaries d
      LEFT JOIN LATERAL (
        SELECT observed_at, item_count FROM inventory_snapshots
         WHERE dispensary_id = d.id AND published ORDER BY observed_at DESC LIMIT 1
      ) latest ON true
      LEFT JOIN LATERAL (
        SELECT item_count FROM inventory_snapshots
         WHERE dispensary_id = d.id AND published ORDER BY observed_at DESC OFFSET 1 LIMIT 1
      ) prev ON true
      LEFT JOIN LATERAL (
        SELECT
          count(*) FILTER (WHERE current_status = 'NEWLY_LISTED') AS newly_listed,
          count(*) FILTER (WHERE current_status = 'RETURNED') AS returned,
          count(*) FILTER (WHERE current_status = 'NO_LONGER_LISTED') AS no_longer_listed
        FROM inventory_entries
        WHERE dispensary_id = d.id AND updated_at > now() - interval '14 days'
      ) counts ON true
     WHERE latest.observed_at IS NOT NULL
     ORDER BY latest.observed_at DESC
  `);
  return rows;
}

export interface SourceDetail {
  source: Awaited<ReturnType<typeof sources.getSource>>;
  dispensaryName: string | null;
  dispensarySlug: string | null;
  reviews: Array<{
    id: string;
    reviewed_at: Date;
    reviewed_by: string;
    automation_allowed: boolean;
    decision: string;
    decision_rationale: string;
    terms_url: string | null;
    terms_summary: string | null;
    robots_url: string | null;
    robots_summary: string | null;
    permission_type: string | null;
    permission_reference: string | null;
    next_review_due_at: Date;
  }>;
  recentRuns: Array<{
    id: string;
    started_at: Date;
    status: string;
    gate_reason: string;
    accepted_item_count: number;
    error_code: string | null;
    error_message: string | null;
  }>;
}

export async function getSourceDetail(sourceId: string): Promise<SourceDetail | null> {
  const source = await sources.getSource(sourceId);
  if (!source) return null;

  const [dispensary, reviews, runs] = await Promise.all([
    query<{ display_name: string; slug: string }>(
      'SELECT display_name, slug FROM dispensaries WHERE id = $1',
      [source.dispensary_id],
    ),
    query<SourceDetail['reviews'][number]>(
      `SELECT id, reviewed_at, reviewed_by, automation_allowed, decision, decision_rationale,
              terms_url, terms_summary, robots_url, robots_summary, permission_type, permission_reference,
              next_review_due_at
         FROM source_policy_reviews WHERE source_id = $1 ORDER BY reviewed_at DESC`,
      [sourceId],
    ),
    query<SourceDetail['recentRuns'][number]>(
      `SELECT id, started_at, status, gate_reason, accepted_item_count, error_code, error_message
         FROM crawl_runs WHERE source_id = $1 ORDER BY started_at DESC LIMIT 15`,
      [sourceId],
    ),
  ]);

  return {
    source,
    dispensaryName: dispensary.rows[0]?.display_name ?? null,
    dispensarySlug: dispensary.rows[0]?.slug ?? null,
    reviews: reviews.rows,
    recentRuns: runs.rows,
  };
}
