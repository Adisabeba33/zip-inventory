import { NextResponse } from 'next/server';
import { getDispensaryView } from '@/lib/queries';

export const revalidate = 300;

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const view = await getDispensaryView(slug);
  if (!view) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  return NextResponse.json({
    slug: view.slug,
    name: view.displayName,
    address: view.addressLine,
    city: view.city,
    state: view.state,
    zip: view.zip,
    directoryActive: view.directoryActive,
    inventoryTracking: view.hasApprovedSource ? 'approved_source' : 'not_available',
    lastSuccessfulCheck: view.lastSuccessAt?.toISOString() ?? null,
    freshness: view.freshness.state,
    counts: view.counts.map((count) => ({
      packageWeight: count.weight,
      ounceLabel: count.ounceLabel,
      gramLabel: count.gramLabel,
      strains: count.count,
    })),
    disclaimer:
      'Items reflect what an approved inventory source listed at the stated check time. Not an offer, ' +
      'not a statement of physical stock, and not affiliated with the retailer.',
  });
}
