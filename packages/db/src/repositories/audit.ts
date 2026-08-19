import type { PoolClient } from 'pg';
import { query } from '../pool.js';

export interface AuditEntry {
  actor: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  reason?: string | null;
}

/**
 * Every administrative act that changes what the crawler may do, what the
 * public sees, or what the legal record says goes through here.
 */
export async function recordAudit(entry: AuditEntry, client?: PoolClient): Promise<void> {
  const sql = `
    INSERT INTO audit_log (actor, action, entity_type, entity_id, before_state, after_state, reason)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
  `;
  const params = [
    entry.actor,
    entry.action,
    entry.entityType,
    entry.entityId ?? null,
    entry.beforeState === undefined ? null : JSON.stringify(entry.beforeState),
    entry.afterState === undefined ? null : JSON.stringify(entry.afterState),
    entry.reason ?? null,
  ];
  if (client) await client.query(sql, params);
  else await query(sql, params);
}

export interface AuditRow {
  id: number;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  created_at: Date;
}

export async function listAudit(limit = 100): Promise<AuditRow[]> {
  const { rows } = await query<AuditRow>(
    'SELECT id, actor, action, entity_type, entity_id, reason, created_at FROM audit_log ORDER BY id DESC LIMIT $1',
    [limit],
  );
  return rows;
}
