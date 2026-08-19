import { normalizeWeight } from './weights.js';
import { UNCLASSIFIED_WEIGHT, type FlowerSubtype } from './types.js';

export interface CanonicalizeOptions {
  /** Brand reported by the source in its own field. The reliable path. */
  brand?: string | null;
  /** Additional brand names known for this source, matched segment-wise. */
  knownBrands?: readonly string[];
  /**
   * Where a source's titles put the brand when it is not in its own field.
   * "prefix" (Brand - Strain - Size) is the common menu convention.
   */
  brandPosition?: 'prefix' | 'suffix' | 'unknown';
}

export interface CanonicalStrainResult {
  canonicalName: string;
  /**
   * False when the parser had to choose between several plausible segments, or
   * when stripping left nothing behind. Low-confidence names are surfaced in
   * the admin review queue rather than silently published as a new cultivar.
   */
  confident: boolean;
  /** Segments the parser discarded, for audit and review. */
  removed: string[];
  /** Other segments that could have been the cultivar name. */
  alternatives: string[];
  subtype: FlowerSubtype;
}

/**
 * Whole-segment noise. These are packaging, tier and category words - never a
 * cultivar on their own. A segment made up entirely of these is dropped.
 */
const NOISE_WORDS = new Set([
  'flower',
  'flowers',
  'premium',
  'premium flower',
  'top shelf',
  'topshelf',
  'top-shelf',
  'indoor',
  'outdoor',
  'greenhouse',
  'green house',
  'sungrown',
  'sun grown',
  'craft',
  'whole',
  'whole flower',
  'whole bud',
  'bud',
  'buds',
  'nug',
  'nugs',
  'smalls',
  'small',
  'small buds',
  'popcorn',
  'ground',
  'ground flower',
  'milled',
  'prepack',
  'pre-pack',
  'prepackaged',
  'pre-packaged',
  'packaged',
  'packaged flower',
  'bulk',
  'deli',
  'jar',
  'bag',
  'pouch',
  'indica',
  'sativa',
  'hybrid',
  'indica dominant',
  'sativa dominant',
  'hybrid dominant',
  'indica-dominant',
  'sativa-dominant',
  'hybrid-dominant',
  'strain',
  'cannabis',
  'marijuana',
  'thc',
  'cbd',
  'new',
  'value',
  'house',
  'tier 1',
  'tier 2',
  'tier 3',
  'tier one',
  'tier two',
  'tier three',
  'net wt',
  'net weight',
  'each',
  'ea',
]);

/** Words safe to shave off the front or back of an otherwise real name. */
const EDGE_NOISE = new Set([
  'flower',
  'flowers',
  'premium',
  'indoor',
  'outdoor',
  'greenhouse',
  'sungrown',
  'craft',
  'whole',
  'smalls',
  'ground',
  'milled',
  'prepack',
  'prepackaged',
  'packaged',
  'bulk',
  'nug',
  'nugs',
  'bud',
  'buds',
  'indica',
  'sativa',
  'hybrid',
  'strain',
  'net',
  'wt',
]);

const SEGMENT_SPLIT = /\s+[-\u2013\u2014|\u2022\u00b7]+\s+|\s*\|\s*|::|\s+\/\s+/;

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripMarkupAndNumbers(text: string): string {
  return (
    decodeEntities(text.replace(/<[^>]*>/g, ' '))
      // prices: $12, $12.00, USD 12
      .replace(/(?:\$|usd\s*)\s?\d+(?:[.,]\d{1,2})?/gi, ' ')
      // potency: "THC 24.5%", "24.5% THC", "(THC: 24%)", "CBD <1%"
      .replace(/\b(?:thc|cbd|cbg|cbn|total\s+cannabinoids)\b\s*[:=]?\s*[<>~]?\s*\d+(?:[.,]\d+)?\s*%?/gi, ' ')
      .replace(/\d+(?:[.,]\d+)?\s*%\s*(?:thc|cbd|cbg|cbn)?/gi, ' ')
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Remove any run of characters that reads as a package size. */
function stripWeightTokens(text: string): string {
  return text
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:g|gr|gm|gram|grams)\b/gi, ' ')
    .replace(/\b1\s*\/\s*(?:8|4|2)\s*-?\s*(?:oz|ozs|ounce|ounces)?\b/gi, ' ')
    .replace(/[\u215b\u00bc\u00bd]/g, ' ')
    .replace(/\b(?:1|one)?\s*-?\s*(?:oz|ozs|ounce|ounces)\b/gi, ' ')
    .replace(/\b(?:eighth|quarter|half\s*-?\s*(?:oz|ounce)?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9#&'+. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNoiseSegment(segment: string): boolean {
  const stripped = stripWeightTokens(segment);
  const compare = normalizeForCompare(stripped).replace(/[.]/g, '');
  if (!compare) return true;
  if (NOISE_WORDS.has(compare)) return true;
  // A segment of only noise words in any order, e.g. "premium indoor flower".
  const words = compare.split(' ');
  return words.length > 0 && words.every((word) => NOISE_WORDS.has(word) || EDGE_NOISE.has(word));
}

function trimEdgeNoise(segment: string): string {
  let words = segment.split(/\s+/).filter(Boolean);
  const isNoise = (word: string) => EDGE_NOISE.has(normalizeForCompare(word));
  while (words.length > 1 && isNoise(words[0] as string)) words = words.slice(1);
  while (words.length > 1 && isNoise(words[words.length - 1] as string)) words = words.slice(0, -1);
  return words.join(' ');
}

function detectSubtype(text: string): FlowerSubtype {
  const lower = text.toLowerCase();
  if (/\bsmalls?\b|\bpopcorn\b/.test(lower)) return 'SMALLS';
  if (/\bground\b|\bmilled\b|\bshake\b/.test(lower)) return 'GROUND';
  if (/\bwhole\s+(?:flower|bud|nug)\b|\bwhole\s*-?\s*flower\b/.test(lower)) return 'WHOLE_FLOWER';
  return 'UNSPECIFIED';
}

function stripBracketedNoise(text: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  const cleaned = text.replace(/[([{]([^)\]}]*)[)\]}]/g, (whole, inner: string) => {
    if (isNoiseSegment(inner) || normalizeWeight(inner).weight !== UNCLASSIFIED_WEIGHT) {
      removed.push(whole.trim());
      return ' ';
    }
    return whole;
  });
  return { text: cleaned.replace(/\s+/g, ' ').trim(), removed };
}

/**
 * Reduce a retailer's product title to the cultivar name.
 *
 * The parser only ever *removes* packaging, potency, price and category noise.
 * It never rewrites a cultivar - "GG4" is not turned into "Gorilla Glue #4"
 * unless a manually verified alias says so (see aliases.ts).
 */
export function canonicalizeStrainName(
  raw: string,
  options: CanonicalizeOptions = {},
): CanonicalStrainResult {
  const subtype = detectSubtype(raw);
  const removed: string[] = [];

  const base = stripMarkupAndNumbers(raw);
  const bracket = stripBracketedNoise(base);
  removed.push(...bracket.removed);

  const brandKeys = new Set(
    [options.brand ?? '', ...(options.knownBrands ?? [])]
      .map((b) => normalizeForCompare(b))
      .filter((b) => b.length > 0),
  );

  const segments = bracket.text
    .split(SEGMENT_SPLIT)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  const candidates: string[] = [];
  for (const segment of segments) {
    if (isNoiseSegment(segment)) {
      removed.push(segment);
      continue;
    }
    if (brandKeys.has(normalizeForCompare(segment))) {
      removed.push(segment);
      continue;
    }
    const withoutWeight = stripWeightTokens(segment);
    if (!withoutWeight || isNoiseSegment(withoutWeight)) {
      removed.push(segment);
      continue;
    }
    const trimmed = trimEdgeNoise(withoutWeight).replace(/^[\s,;:.\-]+|[\s,;:.\-]+$/g, '');
    if (!trimmed) {
      removed.push(segment);
      continue;
    }
    candidates.push(trimmed);
  }

  if (candidates.length === 0) {
    // Nothing survived. Keep the original so a human can look at it rather than
    // inventing a name.
    return {
      canonicalName: raw.trim(),
      confident: false,
      removed,
      alternatives: [],
      subtype,
    };
  }

  if (candidates.length === 1) {
    return { canonicalName: candidates[0] as string, confident: true, removed, alternatives: [], subtype };
  }

  // Several plausible segments and no brand field to disambiguate. Follow the
  // configured convention, but flag it: the admin review queue decides.
  const position = options.brandPosition ?? 'prefix';
  const chosen =
    position === 'suffix' ? (candidates[0] as string) : (candidates[candidates.length - 1] as string);
  return {
    canonicalName: chosen,
    confident: position !== 'unknown' && candidates.length === 2,
    removed,
    alternatives: candidates.filter((c) => c !== chosen),
    subtype,
  };
}

/**
 * Comparison key used for de-duplication.
 *
 * Deliberately conservative: it folds case, whitespace, quote style and
 * trailing punctuation, and nothing else. "GG #4" and "GG4" stay distinct until
 * a human verifies an alias, because merging two different cultivars is worse
 * than showing two similar names.
 */
export function strainMatchKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .toLowerCase()
    .replace(/[.,;:!?]+$/g, '')
    .replace(/^[.,;:!?\s]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pick the display spelling for a set of variants that share a match key.
 * Deterministic: most frequent wins, then mixed case over SHOUTING, then
 * alphabetical.
 */
export function pickDisplayName(variants: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const variant of variants) counts.set(variant, (counts.get(variant) ?? 0) + 1);

  const isShouting = (value: string) => value === value.toUpperCase() && /[A-Z]{2}/.test(value);

  return [...counts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      const shoutA = isShouting(a[0]) ? 1 : 0;
      const shoutB = isShouting(b[0]) ? 1 : 0;
      if (shoutA !== shoutB) return shoutA - shoutB;
      return a[0].localeCompare(b[0]);
    })
    .map(([name]) => name)[0] as string;
}

/** Alphabetical ordering used everywhere strains are listed. */
export function compareStrainNames(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });
}
