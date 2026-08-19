/**
 * Wording rules.
 *
 * The service is an inventory observation index, not a shop. Retail and
 * availability-guarantee language is not a style preference here: it is what
 * separates a neutral factual index from something that reads as a cannabis
 * marketplace or as a claim about physical stock we cannot observe.
 *
 * A repository test scans the user-facing source for these phrases.
 */
export const PROHIBITED_PHRASES: readonly string[] = [
  'buy now',
  'order now',
  'shop now',
  'add to cart',
  'checkout',
  'best deal',
  'cheapest',
  'on sale',
  'discount',
  'coupon',
  'promo code',
  'available for purchase',
  'in stock',
  'out of stock',
  'sold out',
  'sells out',
  'guaranteed',
  'best weed',
  'strongest',
  'must try',
  'hottest strains',
  'top rated',
  'featured dispensary',
  'sponsored',
  'recommended for you',
  'reserve now',
  'pickup',
  'delivery',
];

/**
 * The subset that must never appear in user-facing copy in any context, not
 * even inside a denial. A repository test fails the build on these.
 *
 * The wider PROHIBITED_PHRASES list above is advisory: several of those words
 * appear legitimately in disclaimers ("not affiliated with or sponsored by",
 * "this service does not process orders"), so it is reported rather than
 * enforced.
 */
export const NEVER_PERMITTED_PHRASES: readonly string[] = [
  'sold out',
  'sells out',
  'in stock',
  'out of stock',
  'add to cart',
  'buy now',
  'order now',
  'shop now',
  'best deal',
  'cheapest',
  'promo code',
  'available for purchase',
  'best weed',
  'hottest strains',
  'must try',
  'top rated',
  'featured dispensary',
];

/** The vocabulary the product does use. */
export const PREFERRED_PHRASES: readonly string[] = [
  'Currently listed',
  'Listed at last check',
  'Newly listed',
  'No longer listed',
  'Last observed',
  'First observed',
  'Last successfully checked',
];

export interface ProhibitedMatch {
  phrase: string;
  index: number;
  excerpt: string;
}

/**
 * Find retail language in a string of user-facing copy. Word-boundary matched
 * so "checkout" flags but "check out the data sources page" style prose is
 * matched on the literal phrase only.
 */
export function findProhibitedPhrases(
  text: string,
  phrases: readonly string[] = PROHIBITED_PHRASES,
): ProhibitedMatch[] {
  const matches: ProhibitedMatch[] = [];
  for (const phrase of phrases) {
    const pattern = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    for (const match of text.matchAll(pattern)) {
      const index = match.index ?? 0;
      matches.push({
        phrase,
        index,
        excerpt: text.slice(Math.max(0, index - 40), index + phrase.length + 40).replace(/\s+/g, ' '),
      });
    }
  }
  return matches;
}
