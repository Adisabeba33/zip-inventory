import type { AutomationStatus, SourceGateInput } from '@inventory-index/core';
import { query, withTransaction } from '../pool.js';
import { recordAudit } from './audit.js';

export interface SourceRow {
  id: string;
  dispensary_id: string;
  source_url: string;
  source_domain: string;
  source_owner: string | null;
  source_type: string;
  source_platform: string | null;
  terms_url: string | null;
  robots_url: string | null;
  terms_reviewed_at: Date | null;
  robots_reviewed_at: Date | null;
  automation_status: AutomationStatus;
  permission_type: string | null;
  permission_reference: string | null;
  allowed_frequency_hours: number;
  parser_adapter: string;
  parser_config: Record<string, unknown>;
  active: boolean;
  last_success_at: Date | null;
  last_failure_at: Date | null;
  last_attempt_at: Date | null;
  consecutive_failures: number;
  next_review_due_at: Date | null;
  notes: string | null;
}

export function toGateInput(row: SourceRow): SourceGateInput {
  return {
    automationStatus: row.automation_status,
    active: row.active,
    termsReviewedAt: row.terms_reviewed_at,
    robotsReviewedAt: row.robots_reviewed_at,
    allowedFrequencyHours: row.allowed_frequency_hours,
    lastSuccessAt: row.last_success_at,
    lastAttemptAt: row.last_attempt_at,
    consecutiveFailures: row.consecutive_failures,
  };
}

export async function listSources(): Promise<SourceRow[]> {
  const { rows } = await query<SourceRow>('SELECT * FROM inventory_sources ORDER BY source_domain, id');
  return rows;
}

export async function getSource(id: string): Promise<SourceRow | null> {
  const { rows } = await query<SourceRow>('SELECT * FROM inventory_sources WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function getSourcesForDispensary(dispensaryId: string): Promise<SourceRow[]> {
  const { rows } = await query<SourceRow>(
    'SELECT * FROM inventory_sources WHERE dispensary_id = $1 ORDER BY created_at',
    [dispensaryId],
  );
  return rows;
}

/**
 * Sources the scheduler is even allowed to consider. The full gate still runs
 * per source before any request; this only narrows the candidate set.
 */
export async function listCrawlableSources(): Promise<SourceRow[]> {
  const { rows } = await query<SourceRow>(
    `SELECT * FROM inventory_sources
      WHERE active
        AND automation_status IN ('APPROVED','EXPLICIT_PERMISSION','API_LICENSED')
      ORDER BY id`,
  );
  return rows;
}

export async function recordAttempt(sourceId: string, at: Date): Promise<void> {
  await query('UPDATE inventory_sources SET last_attempt_at = $2, updated_at = now() WHERE id = $1', [
    sourceId,
    at,
  ]);
}

export async function recordSuccess(sourceId: string, at: Date): Promise<void> {
  await query(
    `UPDATE inventory_sources
        SET last_success_at = $2, consecutive_failures = 0, updated_at = now()
      WHERE id = $1`,
    [sourceId, at],
  );
}

export async function recordFailure(sourceId: string, at: Date): Promise<number> {
  const { rows } = await query<{ consecutive_failures: number }>(
    `UPDATE inventory_sources
        SET last_failure_at = $2, consecutive_failures = consecutive_failures + 1, updated_at = now()
      WHERE id = $1
      RETURNING consecutive_failures`,
    [sourceId, at],
  );
  return rows[0]?.consecutive_failures ?? 0;
}

/**
 * Pause a source. Called automatically on an explicit refusal (401/403/451)
 * and manually when a source owner asks us to stop. We do not argue with a
 * source owner technically; we stop and route the question to legal.
 */
export async function setAutomationStatus(
  sourceId: string,
  status: AutomationStatus,
  actor: string,
  reason: string,
): Promise<void> {
  await withTransaction(async (client) => {
    const before = await client.query('SELECT automation_status, active FROM inventory_sources WHERE id = $1', [
      sourceId,
    ]);
    const permitted = ['APPROVED', 'EXPLICIT_PERMISSION', 'API_LICENSED'].includes(status);
    await client.query(
      `UPDATE inventory_sources
          SET automation_status = $2,
              active = CASE WHEN $3 THEN active ELSE false END,
              updated_at = now()
        WHERE id = $1`,
      [sourceId, status, permitted],
    );
    await recordAudit(
      {
        actor,
        action: 'source.automation_status.set',
        entityType: 'inventory_source',
        entityId: sourceId,
        beforeState: before.rows[0] ?? null,
        afterState: { automation_status: status },
        reason,
      },
      client,
    );
  });
}

export interface PolicyReviewInput {
  sourceId: string;
  reviewedBy: string;
  sourceOwnerDetermined: string | null;
  termsUrl: string | null;
  termsChecked: boolean;
  termsSummary: string | null;
  robotsUrl: string | null;
  robotsChecked: boolean;
  robotsSummary: string | null;
  apiDocsUrl: string | null;
  automationAllowed: boolean;
  decision: string;
  decisionRationale: string;
  permissionType: string | null;
  permissionReference: string | null;
  allowedFrequencyHours: number;
  reviewValidityDays?: number;
}

/**
 * Record a source policy review and, only if it permits automation, move the
 * source into a crawlable state. This is the only way a source becomes
 * crawlable: there is no direct "enable" that skips the review record.
 */
export async function recordPolicyReview(input: PolicyReviewInput, now = new Date()): Promise<string> {
  const validityDays = input.reviewValidityDays ?? 90;
  const nextReviewDue = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

  return withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO source_policy_reviews (
         source_id, reviewed_at, reviewed_by, source_owner_determined, terms_url, terms_checked,
         terms_summary, robots_url, robots_checked, robots_summary, api_docs_url,
         automation_allowed, decision, decision_rationale, permission_type, permission_reference,
         allowed_frequency_hours, next_review_due_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING id`,
      [
        input.sourceId,
        now,
        input.reviewedBy,
        input.sourceOwnerDetermined,
        input.termsUrl,
        input.termsChecked,
        input.termsSummary,
        input.robotsUrl,
        input.robotsChecked,
        input.robotsSummary,
        input.apiDocsUrl,
        input.automationAllowed,
        input.decision,
        input.decisionRationale,
        input.permissionType,
        input.permissionReference,
        input.allowedFrequencyHours,
        nextReviewDue,
      ],
    );

    await client.query(
      `UPDATE inventory_sources
          SET source_owner = COALESCE($2, source_owner),
              terms_url = COALESCE($3, terms_url),
              robots_url = COALESCE($4, robots_url),
              terms_reviewed_at = CASE WHEN $5 THEN $9 ELSE terms_reviewed_at END,
              robots_reviewed_at = CASE WHEN $6 THEN $9 ELSE robots_reviewed_at END,
              permission_type = COALESCE($7, permission_type),
              permission_reference = COALESCE($8, permission_reference),
              allowed_frequency_hours = $10,
              next_review_due_at = $11,
              updated_at = now()
        WHERE id = $1`,
      [
        input.sourceId,
        input.sourceOwnerDetermined,
        input.termsUrl,
        input.robotsUrl,
        input.termsChecked,
        input.robotsChecked,
        input.permissionType,
        input.permissionReference,
        now,
        input.allowedFrequencyHours,
        nextReviewDue,
      ],
    );

    if (!input.automationAllowed) {
      await client.query(
        `UPDATE inventory_sources
            SET automation_status = 'AUTOMATION_PROHIBITED', active = false, updated_at = now()
          WHERE id = $1`,
        [input.sourceId],
      );
    }

    await recordAudit(
      {
        actor: input.reviewedBy,
        action: 'source.policy_review.recorded',
        entityType: 'inventory_source',
        entityId: input.sourceId,
        afterState: { automationAllowed: input.automationAllowed, decision: input.decision },
        reason: input.decisionRationale,
      },
      client,
    );

    return rows[0]?.id as string;
  });
}

/**
 * Turn automation on. Refuses unless the latest policy review permits it, so
 * "enable" can never run ahead of the paperwork.
 */
export async function enableAutomation(
  sourceId: string,
  status: Extract<AutomationStatus, 'APPROVED' | 'EXPLICIT_PERMISSION' | 'API_LICENSED'>,
  actor: string,
): Promise<{ enabled: boolean; reason: string }> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ automation_allowed: boolean; next_review_due_at: Date }>(
      `SELECT automation_allowed, next_review_due_at
         FROM source_policy_reviews
        WHERE source_id = $1
        ORDER BY reviewed_at DESC
        LIMIT 1`,
      [sourceId],
    );
    const review = rows[0];
    if (!review) {
      return { enabled: false, reason: 'No source policy review on file. Review the source first.' };
    }
    if (!review.automation_allowed) {
      return { enabled: false, reason: 'The latest policy review does not permit automated access.' };
    }
    if (review.next_review_due_at.getTime() < Date.now()) {
      return { enabled: false, reason: 'The policy review has expired. Re-review before enabling.' };
    }

    await client.query(
      `UPDATE inventory_sources SET automation_status = $2, active = true, updated_at = now() WHERE id = $1`,
      [sourceId, status],
    );
    await recordAudit(
      {
        actor,
        action: 'source.automation.enabled',
        entityType: 'inventory_source',
        entityId: sourceId,
        afterState: { automation_status: status, active: true },
        reason: 'Enabled against a current policy review.',
      },
      client,
    );
    return { enabled: true, reason: 'Automation enabled.' };
  });
}
