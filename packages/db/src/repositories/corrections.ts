import { query } from '../pool.js';
import { recordAudit } from './audit.js';

export const ISSUE_TYPES = [
  'WRONG_STRAIN',
  'WRONG_WEIGHT',
  'STALE_INVENTORY',
  'WRONG_ADDRESS',
  'DUPLICATE_STRAIN',
  'CRAWLER_OPT_OUT',
  'OTHER',
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export interface CorrectionRow {
  id: string;
  dispensary_id: string | null;
  dispensary_text: string | null;
  issue_type: IssueType;
  details: string;
  contact_email: string | null;
  status: 'OPEN' | 'IN_REVIEW' | 'ACTIONED' | 'DISMISSED';
  resolution: string | null;
  created_at: Date;
}

/**
 * Public submissions land here and nowhere else. Nothing a visitor or a
 * retailer submits changes production data without an admin acting on it.
 */
export async function submitCorrection(input: {
  dispensaryId?: string | null;
  dispensaryText?: string | null;
  issueType: IssueType;
  details: string;
  contactEmail?: string | null;
}): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO corrections (dispensary_id, dispensary_text, issue_type, details, contact_email)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [
      input.dispensaryId ?? null,
      input.dispensaryText ?? null,
      input.issueType,
      input.details,
      input.contactEmail ?? null,
    ],
  );
  return rows[0]?.id as string;
}

export async function listCorrections(status?: CorrectionRow['status']): Promise<CorrectionRow[]> {
  const { rows } = await query<CorrectionRow>(
    status
      ? 'SELECT * FROM corrections WHERE status = $1 ORDER BY created_at DESC'
      : 'SELECT * FROM corrections ORDER BY created_at DESC LIMIT 200',
    status ? [status] : [],
  );
  return rows;
}

export async function resolveCorrection(
  id: string,
  status: CorrectionRow['status'],
  actor: string,
  resolution: string,
): Promise<void> {
  await query(
    `UPDATE corrections SET status = $2, resolution = $3, reviewed_by = $4, reviewed_at = now() WHERE id = $1`,
    [id, status, resolution, actor],
  );
  await recordAudit({
    actor,
    action: 'correction.resolved',
    entityType: 'correction',
    entityId: id,
    afterState: { status },
    reason: resolution,
  });
}
