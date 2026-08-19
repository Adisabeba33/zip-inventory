import type { Metadata } from 'next';
import { DispensaryResult } from '@/components/DispensaryResult';
import { ZipSearchForm } from '@/components/ZipSearchForm';
import { searchDispensaries } from '@/lib/queries';
import { robotsFor, site } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Search',
  robots: robotsFor('directory'),
};

// Search reads our own database only; a short revalidation window is plenty
// because inventory changes about once a day.
export const revalidate = 300;

interface SearchPageProps {
  searchParams: Promise<{ zip?: string; radius?: string }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const now = new Date();
  const result = await searchDispensaries(params.zip ?? null, params.radius ?? null, now);

  return (
    <>
      <section className="section" style={{ maxWidth: '32rem' }}>
        <h1>Dispensaries near you</h1>
        <ZipSearchForm defaultZip={result.zip ?? params.zip ?? ''} defaultRadius={result.radiusMiles} />
      </section>

      {!params.zip ? (
        <p className="muted">Enter a ZIP code to begin.</p>
      ) : !result.zip ? (
        <p className="muted">
          “{params.zip}” is not a five-digit ZIP code. Try again, for example 10605.
        </p>
      ) : result.inZip.length === 0 && result.nearby.length === 0 ? (
        <div className="stack">
          <p className="muted">
            No licensed retailer in our directory is within {result.radiusMiles} miles of ZIP {result.zip}.
          </p>
          <p className="small faint">
            The directory covers licensed New York adult-use retailers. If a retailer is missing,{' '}
            <a href="/corrections">tell us</a>.
          </p>
        </div>
      ) : (
        <>
          {result.inZip.length > 0 ? (
            <section className="section">
              <h2 className="list-header__title">In ZIP {result.zip}</h2>
              <ul className="result-list">
                {result.inZip.map((entry) => (
                  <DispensaryResult key={entry.slug} entry={entry} now={now} />
                ))}
              </ul>
            </section>
          ) : null}

          {result.nearby.length > 0 ? (
            <section className="section">
              <h2 className="list-header__title">
                Nearby · within {result.radiusMiles} miles
              </h2>
              <ul className="result-list">
                {result.nearby.map((entry) => (
                  <DispensaryResult key={entry.slug} entry={entry} now={now} />
                ))}
              </ul>
            </section>
          ) : null}

          <p className="small faint">
            Ordered by distance, then alphabetically. {site.name} has no featured, sponsored or promoted
            placements, and accepts no payment from retailers.
          </p>
        </>
      )}
    </>
  );
}
