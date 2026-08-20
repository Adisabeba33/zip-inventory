import type { FlowerSubtype, ProductType } from './types.js';

export interface ProductClassification {
  productType: ProductType;
  subtype: FlowerSubtype;
  /** Which rule decided, for audit trails and parser debugging. */
  reason: string;
}

/**
 * Phase 1 indexes flower only. Excluding a flower item by mistake costs
 * coverage; including a pre-roll or a vape by mistake breaks the product's one
 * promise, so the exclusion rules lean strict.
 */
const STRONG_EXCLUSIONS: ReadonlyArray<[RegExp, string]> = [
  [/\bpre[\s-]?rolls?\b|\bprerolls?\b/i, 'pre-roll'],
  [/\binfused\s+pre[\s-]?roll\b|\bdog\s?walker\b/i, 'infused pre-roll'],
  [/\bjoints?\b|\bblunts?\b|\bdoobie\b/i, 'pre-roll'],
  [/\bvapes?\b|\bcarts?\b|\bcartridges?\b|\bdisposables?\b|\bpods?\b|\bao\s?vape\b/i, 'vape'],
  [/\bconcentrates?\b|\brosin\b|\bshatter\b|\bbadder\b|\bbatter\b|\bbudder\b|\bcrumble\b|\bdiamonds?\b|\bsauce\b|\bdistillate\b|\blive\s+resin\b/i, 'concentrate'],
  [/\bedibles?\b|\bgummies?\b|\bgummy\b|\bchocolates?\b|\bbrownies?\b|\bcookies?\s+\d|\bmints?\b|\bchews?\b|\btaffy\b|\bhard\s+candy\b/i, 'edible'],
  [/\bbeverages?\b|\bdrinks?\b|\bseltzers?\b|\bsodas?\b|\bteas?\b|\belixir\b|\bshots?\b/i, 'beverage'],
  [/\btinctures?\b|\bsublinguals?\b|\brso\b|\bcapsules?\b|\btablets?\b|\bsoftgels?\b|\bpills?\b/i, 'tincture/capsule'],
  [/\btopicals?\b|\bbalms?\b|\blotions?\b|\bsalves?\b|\bcreams?\s+\d|\btransdermal\b|\bpatch(?:es)?\b/i, 'topical'],
  [/\baccessor(?:y|ies)\b|\bmerch(?:andise)?\b|\bapparel\b|\bgrinders?\b|\blighters?\b|\brolling\s+papers?\b|\btrays?\b|\bbatter(?:y|ies)\b|\bpipes?\b|\bbongs?\b|\bt-?shirts?\b|\bhats?\b|\bstickers?\b/i, 'accessory'],
  [/\bseeds?\b|\bclones?\b|\bplants?\s+for\s+sale\b/i, 'plant material'],
  // Flower coated in or blended with concentrate is a different product class,
  // whatever the menu files it under.
  [/\bmoon\s?rocks?\b|\bcaviar\b|\bsun\s?rocks?\b/i, 'moonrock'],
  [/\binfused\b/i, 'infused product'],
  // Hash is a concentrate. "Hash Plant" is a cultivar, hence the exception.
  [/\bhash\b(?!\s*plant)|\bhashish\b/i, 'hash'],
];

/**
 * Weaker signals: these words appear inside legitimate cultivar names
 * ("Hash Plant", "Cherry Pie"). They only exclude an item when nothing else in
 * the text says "flower".
 */
const WEAK_EXCLUSIONS: ReadonlyArray<[RegExp, string]> = [
  [/\bkief\b|\bkif\b/i, 'kief'],
  [/\bresin\b/i, 'resin'],
  [/\bwax\b/i, 'wax'],
];

const FLOWER_SIGNALS =
  /\bflower\b|\bbuds?\b|\bnugs?\b|\bsmalls?\b|\beighth\b|\bquarter\b|\bounce\b|\boz\b|\b\d+(?:[.,]\d+)?\s*g\b|\b1\s*\/\s*[248]\b/i;

/** Source categories that are unambiguously flower, whatever the title says. */
const FLOWER_CATEGORIES = new Set([
  'flower',
  'flowers',
  'bud',
  'buds',
  'whole flower',
  'dried flower',
  'cannabis flower',
]);

export function detectFlowerSubtype(text: string): FlowerSubtype {
  const lower = text.toLowerCase();
  if (/\bsmalls?\b|\bpopcorn\b/.test(lower)) return 'SMALLS';
  if (/\bground\b|\bmilled\b|\bshake\b/.test(lower)) return 'GROUND';
  if (/\bwhole[\s-]*(?:flower|bud|nug)\b/.test(lower)) return 'WHOLE_FLOWER';
  return 'UNSPECIFIED';
}

/**
 * Decide whether an item belongs in the index.
 *
 * When the source publishes an explicit category we trust it; the text
 * heuristics are only a fallback for sources that do not.
 */
export function classifyProduct(
  title: string,
  options: { category?: string | null; description?: string | null } = {},
): ProductClassification {
  const category = (options.category ?? '').trim().toLowerCase();
  const haystack = [title, options.category ?? ''].join(' ');
  const subtype = detectFlowerSubtype(haystack);

  if (category && !FLOWER_CATEGORIES.has(category)) {
    return { productType: 'EXCLUDED', subtype, reason: `source category: ${category}` };
  }

  for (const [pattern, label] of STRONG_EXCLUSIONS) {
    if (pattern.test(title)) {
      return { productType: 'EXCLUDED', subtype, reason: `excluded category: ${label}` };
    }
  }

  const hasFlowerSignal = FLOWER_CATEGORIES.has(category) || FLOWER_SIGNALS.test(haystack);
  for (const [pattern, label] of WEAK_EXCLUSIONS) {
    if (pattern.test(title) && !hasFlowerSignal) {
      return { productType: 'EXCLUDED', subtype, reason: `excluded category: ${label}` };
    }
  }

  if (FLOWER_CATEGORIES.has(category)) {
    return { productType: 'FLOWER', subtype, reason: 'source category: flower' };
  }
  if (hasFlowerSignal) {
    return { productType: 'FLOWER', subtype, reason: 'flower signal in title' };
  }
  return { productType: 'EXCLUDED', subtype, reason: 'no flower signal' };
}
