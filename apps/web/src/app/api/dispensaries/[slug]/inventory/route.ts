import { NextResponse } from 'next/server';
import { WEIGHT_PRESENTATION, orderedWeights, parseWeightParam } from '@inventory-index/core';
import { getDispensaryView, getStrainsFor } from '@/lib/queries';

export const revalidate = 300;

/**
 * Current inventory for one retailer.
 *
 * The response carries strain names, package sizes and observation timestamps.
 * There is no price, potency, image, description, brand or purchase link,
 * because none of that is stored.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(request.url);
  const now = new Date();

  const view = await getDispensaryView(slug, now);
  if (!view) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  if (!view.hasApprovedSource) {
    return NextResponse.json(
      { slug: view.slug, name: view.displayName, inventoryTracking: 'not_available', weights: [] },
      { status: 200 },
    );
  }
  if (!view.freshness.showInventory) {
    return NextResponse.json({
      slug: view.slug,
      name: view.displayName,
      inventoryTracking: 'stale',
      freshness: view.freshness.state,
      lastSuccessfulCheck: view.lastSuccessAt?.toISOString() ?? null,
      weights: [],
    });
  }

  const requested = parseWeightParam(url.searchParams.get('weight'));
  const weights = requested ? [requested] : orderedWeights();

  const sections = await Promise.all(
    weights.map(async (weight) => {
      const strains = await getStrainsFor(view.id, weight, now);
      return {
        packageWeight: weight,
        ounceLabel: WEIGHT_PRESENTATION[weight].ounceLabel,
        gramLabel: WEIGHT_PRESENTATION[weight].gramLabel,
        count: strains.length,
        // Alphabetical, one canonical cultivar per entry.
        strains: strains.map((strain) => ({
          name: strain.canonicalName,
          status: strain.badge === 'NEW' ? 'NEWLY_LISTED' : strain.badge === 'RETURNED' ? 'RETURNED' : 'LISTED_NOW',
          firstObserved: strain.firstSeenAt.toISOString(),
          lastObserved: strain.lastSeenAt?.toISOString() ?? null,
        })),
      };
    }),
  );

  return NextResponse.json({
    slug: view.slug,
    name: view.displayName,
    inventoryTracking: 'approved_source',
    freshness: view.freshness.state,
    lastSuccessfulCheck: view.lastSuccessAt?.toISOString() ?? null,
    weights: sections,
  });
}
