import {
  applySnapshot,
  classifyHttpFailure,
  dedupeObservations,
  evaluateAnomaly,
  evaluateSourceGate,
  payloadChecksum,
  previewDiff,
  resolveAlias,
  snapshotChecksum,
  type NormalizedObservation,
} from '@inventory-index/core';
import { aliases, config, crawlRuns, dispensaries, inventory, reviewQueue, snapshots, sources } from '@inventory-index/db';
import { getAdapter } from './adapters/registry.js';
import type { FetchContext, RawItem } from './adapters/types.js';
import { SourceAccessError } from './adapters/types.js';

export interface RunOptions {
  /** Plan and report without writing anything or making requests. */
  dryRun?: boolean;
  /** Overrides the observation timestamp; used by the seed and by tests. */
  observedAt?: Date;
  /** Adapter config overlaid on the stored parser_config. */
  parserConfigOverride?: Record<string, unknown>;
  now?: Date;
}

export interface RunOutcome {
  sourceId: string;
  dispensaryId: string;
  status: 'SUCCESS' | 'SKIPPED' | 'FAILED' | 'BLOCKED' | 'NEEDS_CONFIRMATION';
  detail: string;
  runId?: string;
  itemCount?: number;
  added?: number;
  removalCandidates?: number;
  noChange?: boolean;
}

/**
 * Observe one source, once.
 *
 * The order of the steps is the point of this function:
 *
 *   gate -> fetch -> parse -> normalise -> de-duplicate -> checksum ->
 *   anomaly check -> compare with the last published snapshot -> publish
 *
 * Anything that goes wrong before the anomaly check leaves published inventory
 * untouched. A failed observation is recorded as a failed observation; it is
 * never evidence that a retailer stopped listing something.
 */
export async function runSource(sourceId: string, options: RunOptions = {}): Promise<RunOutcome> {
  const now = options.now ?? new Date();
  const observedAt = options.observedAt ?? now;

  const source = await sources.getSource(sourceId);
  if (!source) return { sourceId, dispensaryId: '', status: 'SKIPPED', detail: 'Source not found.' };

  const dispensary = await dispensaries.getById(source.dispensary_id);
  if (!dispensary) {
    return { sourceId, dispensaryId: source.dispensary_id, status: 'SKIPPED', detail: 'Dispensary not found.' };
  }

  // ---- 1. The gate. Nothing below this line runs without an allowed verdict.
  const gate = evaluateSourceGate(sources.toGateInput(source), { now });
  const adapter = getAdapter(source.parser_adapter);

  if (!gate.allowed || !adapter) {
    const detail = adapter ? gate.detail : `No adapter registered for "${source.parser_adapter}".`;
    if (!options.dryRun) {
      const runId = await crawlRuns.startRun({
        sourceId,
        dispensaryId: dispensary.id,
        gateAllowed: false,
        gateReason: gate.reason,
        parserVersion: adapter?.version ?? 'none',
        startedAt: now,
      });
      await crawlRuns.finishRun({ runId, status: 'SKIPPED', errorCode: gate.reason, errorMessage: detail });
    }
    return { sourceId, dispensaryId: dispensary.id, status: 'SKIPPED', detail };
  }

  if (options.dryRun) {
    return {
      sourceId,
      dispensaryId: dispensary.id,
      status: 'SKIPPED',
      detail: `Dry run: would observe ${source.source_url} with ${adapter.version}.`,
    };
  }

  const runId = await crawlRuns.startRun({
    sourceId,
    dispensaryId: dispensary.id,
    gateAllowed: true,
    gateReason: gate.reason,
    parserVersion: adapter.version,
    startedAt: now,
  });
  await sources.recordAttempt(sourceId, now);

  const rawBodies: Array<{ url: string; body: string }> = [];
  const context: FetchContext = {
    sourceId,
    sourceUrl: source.source_url,
    parserConfig: { ...source.parser_config, ...(options.parserConfigOverride ?? {}) },
    userAgent: config.crawler.userAgent,
    networkEnabled: config.crawler.networkEnabled,
    onRawBody: (url, body) => rawBodies.push({ url, body }),
  };

  // ---- 2. Fetch, parse, normalise.
  let rawItems: RawItem[] = [];
  let httpStatus: number | null = null;
  let pagesRequested = 0;
  try {
    const fetched = await adapter.fetchInventory(context);
    httpStatus = fetched.httpStatus;
    pagesRequested = fetched.pagesRequested;
    rawItems = adapter.parseItems(fetched.payload, context);
  } catch (error) {
    return handleAccessFailure(error, { runId, sourceId, dispensaryId: dispensary.id, now, httpStatus });
  } finally {
    for (const raw of rawBodies) {
      await crawlRuns.storeRawArtifact({
        crawlRunId: runId,
        url: raw.url,
        contentHash: payloadChecksum(raw.body),
        byteSize: Buffer.byteLength(raw.body),
        // Kept briefly for parser debugging, then purged. Not an archive.
        body: raw.body,
        retentionHours: config.crawler.rawRetentionHours,
      });
    }
  }

  const aliasIndex = await aliases.getVerifiedAliasIndex();
  const normalized: NormalizedObservation[] = [];
  const lowConfidenceNames: Array<{ rawName: string; canonicalName: string }> = [];
  const unclassifiedWeights: Array<{ rawName: string; rawWeight: string | null }> = [];

  for (const item of rawItems) {
    const result = adapter.normalizeItem(item, context);
    // Only manually verified aliases are in the index, so this can only ever
    // apply a merge a human signed off on.
    const resolved = resolveAlias(result.canonicalName, aliasIndex);
    normalized.push({ ...result, canonicalName: resolved.canonicalName });
    if ('nameConfident' in result && result.nameConfident === false) {
      lowConfidenceNames.push({ rawName: result.rawName, canonicalName: result.canonicalName });
    }
    if (result.productType === 'FLOWER' && result.canonicalWeight === 'UNCLASSIFIED_WEIGHT') {
      unclassifiedWeights.push({ rawName: result.rawName, rawWeight: result.rawWeight });
    }
  }

  // ---- 3. Adapter-specific sanity checks. A snapshot that fails them is a
  // parser problem, not a retailer change, so nothing is published.
  const issues = adapter.validateSnapshot(normalized);
  if (issues.length > 0) {
    const detail = issues.map((issue) => `${issue.code}: ${issue.message}`).join('; ');
    await sources.recordFailure(sourceId, now);
    await crawlRuns.finishRun({
      runId,
      status: 'FAILED',
      httpStatus,
      pagesRequested,
      rawItemCount: rawItems.length,
      parsedItemCount: normalized.length,
      errorCode: 'VALIDATION_FAILED',
      errorMessage: detail,
    });
    await reviewQueue.enqueueReview({
      kind: 'SOURCE_FAILURE',
      dispensaryId: dispensary.id,
      sourceId,
      crawlRunId: runId,
      payload: { issues },
    });
    return { sourceId, dispensaryId: dispensary.id, status: 'FAILED', detail, runId };
  }

  // ---- 4. De-duplicate and fingerprint.
  const deduped = dedupeObservations(normalized);
  const checksum = snapshotChecksum(deduped.entries);
  const latestPublished = await snapshots.getLatestPublished(dispensary.id);
  const previousChecksum = latestPublished?.hash ?? null;
  const previousCount = latestPublished?.item_count ?? null;

  // ---- 5. Anomaly gate. A collapse in item count is treated as our bug until
  // a second observation says otherwise.
  const anomaly = evaluateAnomaly({ previousItemCount: previousCount, currentItemCount: deduped.entries.length });
  if (anomaly.blocked) {
    await inventory.recordUnpublishedSnapshot({
      dispensaryId: dispensary.id,
      sourceId,
      crawlRunId: runId,
      observedAt,
      successful: true,
      itemCount: deduped.entries.length,
      hash: checksum,
      parserVersion: adapter.version,
      anomalyReason: anomaly.detail,
      reviewState: 'NEEDS_CONFIRMATION',
    });
    await crawlRuns.finishRun({
      runId,
      status: 'NEEDS_CONFIRMATION',
      httpStatus,
      pagesRequested,
      rawItemCount: rawItems.length,
      parsedItemCount: normalized.length,
      acceptedItemCount: deduped.entries.length,
      rejectedItemCount: deduped.excluded.length + deduped.unclassified.length,
      checksum,
      previousChecksum,
      anomalyScore: anomaly.anomalyScore,
      anomalyReason: anomaly.detail,
    });
    await reviewQueue.enqueueReview({
      kind: 'ANOMALY',
      dispensaryId: dispensary.id,
      sourceId,
      crawlRunId: runId,
      payload: { previousCount, currentCount: deduped.entries.length, reason: anomaly.reason, detail: anomaly.detail },
    });
    // The previous good snapshot stays live and untouched.
    return {
      sourceId,
      dispensaryId: dispensary.id,
      status: 'NEEDS_CONFIRMATION',
      detail: anomaly.detail,
      runId,
      itemCount: deduped.entries.length,
    };
  }

  // ---- 6. Publish.
  const previousEntries = await inventory.getEntryStates(dispensary.id);
  const diff = previewDiff(previousEntries, deduped.entries);
  const applied = applySnapshot(previousEntries, deduped.entries, observedAt);

  await inventory.publishSnapshot({
    dispensaryId: dispensary.id,
    sourceId,
    crawlRunId: runId,
    observedAt,
    hash: checksum,
    parserVersion: adapter.version,
    itemCount: deduped.entries.length,
    entries: applied.entries,
    observations: normalized,
    anomalyFlag: anomaly.reason === 'large_increase',
    anomalyReason: anomaly.reason === 'ok' ? null : anomaly.detail,
  });

  await sources.recordSuccess(sourceId, now);
  await crawlRuns.finishRun({
    runId,
    status: 'SUCCESS',
    httpStatus,
    pagesRequested,
    rawItemCount: rawItems.length,
    parsedItemCount: normalized.length,
    acceptedItemCount: deduped.entries.length,
    rejectedItemCount: deduped.excluded.length + deduped.unclassified.length,
    checksum,
    previousChecksum,
    anomalyScore: anomaly.anomalyScore,
    anomalyReason: anomaly.reason === 'ok' ? null : anomaly.detail,
  });

  // ---- 7. Park anything we refused to guess at.
  for (const item of unclassifiedWeights.slice(0, 50)) {
    await reviewQueue.enqueueReview({
      kind: 'UNCLASSIFIED_WEIGHT',
      dispensaryId: dispensary.id,
      sourceId,
      crawlRunId: runId,
      payload: item,
    });
  }
  for (const item of lowConfidenceNames.slice(0, 50)) {
    await reviewQueue.enqueueReview({
      kind: 'LOW_CONFIDENCE_NAME',
      dispensaryId: dispensary.id,
      sourceId,
      crawlRunId: runId,
      payload: item,
    });
  }

  const noChange = previousChecksum === checksum;
  return {
    sourceId,
    dispensaryId: dispensary.id,
    status: 'SUCCESS',
    detail: noChange
      ? `No change: ${deduped.entries.length} entries, checksum unchanged.`
      : `${diff.added.length} newly listed, ${diff.returned.length} returned, ${diff.removalCandidates.length} missing.`,
    runId,
    itemCount: deduped.entries.length,
    added: diff.added.length,
    removalCandidates: diff.removalCandidates.length,
    noChange,
  };
}

/**
 * Every failure mode ends here, and every path through it leaves published
 * inventory exactly as it was.
 */
async function handleAccessFailure(
  error: unknown,
  ctx: { runId: string; sourceId: string; dispensaryId: string; now: Date; httpStatus: number | null },
): Promise<RunOutcome> {
  const accessError =
    error instanceof SourceAccessError
      ? error
      : new SourceAccessError((error as Error).message ?? 'Unknown error', 'UNKNOWN_ERROR');

  const failures = await sources.recordFailure(ctx.sourceId, ctx.now);

  let status: RunOutcome['status'] = 'FAILED';
  let detail = accessError.message;

  if (accessError.httpStatus) {
    const handling = classifyHttpFailure(accessError.httpStatus, accessError.retryAfterSeconds);
    detail = `${accessError.message} - ${handling.detail}`;
    if (handling.action === 'pause_source') {
      // An explicit refusal is the end of the conversation, not a puzzle.
      await sources.setAutomationStatus(
        ctx.sourceId,
        'PAUSED',
        'crawler',
        `Paused automatically after ${accessError.code}. Requires human review before any further access.`,
      );
      status = 'BLOCKED';
    }
  }

  // A challenge page is never worked around, and always pauses the source.
  const CHALLENGE_CODES = ['CLOUDFLARE_CHALLENGE', 'CAPTCHA', 'BOT_CHALLENGE', 'WAF_CHALLENGE', 'ACCESS_BLOCKED', 'AUTH_WALL'];
  if (CHALLENGE_CODES.includes(accessError.code)) {
    await sources.setAutomationStatus(
      ctx.sourceId,
      'PAUSED',
      'crawler',
      `Paused automatically: source presented ${accessError.code}. We do not work around access controls.`,
    );
    status = 'BLOCKED';
  }

  await crawlRuns.finishRun({
    runId: ctx.runId,
    status: status === 'BLOCKED' ? 'BLOCKED' : 'FAILED',
    httpStatus: accessError.httpStatus ?? ctx.httpStatus,
    errorCode: accessError.code,
    errorMessage: detail,
  });

  await reviewQueue.enqueueReview({
    kind: 'SOURCE_FAILURE',
    dispensaryId: ctx.dispensaryId,
    sourceId: ctx.sourceId,
    crawlRunId: ctx.runId,
    payload: { code: accessError.code, detail, consecutiveFailures: failures },
  });

  return { sourceId: ctx.sourceId, dispensaryId: ctx.dispensaryId, status, detail, runId: ctx.runId };
}
