import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { AgeGate } from '@/components/AgeGate';
import { getLegalNotice } from '@/lib/legal';
import { robotsFor, site } from '@/lib/site';

export const metadata: Metadata = {
  title: { default: site.name, template: `%s · ${site.name}` },
  description:
    'An independent index of flower package sizes observed in the public inventory of licensed New York retailers.',
  robots: robotsFor('directory'),
  // No product imagery, no social cards with retailer branding.
  openGraph: { title: site.name, description: site.tagline, type: 'website' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [footerNotice, ageNotice, disclosures] = await Promise.all([
    getLegalNotice('site_footer'),
    getLegalNotice('age_gate'),
    getLegalNotice('part_129_disclosures'),
  ]);

  return (
    <html lang="en">
      <body>
        <AgeGate
          enabled={site.ageGateEnabled}
          title={ageNotice?.title || 'Age confirmation'}
          body={
            ageNotice?.body ||
            'This site contains information about legal adult-use cannabis inventory in New York. Are you 21 or older?'
          }
        />

        {!site.publicLaunchEnabled ? (
          <div className="notice notice--warning" style={{ borderRadius: 0, borderLeftWidth: 0, borderTop: 0 }}>
            <strong>Staging build.</strong> Public launch is gated pending the legal review described in
            docs/LEGAL-RELEASE-GATES.md. Search-engine indexing of retailer pages is{' '}
            {site.publicIndexingEnabled ? 'enabled' : 'disabled'}.
          </div>
        ) : null}

        <header className="site-header">
          <div className="site-header__inner">
            <Link className="site-header__name" href="/">
              {site.name}
            </Link>
            <span className="site-header__tag">{site.tagline}</span>
            <nav className="site-header__nav" aria-label="Primary">
              <Link href="/data-sources">How data works</Link>
              <Link href="/corrections">Corrections</Link>
            </nav>
          </div>
        </header>

        <main className="page" id="main">
          {children}
        </main>

        <footer className="site-footer">
          <div className="site-footer__inner">
            <div className="site-footer__lines">
              {(footerNotice?.body ?? '').split('. ').filter(Boolean).map((line) => (
                <p key={line}>{line.endsWith('.') ? line : `${line}.`}</p>
              ))}
            </div>

            {disclosures?.body ? (
              <p style={{ marginTop: '1rem' }}>
                {disclosures.title ? <strong>{disclosures.title}. </strong> : null}
                {disclosures.body}
              </p>
            ) : null}

            <nav className="site-footer__links" aria-label="Footer">
              <Link href="/terms">Terms</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/data-sources">Data sources</Link>
              <Link href="/corrections">Data correction</Link>
              <Link href="/crawler">Crawler policy</Link>
              <a href={`mailto:${site.contact.sourceOwner}`}>Source owner contact</a>
              <a href={`mailto:${site.contact.legal}`}>Legal contact</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
