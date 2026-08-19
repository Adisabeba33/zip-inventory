import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { config } from '@inventory-index/db';

export const ADMIN_COOKIE = 'inventory_index_admin';

export function isAdminConfigured(): boolean {
  return config.adminApiToken.length >= 16;
}

function tokensMatch(candidate: string): boolean {
  const expected = Buffer.from(config.adminApiToken);
  const actual = Buffer.from(candidate);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export async function isAdmin(): Promise<boolean> {
  if (!isAdminConfigured()) return false;
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  return typeof token === 'string' && tokensMatch(token);
}

/**
 * Every admin page and every admin action calls this first. There is no
 * read-only admin view: the dashboard exposes source policy state and
 * inventory controls, so it is all behind the same gate.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect('/admin/login');
}

/**
 * The actor recorded in the audit log. A shared token cannot identify a
 * person, so operators are expected to set ADMIN_ACTOR per deployment or to
 * move to per-user auth before this is used by more than one person.
 */
export function adminActor(): string {
  return process.env.ADMIN_ACTOR || 'admin';
}

export function verifyAdminToken(candidate: string): boolean {
  return isAdminConfigured() && tokensMatch(candidate);
}
