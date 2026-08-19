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

    // Replay day 0 a couple of times well before the labelled days, so the
    // baseline strains age past the seven-day NEW window. Otherwise every row
    // on the seeded site carries a badge, which is the opposite of the
    // intent: a badge should mark the exception, not decorate every line.
    const warmUpDays = [12, 11, 10];
    const plan: Array<{ day: number; daysAgo: number; label: string }> = [
      ...warmUpDays.map((daysAgo) => ({ day: 0, daysAgo: daysAgo + stalenessDays, label: 'warm-up' })),
      ...fixture.days.map((entry, day) => ({
        day,
        daysAgo: fixture.days.length - 1 - day + stalenessDays,
        label: entry.label,
      })),
    ];

    for (const step of plan) {
      const observedAt = new Date(now.getTime() - step.daysAgo * DAY_MS);
      const outcome = await runSource(source.id, {
        observedAt,
        now: observedAt,
        parserConfigOverride: { day: step.day },
      });
      outcomes.push(outcome);
      console.log(`[seed-inventory] ${source.source_url} ${step.label}: ${outcome.status} - ${outcome.detail}`);
    }
  }

  return outcomes;
}
