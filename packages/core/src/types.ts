/**
 * Shared domain vocabulary for the Independent Dispensary Inventory Index.
 *
 * Everything in this package is deliberately pure: no database, no network, no
 * clock reads. The crawler and the web app both depend on it, so the rules that
 * carry legal weight (weight normalisation, the two-miss confirmation, anomaly
 * blocking) can be unit tested in isolation.
 */

/** The four canonical package sizes the MVP indexes, plus the escape hatch. */
export const CANONICAL_WEIGHTS = ['EIGHTH', 'QUARTER', 'HALF', 'OUNCE'] as const;
export type CanonicalWeight = (typeof CANONICAL_WEIGHTS)[number];

export const UNCLASSIFIED_WEIGHT = 'UNCLASSIFIED_WEIGHT';
export type PackageWeight = CanonicalWeight | typeof UNCLASSIFIED_WEIGHT;

export interface WeightPresentation {
  weight: CanonicalWeight;
  /** e.g. "1/8 oz" */
  ounceLabel: string;
  /** e.g. "3.5 g" */
  gramLabel: string;
  /** Nominal grams, used only for ordering and tolerance checks. */
  nominalGrams: number;
  sortOrder: number;
}

export const WEIGHT_PRESENTATION: Record<CanonicalWeight, WeightPresentation> = {
  EIGHTH: { weight: 'EIGHTH', ounceLabel: '1/8 oz', gramLabel: '3.5 g', nominalGrams: 3.5, sortOrder: 1 },
  QUARTER: { weight: 'QUARTER', ounceLabel: '1/4 oz', gramLabel: '7 g', nominalGrams: 7, sortOrder: 2 },
  HALF: { weight: 'HALF', ounceLabel: '1/2 oz', gramLabel: '14 g', nominalGrams: 14, sortOrder: 3 },
  OUNCE: { weight: 'OUNCE', ounceLabel: '1 oz', gramLabel: '28 g', nominalGrams: 28, sortOrder: 4 },
};

/**
 * Observation statuses. There is deliberately no SOLD_OUT: a crawler cannot
 * observe physical stock, only what a permitted source listed at check time.
 */
export const INVENTORY_STATUSES = [
  'LISTED_NOW',
  'NEWLY_LISTED',
  'NO_LONGER_LISTED',
  'RETURNED',
  'UNKNOWN',
  'STALE',
] as const;
export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];

/** Statuses that belong on the dispensary's CURRENT tab. */
export const CURRENT_STATUSES: readonly InventoryStatus[] = ['LISTED_NOW', 'NEWLY_LISTED', 'RETURNED'];

/** Automation gate for a single inventory source. */
export const AUTOMATION_STATUSES = [
  'PENDING_REVIEW',
  'APPROVED',
  'EXPLICIT_PERMISSION',
  'API_LICENSED',
  'AUTOMATION_PROHIBITED',
  'PAUSED',
  'LEGAL_HOLD',
] as const;
export type AutomationStatus = (typeof AUTOMATION_STATUSES)[number];

/** The only three states in which a crawler may make a request. */
export const CRAWL_PERMITTED_STATUSES: readonly AutomationStatus[] = [
  'APPROVED',
  'EXPLICIT_PERMISSION',
  'API_LICENSED',
];

export const PRODUCT_TYPES = ['FLOWER', 'EXCLUDED'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const FLOWER_SUBTYPES = ['WHOLE_FLOWER', 'SMALLS', 'GROUND', 'UNSPECIFIED'] as const;
export type FlowerSubtype = (typeof FLOWER_SUBTYPES)[number];

export const CRAWL_RUN_STATUSES = [
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'BLOCKED',
  'NEEDS_CONFIRMATION',
  'SKIPPED',
] as const;
export type CrawlRunStatus = (typeof CRAWL_RUN_STATUSES)[number];

export const FRESHNESS_STATES = ['FRESH', 'STALE', 'UNAVAILABLE', 'NEVER_CHECKED'] as const;
export type FreshnessState = (typeof FRESHNESS_STATES)[number];

/** A single normalised item pulled out of one permitted source response. */
export interface NormalizedObservation {
  sourceItemId: string | null;
  rawName: string;
  canonicalName: string;
  rawWeight: string | null;
  canonicalWeight: PackageWeight;
  productType: ProductType;
  flowerSubtype: FlowerSubtype;
}

/** Durable per-(dispensary, strain, weight) state. */
export interface InventoryEntryState {
  canonicalStrainName: string;
  packageWeight: CanonicalWeight;
  currentStatus: InventoryStatus;
  firstSeenAt: Date;
  lastSeenAt: Date | null;
  lastMissingAt: Date | null;
  consecutiveHits: number;
  consecutiveMisses: number;
  listingCount: number;
}
