import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Load the repository root .env once, if one exists. Deployments are expected
 * to inject real environment variables; this is a local-development nicety.
 */
function loadDotEnv(): void {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      try {
        process.loadEnvFile(candidate);
      } catch {
        // A malformed .env should not stop the process from booting.
      }
      return;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) return;
    dir = parent;
  }
}

loadDotEnv();

/**
 * Runtime configuration.
 *
 * The release gates (age gate, search indexing, public launch) are environment
 * flags rather than code branches so counsel can set the final mode without a
 * redesign, and so a staging deployment is the default posture.
 */
function bool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function int(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}

function str(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

export const config = {
  databaseUrl: str('DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/inventory_index'),

  serviceName: str('SERVICE_NAME', 'Inventory Index'),
  servicePublicUrl: str('SERVICE_PUBLIC_URL', 'http://localhost:3000'),

  /** Release gates. All default to the conservative setting. */
  ageGateEnabled: bool('AGE_GATE_ENABLED', true),
  publicIndexingEnabled: bool('PUBLIC_INDEXING_ENABLED', false),
  publicLaunchEnabled: bool('PUBLIC_LAUNCH_ENABLED', false),

  contact: {
    corrections: str('CONTACT_CORRECTIONS_EMAIL', 'corrections@example.com'),
    sourceOwner: str('CONTACT_SOURCE_OWNER_EMAIL', 'sources@example.com'),
    legal: str('CONTACT_LEGAL_EMAIL', 'legal@example.com'),
    crawler: str('CRAWLER_CONTACT_EMAIL', 'crawler@example.com'),
  },

  crawler: {
    userAgent: str(
      'CRAWLER_USER_AGENT',
      'InventoryIndexBot/1.0 (+http://localhost:3000/crawler; crawler@example.com)',
    ),
    maxRunsPerSourcePerDay: int('CRAWLER_MAX_RUNS_PER_SOURCE_PER_DAY', 1),
    rawRetentionHours: Math.min(72, int('RAW_RETENTION_HOURS', 48)),
    networkEnabled: bool('CRAWLER_NETWORK_ENABLED', false),
  },

  adminApiToken: str('ADMIN_API_TOKEN', ''),
} as const;

export type AppConfig = typeof config;
