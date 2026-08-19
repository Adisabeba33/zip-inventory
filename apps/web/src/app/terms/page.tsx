import type { Metadata } from 'next';
import { robotsFor, site } from '@/lib/site';

export const metadata: Metadata = { title: 'Terms of use', robots: robotsFor('directory') };

export default function TermsPage() {
  return (
    <article className="prose section">
      <h1>Terms of use</h1>
      <p className="notice">
        Draft for review. These terms must be reviewed by counsel before public launch; see the release gates in
        the project documentation.
      </p>

      <h2>What this service is</h2>
      <p>
        {site.name} is an independent index of inventory observations. It is not a dispensary, a retailer, a
        marketplace, a delivery service, an ordering platform, an advertising platform or a recommendation
        service. It does not sell cannabis, take orders, take payment, or act as an intermediary in any
        transaction.
      </p>

      <h2>Accuracy</h2>
      <p>
        Information here describes what an approved inventory source listed at a stated check time. Checks are
        periodic, not continuous. Retail inventory can change at any moment, and what a retailer actually holds
        may differ from what was observed. Nothing here is a guarantee, a representation of availability, or an
        offer.
      </p>

      <h2>Affiliation</h2>
      <p>
        This service is not affiliated with, endorsed by, or sponsored by any retailer named on it. Retailer and
        producer names are used solely to identify the licensee whose public inventory was observed. No retailer
        pays for placement, ordering or inclusion, and no retailer can pay to change how results are ordered.
      </p>

      <h2>Acceptable use</h2>
      <p>
        You may read the site and copy strain lists for your own use. Please do not use the service to
        represent, imply or advertise availability, pricing or an offer to sell.
      </p>

      <h2>Age</h2>
      <p>This service is intended for adults 21 and over where required by law.</p>

      <h2>Contact</h2>
      <p>
        Legal: <a href={`mailto:${site.contact.legal}`}>{site.contact.legal}</a>
      </p>
    </article>
  );
}
