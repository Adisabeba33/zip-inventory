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
  [/\bedibles?\b|\bgummies?\b|\bgummy\b|\bchocolates?\b|\bbrownies?\b|\bchews?\b|\btaffy\b|\bhard\s+candy\b/i, 'edible'],
  [/\bbeverages?\b|\bdrinks?\b|\bseltzers?\b|\bsodas?\b|\bteas?\b|\belixir\b|\bshots?\b/i, 'beverage'],
  [/\btinctures?\b|\bsublinguals?\b|\brso\b|\bcapsules?\b|\btablets?\b|\bsoftgels?\b|\bpills?\b/i, 'tincture/capsule'],
  [/\btopicals?\b|\bbalms?\b|\blotions?\b|\bsalves?\b|\bcreams?\s+\d|\btransdermal\b|\bpatch(?:es)?\b/i, 'topical'],
  [/\baccessor(?:y|ies)\b|\bmerch(?:andise)?\b|\bapparel\b|\bgrinders?\b|\blighters?\b|\brolling\s+papers?\b|\btrays?\b|\bbatter(?:y|ies)\b|\bpipes?\b|\bbongs?\b|\bt-?shirts?\b|\bhats?\b|\bstickers?\b/i, 'accessory'],
  [/\bseeds?\b|\bclones?\b|\bplants?\s+for\s+sale\b/i, 'plant material'],
  // Flower coated in or blended with concentrate is a different product class,
  // whatever the menu files it under.
  [/\bmoon\s?rocks?\b|\bcaviar\b|\bsun\s?rocks?\b/i, 'moonrock'],
  [/\binfused\b/i, 'infused product'],
];

/**
 * Words that name a product class and a cultivar family equally often.
 *
 * Cookies was already handled this way and the reason generalises: "Mints" is
 * Kush Mints and Animal Mints at least as often as it is a tin of mints, and
 * "Hash" is Hickory Hash and Hash Plant at least as often as it is bubble hash.
 * Excluding on the bare word costs a whole lineage - three cultivars went
 * missing from one real ounce menu that way - so each needs a second signal
 * saying this is the product rather than the name: a dose, a pack count, or how
 * the concentrate was made.
 *
 * A bare "Hash" or "Mints" with nothing else in the title is still the product.
 */
const DOSE_OR_PACK =
  /\b\d+\s*mg\b|\b\d+\s*(?:pk|pack|ct|count|pieces?|caps?)\b|\b\d+\s*-\s*pack\b/i;

const HASH_METHOD =
  /\bbubble\b|\bice\s*water\b|\bdry\s*sift\b|\bsift\b|\brosin\b|\btemple\s*ball\b|\bpiatella\b|\bcharas\b|\bhash\s*hole\b|\bfull\s*melt\b|\bpressed\b/i;

const AMBIGUOUS_EXCLUSIONS: ReadonlyArray<{
  word: RegExp;
  qualifier: RegExp;
  alone: RegExp;
  label: string;
}> = [
  { word: /\bmints?\b/i, qualifier: DOSE_OR_PACK, alone: /^\s*mints?\s*$/i, label: 'edible' },
  { word: /\bhash(?:ish)?\b/i, qualifier: HASH_METHOD, alone: /^\s*hash(?:ish)?\s*$/i, label: 'hash' },
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

  for (const { word, qualifier, alone, label } of AMBIGUOUS_EXCLUSIONS) {
    if (word.test(title) && (qualifier.test(title) || alone.test(title))) {
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
