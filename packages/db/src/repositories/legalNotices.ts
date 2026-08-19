import { query } from '../pool.js';
import { recordAudit } from './audit.js';

/**
 * Named slots for regulatory copy. Wording lives in the database so counsel
 * can change it centrally; nothing regulatory is hard-coded across the app.
 */
export const LEGAL_SLOTS = [
  'site_footer',
  'dispensary_page',
  'age_gate',
  'data_sources',
  'crawler_policy',
  'terms',
  'privacy',
  'part_129_disclosures',
] as const;
export type LegalSlot = (typeof LEGAL_SLOTS)[number];

export interface LegalNoticeRow {
  slot: string;
  title: string | null;
  body: string;
  variant: 'NEUTRAL' | 'WARNING' | 'LEGAL';
  enabled: boolean;
  updated_by: string | null;
  updated_at: Date;
}

export async function getNotice(slot: LegalSlot): Promise<LegalNoticeRow | null> {
  const { rows } = await query<LegalNoticeRow>('SELECT * FROM legal_notices WHERE slot = $1 AND enabled', [slot]);
  return rows[0] ?? null;
}

export async function getNotices(): Promise<LegalNoticeRow[]> {
  const { rows } = await query<LegalNoticeRow>('SELECT * FROM legal_notices ORDER BY slot');
  return rows;
}

export async function upsertNotice(
  slot: LegalSlot,
  input: { title?: string | null; body: string; variant?: LegalNoticeRow['variant']; enabled?: boolean },
  actor: string,
): Promise<void> {
  await query(
    `INSERT INTO legal_notices (slot, title, body, variant, enabled, updated_by, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,now())
     ON CONFLICT (slot) DO UPDATE SET
       title = EXCLUDED.title, body = EXCLUDED.body, variant = EXCLUDED.variant,
       enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [slot, input.title ?? null, input.body, input.variant ?? 'NEUTRAL', input.enabled ?? true, actor],
  );
  await recordAudit({
    actor,
    action: 'legal_notice.updated',
    entityType: 'legal_notice',
    entityId: slot,
    afterState: { title: input.title ?? null, variant: input.variant ?? 'NEUTRAL', enabled: input.enabled ?? true },
    reason: 'Legal copy updated through admin configuration.',
  });
}
