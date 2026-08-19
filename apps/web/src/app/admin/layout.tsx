import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor } from '@/lib/site';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · Admin' },
  // The admin is never indexable, whatever the public release gates say.
  robots: robotsFor('always-noindex'),
};

const SECTIONS = [
  ['/admin', 'Overview'],
  ['/admin/dispensaries', 'Dispensaries'],
  ['/admin/sources', 'Sources'],
  ['/admin/runs', 'Crawl runs'],
  ['/admin/anomalies', 'Anomalies'],
  ['/admin/diffs', 'Inventory diffs'],
  ['/admin/aliases', 'Strain aliases'],
  ['/admin/reviews', 'Review queue'],
  ['/admin/corrections', 'Corrections'],
  ['/admin/legal', 'Legal & policy'],
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav className="site-footer__links" style={{ marginTop: '1.25rem', fontSize: '0.85rem' }} aria-label="Admin">
        {SECTIONS.map(([href, label]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
      </nav>
      <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '0.9rem 0 1.25rem' }} />
      {children}
    </div>
  );
}
