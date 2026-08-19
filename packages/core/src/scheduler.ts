import { createHash } from 'node:crypto';

/**
 * Daily observation planning.
 *
 * Every approved source is observed about once every 24 hours, and the slot is
 * derived deterministically from the source id so the fleet is spread evenly
 * across the day instead of stampeding a hundred retailers at 02:00.
 */
export interface PlannedRun {
  sourceId: string;
  /** Minutes after local midnight. */
  minuteOfDay: number;
  /** "02:13" */
  label: string;
  scheduledAt: Date;
}

const MINUTES_PER_DAY = 24 * 60;

export function plannedMinuteOfDay(sourceId: string, windowStartHour = 0, windowEndHour = 24): number {
  const digest = createHash('sha256').update(sourceId).digest();
  const value = digest.readUInt32BE(0);
  const startMinute = windowStartHour * 60;
  const span = Math.max(1, (windowEndHour - windowStartHour) * 60);
  return (startMinute + (value % span)) % MINUTES_PER_DAY;
}

export function planRun(sourceId: string, day: Date, windowStartHour = 0, windowEndHour = 24): PlannedRun {
  const minuteOfDay = plannedMinuteOfDay(sourceId, windowStartHour, windowEndHour);
  const scheduledAt = new Date(day);
  scheduledAt.setHours(0, 0, 0, 0);
  scheduledAt.setMinutes(minuteOfDay);
  const hours = String(Math.floor(minuteOfDay / 60)).padStart(2, '0');
  const minutes = String(minuteOfDay % 60).padStart(2, '0');
  return { sourceId, minuteOfDay, label: `${hours}:${minutes}`, scheduledAt };
}

/**
 * Conservative retry ladder after a transient failure: half an hour, then two
 * hours, then six. After that the source waits for its next daily slot or for
 * an admin. We never hammer a source that is refusing us.
 */
export const RETRY_BACKOFF_MINUTES: readonly number[] = [30, 120, 360];

export function nextRetryAt(attempt: number, from: Date): Date | null {
  const minutes = RETRY_BACKOFF_MINUTES[attempt - 1];
  if (minutes === undefined) return null;
  return new Date(from.getTime() + minutes * 60 * 1000);
}

/** HTTP responses that must pause a source rather than trigger a retry. */
export const PAUSE_ON_STATUS: readonly number[] = [401, 403, 451];

/** HTTP responses that are transient and may be retried on the ladder. */
export const RETRYABLE_STATUS: readonly number[] = [408, 425, 429, 500, 502, 503, 504];

export interface FailureHandling {
  action: 'retry' | 'pause_source' | 'fail_run';
  detail: string;
}

export function classifyHttpFailure(status: number, retryAfterSeconds: number | null): FailureHandling {
  if (PAUSE_ON_STATUS.includes(status)) {
    return {
      action: 'pause_source',
      detail: `HTTP ${status} is an explicit refusal. Pausing the source; do not retry automatically.`,
    };
  }
  if (status === 429) {
    return {
      action: 'retry',
      detail: retryAfterSeconds
        ? `Rate limited. Honouring Retry-After of ${retryAfterSeconds}s.`
        : 'Rate limited. Backing off on the retry ladder.',
    };
  }
  if (RETRYABLE_STATUS.includes(status)) {
    return { action: 'retry', detail: `HTTP ${status} is transient.` };
  }
  return { action: 'fail_run', detail: `HTTP ${status}. Recording a failed run without changing inventory.` };
}
