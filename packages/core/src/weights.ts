import {
  CANONICAL_WEIGHTS,
  UNCLASSIFIED_WEIGHT,
  WEIGHT_PRESENTATION,
  type CanonicalWeight,
  type PackageWeight,
} from './types.js';

export interface WeightMatch {
  weight: PackageWeight;
  /** Every distinct canonical weight the text hinted at. */
  signals: CanonicalWeight[];
  /** Machine-readable explanation, useful in the admin review queue. */
  reason: 'matched' | 'no_signal' | 'conflicting_signals' | 'out_of_tolerance' | 'empty_input';
  /** The literal substrings that produced the match. */
  matchedText: string[];
}

export interface NormalizeWeightOptions {
  /**
   * Set by an adapter that knows a source's weight field is always expressed in
   * grams, so a bare "3.5" can be read as 3.5 g. Off by default: a bare number
   * with no unit is ambiguous and we do not guess.
   */
  assumeGrams?: boolean;
}

/**
 * Gram tolerance bands. Retailers label the same package as 3.5 g or 3.54 g,
 * and 28 g or 28.35 g, so a narrow band around each nominal net weight is
 * accepted. Anything outside every band stays UNCLASSIFIED rather than being
 * rounded into the nearest bucket.
 */
const GRAM_BANDS: ReadonlyArray<{ weight: CanonicalWeight; min: number; max: number }> = [
  { weight: 'EIGHTH', min: 3.3, max: 3.7 },
  { weight: 'QUARTER', min: 6.8, max: 7.3 },
  { weight: 'HALF', min: 13.7, max: 14.4 },
  { weight: 'OUNCE', min: 27.6, max: 28.6 },
];

const UNICODE_FRACTIONS: ReadonlyArray<[RegExp, string]> = [
  [/\u215b/g, ' 1/8 '],
  [/\u00bc/g, ' 1/4 '],
  [/\u00bd/g, ' 1/2 '],
  [/\u215c/g, ' 3/8 '],
  [/\u215d/g, ' 5/8 '],
  [/\u00be/g, ' 3/4 '],
  [/\u2153/g, ' 1/3 '],
];

/** Lower-case, expand vulgar fractions, normalise dashes and whitespace. */
export function normalizeWeightText(input: string): string {
  let text = input.toLowerCase();
  for (const [pattern, replacement] of UNICODE_FRACTIONS) text = text.replace(pattern, replacement);
  return text
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Signal {
  weight: CanonicalWeight;
  text: string;
}

const OUNCE_UNIT = '(?:oz|ozs|ounce|ounces)';

/**
 * Ordered patterns. Each match is blanked out of the working string before the
 * next pattern runs, so the "oz" inside "1/8 oz" is never counted a second time
 * as a whole ounce.
 */
interface Rule {
  pattern: RegExp;
  resolve: (match: RegExpExecArray) => CanonicalWeight | null;
  /** Grams that matched the shape but no tolerance band. */
  tolerance?: boolean;
}

function gramRule(): Rule {
  return {
    pattern: /(\d+(?:[.,]\d+)?)\s*(?:g|gr|gm|gram|grams)\b/g,
    tolerance: true,
    resolve: (match) => {
      const grams = Number.parseFloat((match[1] ?? '').replace(',', '.'));
      if (!Number.isFinite(grams)) return null;
      return GRAM_BANDS.find((b) => grams >= b.min && grams <= b.max)?.weight ?? null;
    },
  };
}

const FRACTION_TO_WEIGHT: Record<string, CanonicalWeight> = { '8': 'EIGHTH', '4': 'QUARTER', '2': 'HALF' };

function buildRules(strict: boolean): Rule[] {
  const rules: Rule[] = [gramRule()];

  // "1/8 oz", "1/2-ounce"
  rules.push({
    pattern: new RegExp(String.raw`\b1\s*/\s*(8|4|2)\s*-?\s*${OUNCE_UNIT}`, 'g'),
    resolve: (m) => FRACTION_TO_WEIGHT[m[1] ?? ''] ?? null,
  });

  if (!strict) {
    // Bare "1/8" is meaningful in a dedicated weight field, not in a title.
    rules.push({
      pattern: /\b1\s*\/\s*(8|4|2)\b/g,
      resolve: (m) => FRACTION_TO_WEIGHT[m[1] ?? ''] ?? null,
    });
  }

  // "1 oz", "1oz", "one ounce"
  rules.push({
    pattern: new RegExp(String.raw`\b(?:1|one)\s*-?\s*${OUNCE_UNIT}\b`, 'g'),
    resolve: () => 'OUNCE',
  });

  if (!strict) {
    // Word forms and a bare unit, only for dedicated weight fields.
    rules.push({ pattern: new RegExp(String.raw`\bhalf\s*-?\s*${OUNCE_UNIT}\b`, 'g'), resolve: () => 'HALF' });
    rules.push({ pattern: /\beighth\b/g, resolve: () => 'EIGHTH' });
    rules.push({ pattern: /\bquarter\b/g, resolve: () => 'QUARTER' });
    rules.push({ pattern: /\bhalf\b/g, resolve: () => 'HALF' });
    rules.push({ pattern: new RegExp(String.raw`\b${OUNCE_UNIT}\b`, 'g'), resolve: () => 'OUNCE' });
  }

  return rules;
}

function blank(text: string, start: number, length: number): string {
  return text.slice(0, start) + ' '.repeat(length) + text.slice(start + length);
}

function collect(text: string, strict: boolean): { signals: Signal[]; outOfTolerance: string[] } {
  let work = text;
  const signals: Signal[] = [];
  const outOfTolerance: string[] = [];

  for (const rule of buildRules(strict)) {
    const found: Array<{ index: number; literal: string; weight: CanonicalWeight | null }> = [];
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(work)) !== null) {
      found.push({ index: match.index, literal: match[0], weight: rule.resolve(match) });
      if (match[0].length === 0) rule.pattern.lastIndex += 1;
    }
    for (const item of found) {
      if (item.weight) signals.push({ weight: item.weight, text: item.literal.trim() });
      else if (rule.tolerance) outOfTolerance.push(item.literal.trim());
      work = blank(work, item.index, item.literal.length);
    }
  }

  return { signals, outOfTolerance };
}

function decide(signals: Signal[], outOfTolerance: string[]): WeightMatch {
  const distinct = [...new Set(signals.map((s) => s.weight))];
  const matchedText = [...new Set(signals.map((s) => s.text))];

  if (distinct.length === 1) {
    return { weight: distinct[0] as CanonicalWeight, signals: distinct, reason: 'matched', matchedText };
  }
  if (distinct.length > 1) {
    // "1/8 oz - 3.5 g" agrees and never lands here; genuinely conflicting input
    // ("3.5 g / 1 oz bundle") is parked for a human instead of guessed.
    return { weight: UNCLASSIFIED_WEIGHT, signals: distinct, reason: 'conflicting_signals', matchedText };
  }
  if (outOfTolerance.length > 0) {
    return { weight: UNCLASSIFIED_WEIGHT, signals: [], reason: 'out_of_tolerance', matchedText: outOfTolerance };
  }
  return { weight: UNCLASSIFIED_WEIGHT, signals: [], reason: 'no_signal', matchedText: [] };
}

/**
 * Normalise a retailer's dedicated weight field into one of the four canonical
 * package sizes. Conflicting or unrecognised input yields UNCLASSIFIED_WEIGHT,
 * which is routed to admin review instead of being guessed into a bucket.
 */
export function normalizeWeight(
  raw: string | null | undefined,
  options: NormalizeWeightOptions = {},
): WeightMatch {
  if (raw === null || raw === undefined || !String(raw).trim()) {
    return { weight: UNCLASSIFIED_WEIGHT, signals: [], reason: 'empty_input', matchedText: [] };
  }

  let text = normalizeWeightText(String(raw));
  if (options.assumeGrams && /^\d+(?:[.,]\d+)?$/.test(text)) text = `${text}g`;

  const { signals, outOfTolerance } = collect(text, false);
  return decide(signals, outOfTolerance);
}

/**
 * Weight extraction from a free-text product title. Stricter than
 * normalizeWeight: bare fractions and bare size words are ignored because
 * cultivar names contain them ("Half Baked", "Quarter Moon", "Ounce of Hope").
 */
export function extractWeightFromTitle(title: string | null | undefined): WeightMatch {
  if (!title || !title.trim()) {
    return { weight: UNCLASSIFIED_WEIGHT, signals: [], reason: 'empty_input', matchedText: [] };
  }
  const { signals, outOfTolerance } = collect(normalizeWeightText(title), true);
  return decide(signals, outOfTolerance);
}

export function isCanonicalWeight(value: string): value is CanonicalWeight {
  return (CANONICAL_WEIGHTS as readonly string[]).includes(value);
}

/** Accepts "EIGHTH", "eighth", "3.5g", "1/8", "1/8 oz" - used for URL params. */
export function parseWeightParam(value: string | null | undefined): CanonicalWeight | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  if (isCanonicalWeight(upper)) return upper;
  const match = normalizeWeight(value);
  return match.weight === UNCLASSIFIED_WEIGHT ? null : match.weight;
}

export function weightSortOrder(weight: CanonicalWeight): number {
  return WEIGHT_PRESENTATION[weight].sortOrder;
}

export function orderedWeights(): CanonicalWeight[] {
  return [...CANONICAL_WEIGHTS];
}

/** URL-safe slug for a weight tab, e.g. "1-8-oz". */
export function weightSlug(weight: CanonicalWeight): string {
  return WEIGHT_PRESENTATION[weight].ounceLabel.replace(/[/ ]+/g, '-').toLowerCase();
}

export function weightFromSlug(slug: string): CanonicalWeight | null {
  const normalized = slug.trim().toLowerCase();
  for (const weight of CANONICAL_WEIGHTS) {
    if (weightSlug(weight) === normalized) return weight;
  }
  return parseWeightParam(slug);
}
