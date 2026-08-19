import { closePool, config, sources } from '@inventory-index/db';
import { runSource } from './pipeline.js';
import { planDay, runDue, runMaintenance } from './scheduler.js';
import { seedInventory } from './seedInventory.js';

const USAGE = `
Inventory observation worker

  plan                       Show today's plan: which sources are due and when.
  run-due                    Observe every approved source whose slot has passed.
  run-source <source-id>     Observe one source now (still subject to the gate).
  maintenance                Purge expired raw fetch artifacts.
  seed-inventory             Replay the local fixtures to populate a dev database.
  schedule                   Long-running loop: run due sources every 15 minutes.

Flags
  --dry-run                  Plan and report without writing or fetching.
  --window 2-6               Confine observations to an hour window.
`;

function parseWindow(argv: string[]): { start: number; end: number } {
  const index = argv.indexOf('--window');
  if (index === -1) return { start: 0, end: 24 };
  const [start, end] = (argv[index + 1] ?? '0-24').split('-').map((value) => Number.parseInt(value, 10));
  return { start: Number.isFinite(start) ? (start as number) : 0, end: Number.isFinite(end) ? (end as number) : 24 };
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const command = argv[0] ?? 'plan';
  const dryRun = argv.includes('--dry-run');
  const window = parseWindow(argv);

  if (!config.crawler.networkEnabled) {
    console.log('[worker] CRAWLER_NETWORK_ENABLED is false: network adapters will refuse to fetch.');
  }

  switch (command) {
    case 'plan': {
      const plan = await planDay({ windowStartHour: window.start, windowEndHour: window.end });
      if (plan.length === 0) console.log('No source is currently approved for automation.');
      for (const item of plan) {
        console.log(`${item.slot}  ${item.due ? 'DUE    ' : 'waiting'}  ${item.sourceDomain}  (${item.gateReason})`);
      }
      return 0;
    }

    case 'run-due': {
      const outcomes = await runDue({ dryRun, windowStartHour: window.start, windowEndHour: window.end });
      if (outcomes.length === 0) console.log('Nothing due.');
      for (const outcome of outcomes) console.log(`${outcome.status.padEnd(19)} ${outcome.detail}`);
      await runMaintenance();
      return outcomes.some((outcome) => outcome.status === 'FAILED') ? 1 : 0;
    }

    case 'run-source': {
      const sourceId = argv[1];
      if (!sourceId) {
        console.error('run-source needs a source id.');
        return 2;
      }
      const outcome = await runSource(sourceId, { dryRun });
      console.log(`${outcome.status}: ${outcome.detail}`);
      return outcome.status === 'FAILED' ? 1 : 0;
    }

    case 'seed-inventory': {
      const outcomes = await seedInventory();
      console.log(`Replayed ${outcomes.length} fixture observations.`);
      return 0;
    }

    case 'maintenance': {
      const result = await runMaintenance();
      console.log(`Purged ${result.rawArtifactsPurged} expired raw fetch artifacts.`);
      return 0;
    }

    case 'list-sources': {
      for (const source of await sources.listSources()) {
        console.log(
          [
            source.id,
            source.automation_status.padEnd(20),
            source.active ? 'active  ' : 'inactive',
            source.parser_adapter.padEnd(20),
            source.source_url,
          ].join('  '),
        );
      }
      return 0;
    }

    case 'schedule': {
      console.log('[worker] scheduling loop started; checking every 15 minutes.');
      const tick = async () => {
        try {
          const outcomes = await runDue({ windowStartHour: window.start, windowEndHour: window.end });
          for (const outcome of outcomes) console.log(`[worker] ${outcome.status}: ${outcome.detail}`);
          await runMaintenance();
        } catch (error) {
          console.error('[worker] tick failed', error);
        }
      };
      await tick();
      setInterval(() => void tick(), 15 * 60 * 1000);
      return -1; // keep running
    }

    default:
      console.log(USAGE);
      return 2;
  }
}

main()
  .then(async (code) => {
    if (code >= 0) {
      await closePool();
      process.exit(code);
    }
  })
  .catch(async (error) => {
    console.error(error);
    await closePool();
    process.exit(1);
  });
