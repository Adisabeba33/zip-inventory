export interface AnomalyInput {
  previousItemCount: number | null;
  currentItemCount: number;
  /** Fractional drop that blocks publication. 0.4 = a 40% shrink. */
  dropThreshold?: number;
}

export interface AnomalyResult {
  /** 0 = identical to the previous snapshot, 1 = everything disappeared. */
  anomalyScore: number;
  /** True when the snapshot must not be published without a human. */
  blocked: boolean;
  reason: 'ok' | 'first_snapshot' | 'large_drop' | 'emptied' | 'large_increase';
  detail: string;
}

export const DEFAULT_DROP_THRESHOLD = 0.4;

/**
 * A parser regression, a truncated page or a partially rendered menu all look
 * identical to "the retailer removed 123 items". We refuse to publish that
 * difference automatically: the snapshot is held as NEEDS_CONFIRMATION, the
 * previous good snapshot stays live, and the source is re-checked later.
 */
export function evaluateAnomaly(input: AnomalyInput): AnomalyResult {
  const threshold = input.dropThreshold ?? DEFAULT_DROP_THRESHOLD;
  const previous = input.previousItemCount;
  const current = input.currentItemCount;

  if (previous === null) {
    return {
      anomalyScore: 0,
      blocked: false,
      reason: 'first_snapshot',
      detail: 'No previous successful snapshot to compare against.',
    };
  }

  if (previous > 0 && current === 0) {
    return {
      anomalyScore: 1,
      blocked: true,
      reason: 'emptied',
      detail: `Previous snapshot had ${previous} items, this one parsed 0. Holding previous snapshot.`,
    };
  }

  if (previous === 0) {
    return { anomalyScore: 0, blocked: false, reason: 'ok', detail: 'Previous snapshot was empty.' };
  }

  const delta = (previous - current) / previous;
  const score = Math.max(0, Math.min(1, delta));

  if (delta > threshold) {
    return {
      anomalyScore: score,
      blocked: true,
      reason: 'large_drop',
      detail:
        `Item count fell from ${previous} to ${current} ` +
        `(-${Math.round(delta * 100)}%, threshold ${Math.round(threshold * 100)}%). ` +
        'Publication blocked pending confirmation.',
    };
  }

  // A sudden multiplication usually means duplicated pagination. Worth an
  // admin's eye, but it does not remove anything, so it is not blocking.
  if (current > previous * 3 && current - previous > 50) {
    return {
      anomalyScore: 0,
      blocked: false,
      reason: 'large_increase',
      detail: `Item count rose from ${previous} to ${current}. Flagged for review, not blocking.`,
    };
  }

  return { anomalyScore: score, blocked: false, reason: 'ok', detail: `Item count ${previous} -> ${current}.` };
}
