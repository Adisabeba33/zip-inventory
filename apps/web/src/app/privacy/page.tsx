import type { Metadata } from 'next';
import { robotsFor, site } from '@/lib/site';

export const metadata: Metadata = { title: 'Privacy', robots: robotsFor('directory') };

export default function PrivacyPage() {
  return (
    <article className="prose section">
      <h1>Privacy</h1>
      <p className="notice">Draft for review. Counsel must review this before public launch.</p>

      <h2>No account, no profile</h2>
      <p>
        Using this service does not require an account. We do not ask for an email address, a phone number, a
        name, a postal address, a date of birth or a precise location, and there is nothing in the system that
        builds a profile of what you looked at.
      </p>

      <h2>ZIP search</h2>
      <p>
        A ZIP code you type is used to run one search and is not attached to you or kept as a search history. The
        site never requests device location permission.
      </p>

      <h2>Age confirmation</h2>
      <p>
        If the age confirmation is enabled, your answer is stored as a single value in your own browser. No date
        of birth is collected and nothing about the confirmation is sent to us.
      </p>

      <h2>Trackers</h2>
      <p>
        There are no advertising trackers, no advertising pixels and no third-party marketing scripts on this
        site. If we ever add analytics, it will be a privacy-conscious aggregate measure, described here first.
      </p>

      <h2>Logs</h2>
      <p>
        Ordinary server and security logs exist and may briefly include an IP address. They are kept for a short
        retention window for security and abuse handling only, and are not used to build behavioural profiles.
      </p>

      <h2>Corrections</h2>
      <p>
        If you give an email address on the correction form it is optional and used only to reply about that
        report.
      </p>

      <h2>Contact</h2>
      <p>
        Privacy questions: <a href={`mailto:${site.contact.legal}`}>{site.contact.legal}</a>
      </p>
    </article>
  );
}
