import { realpathSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, getPool } from './pool.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function migrate(): Promise<string[]> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort();
  const { rows } = await pool.query<{ version: string }>('SELECT version FROM schema_migrations');
  const applied = new Set(rows.map((row) => row.version));
  const ran: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      ran.push(file);
      console.log(`[migrate] applied ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
    } finally {
      client.release();
    }
  }

  if (ran.length === 0) console.log('[migrate] nothing to do');
  return ran;
}

const invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  migrate()
    .then(() => closePool())
    .catch(async (error) => {
      console.error(error);
      await closePool();
      process.exit(1);
    });
}
