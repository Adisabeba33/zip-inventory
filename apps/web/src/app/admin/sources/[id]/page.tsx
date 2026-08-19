import Link from 'next/link';
import { notFound } from 'next/navigation';
import { evaluateSourceGate } from '@inventory-index/core';
import { sources } from '@inventory-index/db';
import { requireAdmin } from '@/lib/admin';
import { getSourceDetail } from '@/lib/adminQueries';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  enableAutomationAction,
  recordPolicyReviewAction,
  setAutomationStatusAction,
} from '@/app/admin/actions';

export const dynamic = 'force-dynamic';

const CRAWLABLE = ['APPROVED', 'EXPLICIT_PERMISSION', 'API_LICENSED'];

export default async function AdminSourcePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const detail = await getSourceDetail(id);
  if (!detail?.source) notFound();

  const source = detail.source;
  const latestReview = detail.reviews[0] ?? null;
  const gate = evaluateSourceGate(sources.toGateInput(source));
  const canEnable = Boolean(
    latestReview?.automation_allowed && latestReview.next_review_due_at.getTime() > Date.now(),
  );

  return (
    <>
      <h1>{source.source_domain}</h1>
      <p className="small faint">
        {detail.dispensarySlug ? <Link href={`/d/${detail.dispensarySlug}`}>{detail.dispensaryName}</Link> : detail.dispensaryName}
        {' · '}
        <span className="mono">{source.source_url}</span>
      </p>

      <section className="section">
        <h2>Source card</h2>
        <div className="table-wrap">
          <table className="data">
            <tbody>
              <tr><th>Source owner</th><td>{source.source_owner ?? 'not determined'}</td></tr>
              <tr><th>Platform</th><td>{source.source_platform ?? '—'}</td></tr>
              <tr><th>Type</th><td className="mono">{source.source_type}</td></tr>
              <tr><th>Terms URL</th><td>{source.terms_url ? <a href={source.terms_url}>{source.terms_url}</a> : '—'}</td></tr>
              <tr><th>Robots URL</th><td>{source.robots_url ? <a href={source.robots_url}>{source.robots_url}</a> : '—'}</td></tr>
              <tr><th>Automation allowed?</th><td>{latestReview ? (latestReview.automation_allowed ? 'yes, per review' : 'no, per review') : 'not reviewed'}</td></tr>
              <tr><th>Permission evidence</th><td>{source.permission_reference ?? '—'}</td></tr>
              <tr><th>Reviewed</th><td>{latestReview ? formatDate(latestReview.reviewed_at) : 'never'}</td></tr>
              <tr><th>Next review due</th><td>{source.next_review_due_at ? formatDate(source.next_review_due_at) : '—'}</td></tr>
              <tr><th>Allowed frequency</th><td className="mono">one observation every {source.allowed_frequency_hours}h</td></tr>
              <tr><th>Parser adapter</th><td className="mono">{source.parser_adapter}</td></tr>
              <tr><th>Current gate verdict</th><td className="mono">{gate.reason} — {gate.detail}</td></tr>
              <tr><th>Notes</th><td>{source.notes ?? '—'}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>Automation</h2>
        {!canEnable ? (
          <p className="notice">
            <strong>Enable automation is unavailable.</strong>{' '}
            {latestReview
              ? latestReview.automation_allowed
                ? 'The policy review on file has expired. Record a new review first.'
                : 'The policy review on file does not permit automated access.'
              : 'No source policy review is on file. Record one below first.'}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <form action={enableAutomationAction} className="search-row">
            <input type="hidden" name="sourceId" value={source.id} />
            <div className="field">
              <label htmlFor="status">Enable as</label>
              <select id="status" name="status" defaultValue="APPROVED" disabled={!canEnable}>
                <option value="APPROVED">APPROVED</option>
                <option value="EXPLICIT_PERMISSION">EXPLICIT_PERMISSION</option>
                <option value="API_LICENSED">API_LICENSED</option>
              </select>
            </div>
            <button type="submit" className="primary" disabled={!canEnable}>
              Enable automation
            </button>
          </form>

          <form action={setAutomationStatusAction} className="search-row">
            <input type="hidden" name="sourceId" value={source.id} />
            <div className="field">
              <label htmlFor="pause-status">Stop crawling as</label>
              <select id="pause-status" name="status" defaultValue="PAUSED">
                <option value="PAUSED">PAUSED</option>
                <option value="LEGAL_HOLD">LEGAL_HOLD</option>
                <option value="AUTOMATION_PROHIBITED">AUTOMATION_PROHIBITED</option>
              </select>
            </div>
            <div className="field" style={{ flex: '1 1 16rem' }}>
              <label htmlFor="pause-reason">Reason</label>
              <input id="pause-reason" name="reason" type="text" placeholder="Source owner asked us to stop" />
            </div>
            <button type="submit">Stop</button>
          </form>
        </div>
        <p className="small faint" style={{ marginTop: '0.75rem' }}>
          Stopping takes effect immediately for the next scheduled run — it is a database change, not a
          deployment. Currently {CRAWLABLE.includes(source.automation_status) && source.active ? 'enabled' : 'disabled'}.
        </p>
      </section>

      <section className="section">
        <h2>Record a source policy review</h2>
        <p className="small faint">
          This is the legal audit trail: who determined the owner, what the terms and robots policy said, what was
          decided and why, and when it must be looked at again. Do not enable a source without it.
        </p>
        <form action={recordPolicyReviewAction} className="stack" style={{ maxWidth: '44rem' }}>
          <input type="hidden" name="sourceId" value={source.id} />

          <div>
            <label htmlFor="sourceOwner">Who owns the endpoint?</label>
            <input id="sourceOwner" name="sourceOwner" type="text" defaultValue={source.source_owner ?? ''} />
            <p className="small faint">
              If the retailer page embeds a menu served by another company, the owner is that company and this
              is a third-party platform source.
            </p>
          </div>

          <div>
            <label htmlFor="termsUrl">Terms of service URL</label>
            <input id="termsUrl" name="termsUrl" type="text" defaultValue={source.terms_url ?? ''} />
          </div>
          <label className="small">
            <input type="checkbox" name="termsChecked" style={{ width: 'auto', marginRight: '0.4rem' }} /> I read
            the terms of service
          </label>
          <div>
            <label htmlFor="termsSummary">What the terms say about automated access</label>
            <textarea id="termsSummary" name="termsSummary" style={{ minHeight: '4.5rem' }} />
          </div>

          <div>
            <label htmlFor="robotsUrl">robots.txt URL</label>
            <input id="robotsUrl" name="robotsUrl" type="text" defaultValue={source.robots_url ?? ''} />
          </div>
          <label className="small">
            <input type="checkbox" name="robotsChecked" style={{ width: 'auto', marginRight: '0.4rem' }} /> I
            checked robots.txt
          </label>
          <div>
            <label htmlFor="robotsSummary">What robots.txt says</label>
            <textarea id="robotsSummary" name="robotsSummary" style={{ minHeight: '4.5rem' }} />
            <p className="small faint">
              robots.txt is one input, not the whole review. If robots permits but the terms prohibit automated
              extraction, automation stays off.
            </p>
          </div>

          <div>
            <label htmlFor="apiDocsUrl">API documentation URL</label>
            <input id="apiDocsUrl" name="apiDocsUrl" type="text" />
          </div>

          <div className="search-row">
            <div className="field">
              <label htmlFor="permissionType">Permission type</label>
              <select id="permissionType" name="permissionType" defaultValue="NONE">
                <option value="NONE">NONE</option>
                <option value="PUBLIC_TERMS_REVIEW">PUBLIC_TERMS_REVIEW</option>
                <option value="WRITTEN_PERMISSION">WRITTEN_PERMISSION</option>
                <option value="API_AGREEMENT">API_AGREEMENT</option>
                <option value="DIRECT_FEED_AGREEMENT">DIRECT_FEED_AGREEMENT</option>
              </select>
            </div>
            <div className="field" style={{ flex: '1 1 18rem' }}>
              <label htmlFor="permissionReference">Permission reference</label>
              <input
                id="permissionReference"
                name="permissionReference"
                type="text"
                placeholder="Agreement, email or ticket reference"
              />
            </div>
            <div className="field" style={{ flex: '0 1 9rem' }}>
              <label htmlFor="frequencyHours">Frequency (h)</label>
              <input id="frequencyHours" name="frequencyHours" type="text" defaultValue="24" />
            </div>
          </div>

          <div>
            <label htmlFor="rationale">Decision and rationale</label>
            <textarea id="rationale" name="rationale" required />
          </div>

          <div className="search-row">
            <div className="field">
              <label htmlFor="automationAllowed">Automated access is</label>
              <select id="automationAllowed" name="automationAllowed" defaultValue="no">
                <option value="no">not permitted</option>
                <option value="yes">permitted</option>
              </select>
            </div>
            <button type="submit" className="primary">
              Record review
            </button>
          </div>
        </form>
      </section>

      <section className="section">
        <h2>Review history</h2>
        {detail.reviews.length === 0 ? (
          <p className="muted small">No reviews recorded.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Reviewed</th>
                  <th>By</th>
                  <th>Decision</th>
                  <th>Rationale</th>
                  <th>Permission</th>
                  <th>Next due</th>
                </tr>
              </thead>
              <tbody>
                {detail.reviews.map((review) => (
                  <tr key={review.id}>
                    <td className="small nowrap">{formatDate(review.reviewed_at)}</td>
                    <td className="small mono">{review.reviewed_by}</td>
                    <td className="small mono">{review.decision}</td>
                    <td className="small">{review.decision_rationale}</td>
                    <td className="small mono">{review.permission_type ?? '—'}</td>
                    <td className="small nowrap">{formatDate(review.next_review_due_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section">
        <h2>Recent runs</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Started</th>
                <th>Status</th>
                <th>Gate</th>
                <th>Accepted</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {detail.recentRuns.map((run) => (
                <tr key={run.id}>
                  <td className="small nowrap">{formatDateTime(run.started_at)}</td>
                  <td><span className="status-pill">{run.status}</span></td>
                  <td className="small mono">{run.gate_reason}</td>
                  <td className="mono small">{run.accepted_item_count}</td>
                  <td className="small">{run.error_code ? `${run.error_code}: ${run.error_message}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
