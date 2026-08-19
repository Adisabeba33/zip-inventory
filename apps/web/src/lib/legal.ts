import { legalNotices } from '@inventory-index/db';

/**
 * Regulatory copy is configuration, not code.
 *
 * Every regulated string on the site is fetched from a named slot so counsel
 * can change the wording centrally. The fallbacks below are the neutral
 * defaults used before anything has been configured - they are not a place to
 * put jurisdiction-specific disclosures.
 */
const FALLBACKS: Record<string, { title: string; body: string }> = {
  site_footer: {
    title: 'Independent inventory information only',
    body: [
      'Independent inventory information only. Not a retailer or marketplace.',
      'No cannabis sales or orders. No prices or promotions.',
      'Retail inventory can change at any time. 21+ where required by law.',
    ].join(' '),
  },
  dispensary_page: {
    title: 'About this listing',
    body:
      'This is an independent inventory index. It is not affiliated with or endorsed by this retailer. ' +
      'Listings reflect items observed in an approved public or permitted inventory source at the stated ' +
      'check time and may differ from what the retailer actually holds. This service does not sell cannabis, ' +
      'process orders, display prices, or receive commissions from retailers.',
  },
  age_gate: {
    title: 'Age confirmation',
    body: 'This site contains information about legal adult-use cannabis inventory in New York. Are you 21 or older?',
  },
  part_129_disclosures: { title: '', body: '' },
};

export interface Notice {
  title: string;
  body: string;
  variant: 'NEUTRAL' | 'WARNING' | 'LEGAL';
}

export async function getLegalNotice(slot: keyof typeof FALLBACKS | string): Promise<Notice | null> {
  try {
    const row = await legalNotices.getNotice(slot as never);
    if (row) return { title: row.title ?? '', body: row.body, variant: row.variant };
  } catch {
    // A database that is unavailable must not blank out the disclaimers.
  }
  const fallback = FALLBACKS[slot];
  if (!fallback || !fallback.body) return null;
  return { ...fallback, variant: 'LEGAL' };
}
