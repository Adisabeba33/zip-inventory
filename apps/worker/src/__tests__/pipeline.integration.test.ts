import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { closePool, query } from '@inventory-index/db';
import { runSource } from '../pipeline.js';

/**
 * Integration tests for the guarantees that matter most:
 *
 *   - an unapproved source is never fetched
 *   - a failed observation never changes published inventory
 *   - an implausible collapse in item count is held for a human
 *
 * They need a database. Point DATABASE_URL at a scratch Postgres and run
 * migrations first; without one the suite skips rather than failing.
 */
let databaseAvailable = false;

async function checkDatabase(): Promise<boolean> {
  try {
    await query('SELECT 1 FROM inventory_sources LIMIT 1');
    return true;
  } catch {
    return false;
  }
}

const SUFFIX = 'pipeline-integration-test';
const DAY_MS = 24 * 60 * 60 * 1000;
const BASE = new Date('2026-08-10T04:00:00Z');
/** Successive daily slots, so the per-source frequency limit is satisfied. */
const day = (n: number) => new Date(BASE.getTime() + n * DAY_MS);

async function reset(): Promise<{ dispensaryId: string; sourceId: string }> {
  await query('DELETE FROM dispensaries WHERE identity_key = $1', [SUFFIX]);
  const { rows } = await query<{ id: string }>(
    `INSERT INTO dispensaries (identity_key, slug, legal_name, display_name, city, state, zip, latitude, longitude)
     VALUES ($1, $1, 'Integration Test LLC', 'Integration Test Dispensary', 'Testville', 'NY', '10605', 41.0, -73.7)
     RETURNING id`,
    [SUFFIX],
  );
  const dispensaryId = rows[0]?.id as string;

  const source = await query<{ id: string }>(
    `INSERT INTO inventory_sources (
       dispensary_id, source_url, source_domain, parser_adapter, parser_config,
       automation_status, active, terms_reviewed_at, robots_reviewed_at, allowed_frequency_hours
     ) VALUES ($1, 'fixture://example-menu-anomaly.json', 'fixture.local', 'fixture',
               '{"file":"example-menu-anomaly.json","day":0}'::jsonb,
               'APPROVED', true, $2, $2, 24)
     RETURNING id`,
    [dispensaryId, day(0)],
  );
  return { dispensaryId, sourceId: source.rows[0]?.id as string };
}

async function currentEntries(dispensaryId: string): Promise<number> {
  const { rows } = await query<{ count: number }>(
    `SELECT count(*)::int FROM inventory_entries
      WHERE dispensary_id = $1 AND current_status IN ('LISTED_NOW','NEWLY_LISTED','RETURNED')`,
    [dispensaryId],
  );
  return rows[0]?.count ?? 0;
}

describe('observation pipeline', async () => {
  before(async () => {
    databaseAvailable = await checkDatabase();
  });

  after(async () => {
    if (databaseAvailable) await query('DELETE FROM dispensaries WHERE identity_key = $1', [SUFFIX]);
    await closePool();
  });

  it('publishes a healthy first snapshot', async (t) => {
    if (!databaseAvailable) return t.skip('no database');
    const { dispensaryId, sourceId } = await reset();

    const outcome = await runSource(sourceId, { parserConfigOverride: { day: 0 }, now: day(1) });
    assert.equal(outcome.status, 'SUCCESS');
    assert.equal(outcome.itemCount, 20);
    assert.equal(await currentEntries(dispensaryId), 20);
  });

  it('refuses to fetch a source whose automation is not approved', async (t) => {
    if (!databaseAvailable) return t.skip('no database');
    const { dispensaryId, sourceId } = await reset();
    await runSource(sourceId, { parserConfigOverride: { day: 0 }, now: day(1) });

    let offset = 2;
    for (const status of ['PENDING_REVIEW', 'AUTOMATION_PROHIBITED', 'PAUSED', 'LEGAL_HOLD']) {
      await query('UPDATE inventory_sources SET automation_status = $2 WHERE id = $1', [sourceId, status]);
      const outcome = await runSource(sourceId, { parserConfigOverride: { day: 1 }, now: day(offset++) });
      assert.equal(outcome.status, 'SKIPPED', `${status} must not be crawled`);
      // The refusal is recorded, and inventory is untouched.
      const { rows } = await query<{ gate_allowed: boolean; status: string }>(
        'SELECT gate_allowed, status FROM crawl_runs WHERE source_id = $1 ORDER BY started_at DESC LIMIT 1',
        [sourceId],
      );
      assert.equal(rows[0]?.gate_allowed, false);
      assert.equal(rows[0]?.status, 'SKIPPED');
      assert.equal(await currentEntries(dispensaryId), 20);
    }
  });

  it('leaves inventory untouched when an observation fails', async (t) => {
    if (!databaseAvailable) return t.skip('no database');
    const { dispensaryId, sourceId } = await reset();
    await runSource(sourceId, { parserConfigOverride: { day: 0 }, now: day(1) });
    const before = await currentEntries(dispensaryId);

    const outcome = await runSource(sourceId, {
      parserConfigOverride: { file: 'does-not-exist.json' },
      now: day(2),
    });
    assert.equal(outcome.status, 'FAILED');
    assert.equal(await currentEntries(dispensaryId), before, 'a failed crawl must not de-list anything');

    const { rows } = await query<{ status: string; error_code: string }>(
      'SELECT status, error_code FROM crawl_runs WHERE source_id = $1 ORDER BY started_at DESC LIMIT 1',
      [sourceId],
    );
    assert.equal(rows[0]?.status, 'FAILED');
    assert.equal(rows[0]?.error_code, 'CONFIG_ERROR');
  });

  it('holds an implausible collapse for confirmation instead of publishing it', async (t) => {
    if (!databaseAvailable) return t.skip('no database');
    const { dispensaryId, sourceId } = await reset();
    await runSource(sourceId, { parserConfigOverride: { day: 0 }, now: day(1) });

    // 20 entries down to 3 is the parser-regression shape, not 17 removals.
    const outcome = await runSource(sourceId, { parserConfigOverride: { day: 1 }, now: day(2) });
    assert.equal(outcome.status, 'NEEDS_CONFIRMATION');
    assert.equal(await currentEntries(dispensaryId), 20, 'the previous snapshot must stay live');

    const { rows } = await query<{ review_state: string; published: boolean }>(
      'SELECT review_state, published FROM inventory_snapshots WHERE dispensary_id = $1 ORDER BY observed_at DESC LIMIT 1',
      [dispensaryId],
    );
    assert.equal(rows[0]?.review_state, 'NEEDS_CONFIRMATION');
    assert.equal(rows[0]?.published, false);

    const queue = await query<{ count: number }>(
      `SELECT count(*)::int FROM review_queue WHERE dispensary_id = $1 AND kind = 'ANOMALY'`,
      [dispensaryId],
    );
    assert.ok((queue.rows[0]?.count ?? 0) > 0, 'an anomaly must reach the review queue');
  });

  it('honours the per-source frequency limit', async (t) => {
    if (!databaseAvailable) return t.skip('no database');
    const { sourceId } = await reset();
    await runSource(sourceId, { parserConfigOverride: { day: 0 }, now: day(1) });

    // The same day again, well inside the 24-hour window.
    const outcome = await runSource(sourceId, { parserConfigOverride: { day: 0 }, now: day(1) });
    assert.equal(outcome.status, 'SKIPPED');
    assert.match(outcome.detail, /allows one observation every/);
  });
});
