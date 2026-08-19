import { NextResponse } from 'next/server';
import { searchDispensaries } from '@/lib/queries';

export const revalidate = 300;

/**
 * Public API: retailer search by ZIP.
 *
 * Visitors' browsers talk to this; this talks to our own database. Nothing here
 * reaches out to a retailer, and no raw scraped data is exposed - only the
 * normalised, factual fields the product uses.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await searchDispensaries(url.searchParams.get('zip'), url.searchParams.get('radius'));

  if (!result.zip) {
    return NextResponse.json({ error: 'A five-digit ZIP code is required.' }, { status: 400 });
  }

  const shape = (entry: (typeof result.inZip)[number]) => ({
    slug: entry.slug,
    name: entry.displayName,
    city: entry.city,
    state: entry.state,
    zip: entry.zip,
    address: entry.addressLine,
    distanceMiles: entry.distanceMiles === null ? null : Number(entry.distanceMiles.toFixed(2)),
    inventoryTracking: entry.hasApprovedSource ? 'approved_source' : 'not_available',
    lastSuccessfulCheck: entry.lastSuccessAt?.toISOString() ?? null,
    freshness: entry.freshness.state,
    counts: entry.counts.map((count) => ({ packageWeight: count.weight, label: count.label, strains: count.count })),
  });

  return NextResponse.json({
    zip: result.zip,
    radiusMiles: result.radiusMiles,
    ordering: 'distance, then alphabetical',
    inZip: result.inZip.map(shape),
    nearby: result.nearby.map(shape),
  });
}
