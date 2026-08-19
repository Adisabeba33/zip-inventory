/**
 * Presentation helpers.
 *
 * All wording here is observation wording. Nothing in this file can produce
 * "in stock", "sold out" or "available": the vocabulary is deliberately about
 * what a check saw and when it saw it.
 */
const TZ = 'America/New_York';

const timeFormat = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: TZ,
});

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: TZ,
});

const longDateFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: TZ,
});

function startOfDay(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: TZ,
  }).format(date);
  return new Date(`${parts}T00:00:00Z`).getTime();
}

/** "Today · 4:12 AM", "Yesterday · 11:40 PM", "Aug 16 · 3:02 AM". */
export function formatCheckTime(at: Date | null, now: Date = new Date()): string {
  if (!at) return 'never';
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  const time = timeFormat.format(at);
  if (days <= 0) return `Today · ${time}`;
  if (days === 1) return `Yesterday · ${time}`;
  return `${dateFormat.format(at)} · ${time}`;
}

/** "today", "yesterday", "3 days ago" - for the compact result cards. */
export function formatCheckDay(at: Date | null, now: Date = new Date()): string {
  if (!at) return 'not yet checked';
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** "Aug 19, 2026" */
export function formatDate(at: Date | null): string {
  return at ? longDateFormat.format(at) : 'unknown';
}

export function formatDateTime(at: Date | null): string {
  return at ? `${longDateFormat.format(at)} · ${timeFormat.format(at)}` : 'never';
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}
