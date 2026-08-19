import type { Metadata } from 'next';
import { CorrectionForm } from './CorrectionForm';
import { listDirectory } from '@/lib/queries';
import { robotsFor, site } from '@/lib/site';

export const metadata: Metadata = { title: 'Data correction', robots: robotsFor('directory') };
export const dynamic = 'force-dynamic';

export default async function CorrectionsPage() {
  const directory = await listDirectory().catch(() => []);

  return (
    <article className="section" style={{ maxWidth: '40rem' }}>
      <h1>Data correction</h1>
      <p className="muted">
        Retailers and visitors can report anything that looks wrong: a mangled strain name, a package size in the
        wrong bucket, inventory that has gone stale, an address that has changed, or a duplicate.
      </p>
      <p className="muted small">
        Every report is reviewed by a person before anything changes. Submissions never edit published data
        directly.
      </p>

      <div className="section">
        <CorrectionForm
          dispensaries={directory.map((entry) => ({ slug: entry.slug, name: entry.display_name }))}
        />
      </div>

      <p className="small faint">
        Source owners can also write to <a href={`mailto:${site.contact.sourceOwner}`}>{site.contact.sourceOwner}</a>,
        or read the <a href="/crawler">crawler policy</a> for how to have a source paused.
      </p>
    </article>
  );
}
