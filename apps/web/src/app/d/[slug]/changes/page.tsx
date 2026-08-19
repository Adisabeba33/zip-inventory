import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { WEIGHT_PRESENTATION } from '@inventory-index/core';
import { formatDate } from '@/lib/format';
import { getChangesFor, getDispensaryView } from '@/lib/queries';
import { robotsFor } from '@/lib/site';

export const revalidate = 300;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const view = await getDispensaryView(slug);
  return { title: view ? `${view.displayName} — changes` : 'Changes', robots: robotsFor('inventory') };
}

export default async function ChangesPage({ params }: PageProps) {
  const { slug } = await params;
  const view = await getDispensaryView(slug);
  if (!view) notFound();

  const changes = await getChangesFor(view.id);

  const sections = [
    {
      key: 'new',
      title: 'Newly listed',
      note: 'First observed by this service in this retailer’s inventory source.',
      rows: changes.newlyListed.map((row) => ({
        name: row.canonicalName,
        weight: row.packageWeight,
        detail: `First observed ${formatDate(row.firstSeenAt)}`,
      })),
    },
    {
      key: 'returned',
      title: 'Returned',
      note: 'Observed again after a period of not being listed.',
      rows: changes.returned.map((row) => ({
        name: row.canonicalName,
        weight: row.packageWeight,
        detail: `Observed again ${formatDate(row.lastSeenAt)}`,
      })),
    },
    {
      key: 'gone',
      title: 'No longer listed',
      note: 'Absent from two consecutive successful checks. This is not a statement about the shop floor.',
      rows: changes.noLongerListed.map((row) => ({
        name: row.canonicalName,
        weight: row.packageWeight,
        detail: `Last observed ${formatDate(row.lastSeenAt)}`,
      })),
    },
  ];

  return (
    <>
      <header className="section" style={{ marginBottom: '0.5rem' }}>
        <h1>{view.displayName}</h1>
        <p className="small faint">Changes over the last 14 days · <Link href={`/d/${view.slug}`}>Back to current inventory</Link></p>
      </header>

      {sections.map((section) => (
        <section className="section" key={section.key}>
          <div className="list-header">
            <h2 className="list-header__title">
              {section.title} — {section.rows.length}
            </h2>
          </div>
          <p className="small faint" style={{ marginTop: '0.5rem' }}>{section.note}</p>
          {section.rows.length === 0 ? (
            <p className="muted small">Nothing in this category.</p>
          ) : (
            <ul className="strain-list">
              {section.rows.map((row) => (
                <li className="strain" key={`${row.name}-${row.weight}`}>
                  <span className="strain__name">
                    {row.name} <span className="faint">· {WEIGHT_PRESENTATION[row.weight].ounceLabel}</span>
                  </span>
                  <span className="small faint nowrap">{row.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}
