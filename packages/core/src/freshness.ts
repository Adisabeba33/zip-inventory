import type { FreshnessState } from './types.js';

export interface FreshnessRules {
  /** Older than this and the page says the data is stale. */
  staleAfterHours: number;
  /** Older than this and inventory is not presented as current at all. */
  unavailableAfterHours: number;
}

export const DEFAULT_FRESHNESS_RULES: FreshnessRules = {
  staleAfterHours: 48,
  unavailableAfterHours: 24 * 7,
};

export interface Freshness {
  state: FreshnessState;
  hoursSinceLastSuccess: number | null;
  /** True when the current inventory list may be shown as the current list. */
  showInventory: boolean;
}

/**
 * Freshness is derived from the last *successful* observation only. A run that
 * failed does not refresh this clock, which is what makes "Inventory check
 * delayed - last successful check Aug 18" honest.
 */
export function evaluateFreshness(
  lastSuccessAt: Date | null,
  now: Date,
  rules: FreshnessRules = DEFAULT_FRESHNESS_RULES,
): Freshness {
  if (!lastSuccessAt) {
    return { state: 'NEVER_CHECKED', hoursSinceLastSuccess: null, showInventory: false };
  }
  const hours = (now.getTime() - lastSuccessAt.getTime()) / (60 * 60 * 1000);
  if (hours > rules.unavailableAfterHours) {
    return { state: 'UNAVAILABLE', hoursSinceLastSuccess: hours, showInventory: false };
  }
  if (hours > rules.staleAfterHours) {
    return { state: 'STALE', hoursSinceLastSuccess: hours, showInventory: true };
  }
  return { state: 'FRESH', hoursSinceLastSuccess: hours, showInventory: true };
}
