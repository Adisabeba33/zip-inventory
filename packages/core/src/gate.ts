import { CRAWL_PERMITTED_STATUSES, type AutomationStatus } from './types.js';

export interface SourceGateInput {
  automationStatus: AutomationStatus;
  active: boolean;
  /** When the source's terms of service were last reviewed. */
  termsReviewedAt: Date | null;
  /** When the source's robots policy was last reviewed. */
  robotsReviewedAt: Date | null;
  /** Minimum gap between observations, in hours. */
  allowedFrequencyHours: number;
  lastSuccessAt: Date | null;
  lastAttemptAt: Date | null;
  consecutiveFailures: number;
}

export interface SourceGateOptions {
  /** How long a policy review stays valid. Terms change. */
  reviewValidityDays?: number;
  /** Failures before the source is parked until an admin looks at it. */
  maxConsecutiveFailures?: number;
  now?: Date;
}

export interface SourceGateResult {
  allowed: boolean;
  /** Machine-readable reason, recorded on the skipped crawl run. */
  reason:
    | 'allowed'
    | 'automation_not_permitted'
    | 'source_inactive'
    | 'policy_review_missing'
    | 'policy_review_expired'
    | 'frequency_not_elapsed'
    | 'too_many_failures';
  detail: string;
}

export const DEFAULT_REVIEW_VALIDITY_DAYS = 90;
export const DEFAULT_MAX_CONSECUTIVE_FAILURES = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The single decision point for "may the crawler touch this source right now".
 *
 * Everything about the crawler routes through here. There is no code path that
 * fetches a source without an allowed verdict, and the verdict is recorded on
 * the crawl run so the reason a request happened is auditable a year later.
 */
export function evaluateSourceGate(
  source: SourceGateInput,
  options: SourceGateOptions = {},
): SourceGateResult {
  const now = options.now ?? new Date();
  const validityDays = options.reviewValidityDays ?? DEFAULT_REVIEW_VALIDITY_DAYS;
  const maxFailures = options.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES;

  if (!CRAWL_PERMITTED_STATUSES.includes(source.automationStatus)) {
    return {
      allowed: false,
      reason: 'automation_not_permitted',
      detail: `automation_status is ${source.automationStatus}; only ${CRAWL_PERMITTED_STATUSES.join(', ')} may be crawled.`,
    };
  }

  if (!source.active) {
    return { allowed: false, reason: 'source_inactive', detail: 'Source is marked inactive.' };
  }

  if (!source.termsReviewedAt || !source.robotsReviewedAt) {
    return {
      allowed: false,
      reason: 'policy_review_missing',
      detail: 'Terms and robots policy must both be reviewed before automation runs.',
    };
  }

  const oldestReview = Math.min(source.termsReviewedAt.getTime(), source.robotsReviewedAt.getTime());
  const reviewAgeDays = (now.getTime() - oldestReview) / DAY_MS;
  if (reviewAgeDays > validityDays) {
    return {
      allowed: false,
      reason: 'policy_review_expired',
      detail: `Policy review is ${Math.floor(reviewAgeDays)} days old (limit ${validityDays}). Re-review before crawling.`,
    };
  }

  if (source.consecutiveFailures >= maxFailures) {
    return {
      allowed: false,
      reason: 'too_many_failures',
      detail: `${source.consecutiveFailures} consecutive failures; source is degraded and waiting for admin review.`,
    };
  }

  const lastTouch = source.lastAttemptAt ?? source.lastSuccessAt;
  if (lastTouch) {
    const elapsedHours = (now.getTime() - lastTouch.getTime()) / (60 * 60 * 1000);
    if (elapsedHours < source.allowedFrequencyHours) {
      return {
        allowed: false,
        reason: 'frequency_not_elapsed',
        detail: `Last attempt was ${elapsedHours.toFixed(1)}h ago; this source allows one observation every ${source.allowedFrequencyHours}h.`,
      };
    }
  }

  return { allowed: true, reason: 'allowed', detail: 'Source is approved, reviewed and due.' };
}
