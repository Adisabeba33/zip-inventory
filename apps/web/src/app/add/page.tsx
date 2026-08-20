import type { Metadata } from 'next';
import { AddForm } from './AddForm';
import { robotsFor } from '@/lib/site';

export const metadata: Metadata = { title: 'Read a menu', robots: robotsFor('always-noindex') };
export const dynamic = 'force-dynamic';

/**
 * Share target.
 *
 * Reachable three ways, all of which end in the same screen:
 *   - a share extension or shortcut opening /add?text=...
 *   - a paste
 *   - a link with nothing attached
 */
export default async function AddPage({
  searchParams,
}: {
  searchParams: Promise<{ text?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.text) ? params.text.join('\n') : (params.text ?? '');
  // A very long share can exceed what a URL will carry; the box stays editable.
  const initialText = raw.slice(0, 200_000);

  return (
    <article className="section" style={{ maxWidth: '40rem' }}>
      <h1>Read a menu</h1>
      <p className="muted">
        Hand over the text of a dispensary&rsquo;s flower menu and get the strain names, grouped by package size.
        Parsing happens in this page — the text is not sent anywhere to be read.
      </p>

      <div className="section">
        <AddForm initialText={initialText} />
      </div>
    </article>
  );
}
