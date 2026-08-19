import { buildAliasIndex, strainMatchKey, type StrainAlias } from '@inventory-index/core';
import { query } from '../pool.js';
import { recordAudit } from './audit.js';

export interface AliasRow {
  id: string;
  alias: string;
  alias_key: string;
  canonical_name: string;
  confidence: number;
  source: string;
  manually_verified: boolean;
  verified_by: string | null;
  verified_at: Date | null;
  notes: string | null;
  created_at: Date;
}

export async function listAliases(): Promise<AliasRow[]> {
  const { rows } = await query<AliasRow>('SELECT * FROM strain_aliases ORDER BY manually_verified, alias');
  return rows;
}

/** Only verified aliases reach the normalisation pipeline. */
export async function getVerifiedAliasIndex(): Promise<Map<string, StrainAlias>> {
  const { rows } = await query<AliasRow>('SELECT * FROM strain_aliases WHERE manually_verified');
  return buildAliasIndex(
    rows.map((row) => ({
      alias: row.alias,
      canonicalName: row.canonical_name,
      confidence: row.confidence,
      source: row.source,
      manuallyVerified: row.manually_verified,
    })),
  );
}

export async function suggestAlias(input: {
  alias: string;
  canonicalName: string;
  confidence: number;
  source: string;
  notes?: string;
}): Promise<void> {
  await query(
    `INSERT INTO strain_aliases (alias, alias_key, canonical_name, confidence, source, manually_verified, notes)
     VALUES ($1,$2,$3,$4,$5,false,$6)
     ON CONFLICT (alias_key) DO NOTHING`,
    [input.alias, strainMatchKey(input.alias), input.canonicalName, input.confidence, input.source, input.notes ?? null],
  );
}

/**
 * Publishing an alias merges two names on the public site, so it is an
 * explicit, audited, human act.
 */
export async function verifyAlias(id: string, actor: string, notes?: string): Promise<void> {
  await query(
    `UPDATE strain_aliases SET manually_verified = true, verified_by = $2, verified_at = now(), notes = COALESCE($3, notes)
      WHERE id = $1`,
    [id, actor, notes ?? null],
  );
  await recordAudit({
    actor,
    action: 'alias.verified',
    entityType: 'strain_alias',
    entityId: id,
    reason: notes ?? 'Alias verified for publication.',
  });
}

export async function unverifyAlias(id: string, actor: string, reason: string): Promise<void> {
  await query(
    'UPDATE strain_aliases SET manually_verified = false, verified_by = NULL, verified_at = NULL WHERE id = $1',
    [id],
  );
  await recordAudit({ actor, action: 'alias.unverified', entityType: 'strain_alias', entityId: id, reason });
}
