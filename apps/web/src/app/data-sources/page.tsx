import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, site } from '@/lib/site';

export const metadata: Metadata = { title: 'How inventory data works', robots: robotsFor('directory') };

export default function DataSourcesPage() {
  return (
    <article className="prose section">
      <h1>How inventory data works</h1>

      <h2>The retailer directory</h2>
      <p>
        Which retailers appear here is decided by one thing: the New York Office of Cannabis Management’s
        published directory of licensed adult-use dispensaries. That is the canonical source of a retailer’s
        identity, address and licence status. We do not use mapping products or menu aggregators to decide
        whether a retailer is licensed.
      </p>
      <p>
        A geocoding service may be used to turn a published address into coordinates for distance sorting,
        where that service’s licence permits it. It never decides who is listed.
      </p>

      <h2>Inventory observations</h2>
      <p>
        Inventory is read only from sources where automated access has been reviewed and permitted, in this
        order of preference:
      </p>
      <ol>
        <li>An official API or feed the retailer has licensed or permitted us to use.</li>
        <li>Data provided directly by the retailer with explicit permission.</li>
        <li>
          A public menu on a retailer-owned website, and only where a documented review of that site’s terms,
          robots policy and any API conditions concluded that automated access is permitted.
        </li>
      </ol>
      <p>
        We do not automatically read third-party menu platforms or aggregators simply because a browser can
        reach them. Where a retailer’s page embeds a menu served by another company, that endpoint belongs to
        that company and needs its own review and its own permission.
      </p>
      <p>
        Where no approved source exists, the retailer still appears in the directory and the inventory section
        says so. Directory coverage and inventory coverage are two different things, on purpose.
      </p>

      <h2>What “listed” means</h2>
      <dl className="definition-list">
        <dt>Currently listed</dt>
        <dd>The item was present in the most recent successfully processed snapshot of an approved source.</dd>
        <dt>Newly listed</dt>
        <dd>
          The first time this service observed that strain in that package size at that retailer. It does not
          mean the retailer has a new product.
        </dd>
        <dt>Returned</dt>
        <dd>Observed again after a period of not being listed.</dd>
        <dt>No longer listed</dt>
        <dd>
          Absent from two consecutive successful checks. A single miss changes nothing, because a menu bug, a
          paging error or an outage looks exactly like a removal.
        </dd>
        <dt>Last observed</dt>
        <dd>The time of the most recent successful check that saw the item.</dd>
      </dl>
      <p>
        Observations are periodic, roughly once a day, and never real-time. An item appearing here means it was
        listed in a permitted source when we last looked. It is not a statement about what is physically on a
        retailer’s shelf, and actual retailer inventory may differ.
      </p>

      <h2>What we keep</h2>
      <p>
        The permanent record holds only the facts this service needs: the retailer, the strain name, the package
        size, the observation timestamps, an internal source item identifier and the observation status. We do
        not keep prices, potency figures, product descriptions, promotional wording, photographs, page layouts or
        reviews. Raw fetched pages are retained briefly for parser debugging and then discarded.
      </p>

      <h2>What this service does not do</h2>
      <p>
        It does not sell cannabis, process orders, take payment, display prices, rank retailers by anything other
        than distance, accept payment for placement, or receive any commission connected to a sale.
      </p>

      <p className="small faint">
        Something wrong? <Link href="/corrections">Report a data correction</Link>. Source owners can also{' '}
        <Link href="/crawler">read our crawler policy</Link> or write to{' '}
        <a href={`mailto:${site.contact.sourceOwner}`}>{site.contact.sourceOwner}</a>.
      </p>
    </article>
  );
}
