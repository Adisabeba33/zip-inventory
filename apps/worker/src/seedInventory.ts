import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sources } from '@inventory-index/db';
import { runSource, type RunOutcome } from './pipeline.js';

const FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Replay every day of each fixture source in order, back-dating the
 * observations so the seeded database shows a realistic history: newly listed
 * badges, a two-miss de-listing, and a strain coming back.
 *
 * Only fixture sources are touched, so this never makes a network request.
 */
export async function seedInventory(now = new Date()): Promise<RunOutcome[]> {
  const outcomes: RunOutcome[] = [];
  const fixtureSources = (await sources.listSources()).filter((source) => source.parser_adapter === 'fixture');

  for (const source of fixtureSources) {
    const file = String((source.parser_config as { file?: string }).file ?? 'example-menu.json');
    const fixture = JSON.parse(await readFile(join(FIXTURES_DIR, file), 'utf8')) as {
      days: Array<{ label: string }>;
    };

    // Harbor Line is seeded stale on purpose, to exercise the stale state.
    const stalenessDays = source.notes?.includes('stale') ? 3 : 0;

    for (let day = 0; day < fixture.days.length; day += 1) {
      const daysAgo = fixture.days.length - 1 - day + stalenessDays;
      const observedAt = new Date(now.getTime() - daysAgo * DAY_MS);
      const outcome = await runSource(source.id, {
        observedAt,
        now: observedAt,
        parserConfigOverride: { day },
      });
      outcomes.push(outcome);
      console.log(`[seed-inventory] ${source.source_url} ${fixture.days[day]?.label}: ${outcome.status} - ${outcome.detail}`);
    }
  }

  return outcomes;
}
