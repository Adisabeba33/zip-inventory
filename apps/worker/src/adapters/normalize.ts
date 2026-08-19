import {
  canonicalizeStrainName,
  classifyProduct,
  extractWeightFromTitle,
  normalizeWeight,
  resolveAlias,
  type NormalizedObservation,
  type StrainAlias,
} from '@inventory-index/core';
import type { RawItem } from './types.js';

export interface NormalizeOptions {
  /** Only manually verified aliases are ever in here. */
  aliasIndex?: Map<string, StrainAlias>;
  knownBrands?: readonly string[];
  brandPosition?: 'prefix' | 'suffix' | 'unknown';
  /** Set when the source's weight field is always grams. */
  weightFieldIsGrams?: boolean;
}

export interface NormalizeResult extends NormalizedObservation {
  nameConfident: boolean;
  weightReason: string;
}

/**
 * The shared normalisation path every adapter funnels through.
 *
 * It only reads the four fields the product needs. Price, potency, imagery and
 * description are not passed in and are not derivable from what is.
 */
export function normalizeRawItem(item: RawItem, options: NormalizeOptions = {}): NormalizeResult {
  const classification = classifyProduct(item.name, { category: item.category });

  // Prefer the source's own weight field; fall back to an explicit size in the
  // title. A title with no explicit size stays unclassified.
  const fromField = normalizeWeight(item.weight, { assumeGrams: options.weightFieldIsGrams === true });
  const weightMatch = fromField.weight === 'UNCLASSIFIED_WEIGHT' ? extractWeightFromTitle(item.name) : fromField;

  const parsed = canonicalizeStrainName(item.name, {
    brand: item.brand,
    knownBrands: options.knownBrands,
    brandPosition: options.brandPosition,
  });

  const aliased = options.aliasIndex
    ? resolveAlias(parsed.canonicalName, options.aliasIndex)
    : { canonicalName: parsed.canonicalName, appliedAlias: null };

  return {
    sourceItemId: item.sourceItemId,
    rawName: item.name,
    canonicalName: aliased.canonicalName,
    rawWeight: item.weight,
    canonicalWeight: weightMatch.weight,
    productType: classification.productType,
    flowerSubtype: classification.subtype === 'UNSPECIFIED' ? parsed.subtype : classification.subtype,
    nameConfident: parsed.confident,
    weightReason: weightMatch.reason,
  };
}
