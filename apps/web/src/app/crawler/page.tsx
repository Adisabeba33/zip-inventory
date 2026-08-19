import type { Metadata } from 'next';
import { robotsFor, site } from '@/lib/site';

export const metadata: Metadata = { title: 'Crawler policy', robots: robotsFor('directory') };

export default function CrawlerPage() {
  return (
    <article className="prose section">
      <h1>Crawler policy</h1>

      <h2>Who we are</h2>
      <p>
        {site.name} operates one automated reader. It identifies itself on every request with this user agent:
      </p>
      <p className="mono small card">{site.crawlerUserAgent}</p>
      <p>
        It is never disguised as a browser, as a search engine crawler, or as any other client.
      </p>

      <h2>What it reads</h2>
      <p>
        Only inventory sources that have passed a documented policy review: an approved API or feed, data
        provided with explicit permission, or a retailer-owned public menu whose terms and robots policy were
        reviewed and found to permit automated access. A source that has not passed that review is not read at
        all — the code path that makes a request cannot run without an approval on file.
      </p>
      <p>
        From each source it reads only the fields it needs: an item identifier, the product name, the package
        weight and the product category. It does not collect prices, potency, imagery or descriptions.
      </p>

      <h2>How often</h2>
      <p>
        Once per source per 24 hours by default, or less often where a source specifies a lower rate. Requests
        are spread across the day rather than issued in bursts. It honours <span className="mono">429</span>{' '}
        responses and <span className="mono">Retry-After</span>, backs off conservatively after failures, and
        pauses a source entirely on a <span className="mono">401</span>, <span className="mono">403</span> or{' '}
        <span className="mono">451</span> rather than retrying.
      </p>

      <h2>What it will not do</h2>
      <ul>
        <li>It does not solve or bypass CAPTCHAs, bot challenges or web application firewalls.</li>
        <li>It does not sign in, create accounts, or use credentials or cookies belonging to anyone.</li>
        <li>It does not rotate addresses or identities to get around a rate limit or a block.</li>
        <li>It does not present itself as another client.</li>
        <li>It does not call private endpoints discovered by reverse engineering an authenticated client.</li>
        <li>It does not continue after a source owner has asked it to stop.</li>
      </ul>
      <p>
        If a source presents an access control, the run fails and the source is paused for a human to look at.
        Losing the inventory is the intended outcome.
      </p>

      <h2>Asking us to stop</h2>
      <p>
        Write to <a href={`mailto:${site.contact.sourceOwner}`}>{site.contact.sourceOwner}</a> from a domain or
        role associated with the source, or use the <a href="/corrections">correction form</a> and choose
        “crawler opt-out”. Once we can verify the request, the source is paused immediately — this is a change
        to a database record, not a deployment, so it takes effect at once. We will not argue technically with a
        source owner; if there is anything to discuss, it goes to{' '}
        <a href={`mailto:${site.contact.legal}`}>{site.contact.legal}</a>.
      </p>

      <h2>Contact</h2>
      <p>
        Crawler questions: <a href={`mailto:${site.contact.crawler}`}>{site.contact.crawler}</a>
      </p>
    </article>
  );
}
