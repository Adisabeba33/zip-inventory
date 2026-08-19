import { evaluateSourceGate, planRun } from '@inventory-index/core';
import { crawlRuns, sources } from '@inventory-index/db';
import { runSource, type RunOutcome } from './pipeline.js';

export interface ScheduleOptions {
  /** Confine observations to an off-peak window, e.g. 02:00-06:00. */
  windowStartHour?: number;
  windowEndHour?: number;
  now?: Date;
  dryRun?: boolean;
}

export interface PlannedSource {
  sourceId: string;
  dispensaryId: string;
  sourceDomain: string;
  slot: string;
  due: boolean;
  gateReason: string;
}

/**
 * Work out which approved sources are due, and when each one's daily slot is.
 *
 * Slots are derived from the source id, so the fleet spreads itself across the
 * window deterministically instead of every retailer being hit at once.
 */
export async function planDay(options: ScheduleOptions = {}): Promise<PlannedSource[]> {
  const now = options.now ?? new Date();
  const candidates = await sources.listCrawlableSources();

  return candidates.map((source) => {
    const gate = evaluateSourceGate(sources.toGateInput(source), { now });
    const plan = planRun(source.id, now, options.windowStartHour ?? 0, options.windowEndHour ?? 24);
    const slotPassed = now.getTime() >= plan.scheduledAt.getTime();
    return {
      sourceId: source.id,
      dispensaryId: source.dispensary_id,
      sourceDomain: source.source_domain,
      slot: plan.label,
      due: gate.allowed && slotPassed,
      gateReason: gate.allowed ? (slotPassed ? 'due' : `waiting for ${plan.label}`) : gate.reason,
    };
  });
}

/** Run every source whose slot has passed and whose gate allows it. */
export async function runDue(options: ScheduleOptions = {}): Promise<RunOutcome[]> {
  const plan = await planDay(options);
  const outcomes: RunOutcome[] = [];
  for (const item of plan) {
    if (!item.due) continue;
    // Sequential on purpose: one source at a time keeps request rates low and
    // makes the logs readable.
    outcomes.push(await runSource(item.sourceId, { now: options.now, dryRun: options.dryRun }));
  }
  return outcomes;
}

export interface MaintenanceResult {
  rawArtifactsPurged: number;
}

/** Housekeeping that must happen whether or not any source ran. */
export async function runMaintenance(now = new Date()): Promise<MaintenanceResult> {
  return { rawArtifactsPurged: await crawlRuns.purgeExpiredRawArtifacts(now) };
}
