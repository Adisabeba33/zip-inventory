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
export function findProhibitedPhrases(text: string): ProhibitedMatch[] {
  const matches: ProhibitedMatch[] = [];
  for (const phrase of PROHIBITED_PHRASES) {
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
