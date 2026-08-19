import type { Metadata } from 'next';
import { ZipSearchForm } from '@/components/ZipSearchForm';
import { robotsFor, site } from '@/lib/site';

export const metadata: Metadata = {
  title: `${site.name} — ${site.tagline}`,
  robots: robotsFor('directory'),
};

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <h1>Find flower inventory near you</h1>
        <p className="hero__lede">
          Which flower strains were listed in a licensed New York retailer’s public inventory at the last check,
          and in which standard package sizes.
        </p>
        <div style={{ marginTop: '1.5rem', maxWidth: '32rem' }}>
          <ZipSearchForm autoFocus />
        </div>
        <p className="hero__disclaimer">No prices. No ordering. Just inventory.</p>
      </section>

      <section className="section" style={{ maxWidth: '34rem' }}>
        <h2>How it works</h2>
        <ol className="steps">
          <li>Enter a ZIP code to see licensed retailers in and near it.</li>
          <li>Choose a retailer.</li>
          <li>Choose a package size: 1/8, 1/4, 1/2 or 1 oz.</li>
          <li>Read the strains listed at the last successful check, or copy the whole list.</li>
        </ol>
      </section>

      <section className="section" style={{ maxWidth: '38rem' }}>
        <h2>What this is</h2>
        <p className="muted">
          An independent observation index. The retailer directory comes from the New York Office of Cannabis
          Management’s published list of licensed adult-use dispensaries. Inventory is read once a day from
          approved sources only, and what you see is the last snapshot that was successfully observed and
          validated — not a live view of a shop floor.
        </p>
        <p className="muted">
          It is not a marketplace, a retailer or a recommendation service. There are no prices, no photographs,
          no potency figures, no ratings and no links to buy anything.{' '}
          <a href="/data-sources">More about where the data comes from</a>.
        </p>
      </section>
    </>
  );
}
