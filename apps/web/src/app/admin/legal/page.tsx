import { legalNotices } from '@inventory-index/db';
import { requireAdmin } from '@/lib/admin';
import { updateLegalNoticeAction } from '@/app/admin/actions';
import { formatDateTime } from '@/lib/format';
import { site } from '@/lib/site';

export const dynamic = 'force-dynamic';

const SLOT_NOTES: Record<string, string> = {
  site_footer: 'Appears in the footer of every page.',
  dispensary_page: 'The independent-service disclaimer on every retailer page.',
  age_gate: 'The question the 21+ interstitial asks.',
  data_sources: 'Optional extra copy on the data sources page.',
  crawler_policy: 'Optional extra copy on the crawler policy page.',
  terms: 'Optional extra copy on the terms page.',
  privacy: 'Optional extra copy on the privacy page.',
  part_129_disclosures:
    'Reserved for jurisdiction-specific disclosures. If counsel decides particular regulatory disclosures apply to this service, put them here and they appear site-wide with no redesign.',
};

export default async function AdminLegalPage() {
  await requireAdmin();
  const existing = await legalNotices.getNotices();
  const bySlot = new Map(existing.map((row) => [row.slot, row]));

  return (
    <>
      <h1>Legal and policy</h1>

      <section className="section">
        <h2>Release gates</h2>
        <p className="small faint">
          These are environment flags, not database values, so changing them is a deliberate deployment
          decision. See docs/LEGAL-RELEASE-GATES.md for the full checklist.
        </p>
        <div className="table-wrap">
          <table className="data">
            <tbody>
              <tr>
                <th>PUBLIC_LAUNCH_ENABLED</th>
                <td className="mono">{String(site.publicLaunchEnabled)}</td>
                <td className="small">While false the site shows a staging notice on every page.</td>
              </tr>
              <tr>
                <th>PUBLIC_INDEXING_ENABLED</th>
                <td className="mono">{String(site.publicIndexingEnabled)}</td>
                <td className="small">Retailer inventory pages are noindex until this and public launch are both on.</td>
              </tr>
              <tr>
                <th>AGE_GATE_ENABLED</th>
                <td className="mono">{String(site.ageGateEnabled)}</td>
                <td className="small">The 21+ interstitial. No date of birth is collected either way.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>Configurable legal copy</h2>
        <p className="small faint">
          Regulatory wording is configuration, not code. Editing a slot here changes it everywhere that slot is
          used, with no redesign and no deployment.
        </p>

        {Object.entries(SLOT_NOTES).map(([slot, note]) => {
          const row = bySlot.get(slot);
          return (
            <form action={updateLegalNoticeAction} className="card stack" key={slot} style={{ marginBottom: '1rem' }}>
              <input type="hidden" name="slot" value={slot} />
              <div>
                <h3 className="mono" style={{ marginBottom: '0.15rem' }}>{slot}</h3>
                <p className="small faint" style={{ margin: 0 }}>{note}</p>
                {row ? (
                  <p className="small faint" style={{ margin: '0.25rem 0 0' }}>
                    Last updated {formatDateTime(row.updated_at)} by {row.updated_by ?? 'unknown'}.
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor={`title-${slot}`}>Title</label>
                <input id={`title-${slot}`} name="title" type="text" defaultValue={row?.title ?? ''} />
              </div>
              <div>
                <label htmlFor={`body-${slot}`}>Body</label>
                <textarea id={`body-${slot}`} name="body" defaultValue={row?.body ?? ''} required />
              </div>
              <div className="search-row">
                <div className="field">
                  <label htmlFor={`variant-${slot}`}>Variant</label>
                  <select id={`variant-${slot}`} name="variant" defaultValue={row?.variant ?? 'LEGAL'}>
                    <option value="NEUTRAL">NEUTRAL</option>
                    <option value="WARNING">WARNING</option>
                    <option value="LEGAL">LEGAL</option>
                  </select>
                </div>
                <label className="small" style={{ alignSelf: 'center' }}>
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={row?.enabled ?? true}
                    style={{ width: 'auto', marginRight: '0.4rem' }}
                  />
                  Enabled
                </label>
                <button type="submit" className="primary">Save</button>
              </div>
            </form>
          );
        })}
      </section>
    </>
  );
}
