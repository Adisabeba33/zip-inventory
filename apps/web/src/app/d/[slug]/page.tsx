import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { weightFromSlug, weightSlug, WEIGHT_PRESENTATION } from '@inventory-index/core';
import { LegalNotice } from '@/components/LegalNotice';
import { StrainList } from '@/components/StrainList';
import { WeightTabs } from '@/components/WeightTabs';
import { formatCheckTime, formatDate } from '@/lib/format';
import { getDispensaryView, getStrainsFor } from '@/lib/queries';
import { robotsFor } from '@/lib/site';

// Inventory pages stay out of search indexes until the legal release gate is
// signed off. See docs/LEGAL-RELEASE-GATES.md.
export const revalidate = 300;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ w?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const view = await getDispensaryView(slug);
  return {
    title: view ? view.displayName : 'Retailer',
    robots: robotsFor('inventory'),
  };
}

export default async function DispensaryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { w } = await searchParams;
  const now = new Date();
  const view = await getDispensaryView(slug, now);
  if (!view) notFound();

  const activeWeight = weightFromSlug(w ?? '') ?? 'EIGHTH';
  const activeSlug = weightSlug(activeWeight);
  const presentation = WEIGHT_PRESENTATION[activeWeight];

  const showInventory =
    view.directoryActive && view.hasApprovedSource && view.freshness.showInventory;
  const strains = showInventory ? await getStrainsFor(view.id, activeWeight, now) : [];

  return (
    <>
      <header className="section" style={{ marginBottom: '1rem' }}>
        <h1>{view.displayName}</h1>
        <p className="muted small" style={{ marginBottom: '0.35rem' }}>
          {view.addressLine ? <>{view.addressLine}<br /></> : null}
          {[view.city, view.state].filter(Boolean).join(', ')} {view.zip ?? ''}
        </p>
        <p className="small faint" style={{ margin: 0 }}>
          Independent inventory observation
          <br />
          Last successfully checked: {formatCheckTime(view.lastSuccessAt, now)}
        </p>
      </header>

      {!view.directoryActive ? (
        <div className="notice notice--warning">
          This retailer is no longer listed as active in our current directory source. Historical observations
          are kept, but inventory is not presented as current.
        </div>
      ) : !view.hasApprovedSource ? (
        <div className="notice">
          <strong>Inventory tracking not available yet.</strong> This retailer is in the licensed directory, but
          we do not have an approved inventory source for it. We only read sources where automated access has
          been reviewed and permitted, so there is nothing to show here.{' '}
          <Link href="/data-sources">How sources are approved</Link>.
        </div>
      ) : view.freshness.state === 'UNAVAILABLE' ? (
        <div className="notice notice--warning">
          <strong>Inventory temporarily unavailable.</strong> The last successful observation was{' '}
          {formatDate(view.lastSuccessAt)}, which is too long ago to present as current.
        </div>
      ) : (
        <>
          {view.freshness.state === 'STALE' ? (
            <div className="notice notice--warning">
              <strong>Inventory check delayed.</strong> This data is stale. Last successful check:{' '}
              {formatDate(view.lastSuccessAt)}.
            </div>
          ) : null}

          <WeightTabs
            items={view.counts.map((count) => ({
              weight: count.weight,
              ounceLabel: count.ounceLabel,
              gramLabel: count.gramLabel,
              slug: count.slug,
              count: count.count,
            }))}
            activeSlug={activeSlug}
            basePath={`/d/${view.slug}`}
          />

          <StrainList
            strains={strains.map((strain) => ({ canonicalName: strain.canonicalName, badge: strain.badge }))}
            weightLabel={`${presentation.ounceLabel} (${presentation.gramLabel})`}
          />

          <p className="small faint" style={{ marginTop: '1.25rem' }}>
            Listed at last check, alphabetical. <Link href={`/d/${view.slug}/changes`}>View changes</Link>
          </p>
        </>
      )}

      <div className="section">
        <LegalNotice slot="dispensary_page" />
      </div>
    </>
  );
}
