import { compareStrainNames, pickDisplayName, strainMatchKey } from './strainName.js';
import { UNCLASSIFIED_WEIGHT, type CanonicalWeight, type NormalizedObservation } from './types.js';

export interface DedupedStrain {
  /** Stable key: canonical weight + conservative strain match key. */
  key: string;
  canonicalName: string;
  packageWeight: CanonicalWeight;
  /** How many source listings collapsed into this one public row. */
  listingCount: number;
  sourceItemIds: string[];
}

export interface DedupeResult {
  entries: DedupedStrain[];
  /** Items parked for admin review instead of published. */
  unclassified: NormalizedObservation[];
  /** Items excluded because they are not flower. */
  excluded: NormalizedObservation[];
}

export function entryKey(weight: CanonicalWeight, canonicalName: string): string {
  return `${weight}::${strainMatchKey(canonicalName)}`;
}

/**
 * Collapse a snapshot's observations to one row per (weight, cultivar).
 *
 * The public site answers "which strains are listed in this package size", so
 * the same cultivar from two producers, or as premium and as smalls, is one
 * row. listing_count keeps the multiplicity for internal use.
 */
export function dedupeObservations(observations: readonly NormalizedObservation[]): DedupeResult {
  const buckets = new Map<
    string,
    { weight: CanonicalWeight; names: string[]; sourceItemIds: string[] }
  >();
  const unclassified: NormalizedObservation[] = [];
  const excluded: NormalizedObservation[] = [];

  for (const observation of observations) {
    if (observation.productType !== 'FLOWER') {
      excluded.push(observation);
      continue;
    }
    if (observation.canonicalWeight === UNCLASSIFIED_WEIGHT) {
      unclassified.push(observation);
      continue;
    }
    const weight = observation.canonicalWeight;
    const key = entryKey(weight, observation.canonicalName);
    const bucket = buckets.get(key) ?? { weight, names: [], sourceItemIds: [] };
    bucket.names.push(observation.canonicalName);
    if (observation.sourceItemId) bucket.sourceItemIds.push(observation.sourceItemId);
    buckets.set(key, bucket);
  }

  const entries = [...buckets.entries()].map(([key, bucket]) => ({
    key,
    canonicalName: pickDisplayName(bucket.names),
    packageWeight: bucket.weight,
    listingCount: bucket.names.length,
    sourceItemIds: [...new Set(bucket.sourceItemIds)].sort(),
  }));

  entries.sort(
    (a, b) =>
      a.packageWeight.localeCompare(b.packageWeight) || compareStrainNames(a.canonicalName, b.canonicalName),
  );

  return { entries, unclassified, excluded };
}
