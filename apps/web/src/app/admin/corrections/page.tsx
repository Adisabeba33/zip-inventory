import { corrections } from '@inventory-index/db';
import { requireAdmin } from '@/lib/admin';
import { resolveCorrectionAction } from '@/app/admin/actions';
import { formatDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminCorrectionsPage() {
  await requireAdmin();
  const rows = await corrections.listCorrections();

  return (
    <>
      <h1>Corrections</h1>
      <p className="small faint">
        Reports from visitors and retailers. Nothing submitted here edits production data; a person decides what,
        if anything, changes. A crawler opt-out request should be actioned by pausing the source on its source
        page.
      </p>

      {rows.length === 0 ? (
        <p className="muted">No reports.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Received</th>
                <th>Status</th>
                <th>Issue</th>
                <th>Retailer</th>
                <th>Details</th>
                <th>Reply to</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="small nowrap">{formatDateTime(row.created_at)}</td>
                  <td><span className="status-pill">{row.status}</span></td>
                  <td className="small mono">{row.issue_type}</td>
                  <td className="small">{row.dispensary_text ?? '—'}</td>
                  <td className="small" style={{ maxWidth: '24rem' }}>{row.details}</td>
                  <td className="small">{row.contact_email ?? '—'}</td>
                  <td>
                    <form action={resolveCorrectionAction} className="stack-tight">
                      <input type="hidden" name="correctionId" value={row.id} />
                      <input name="resolution" type="text" placeholder="What was done" />
                      <div className="search-row">
                        <button type="submit" name="status" value="IN_REVIEW">In review</button>
                        <button type="submit" name="status" value="ACTIONED">Actioned</button>
                        <button type="submit" name="status" value="DISMISSED">Dismiss</button>
                      </div>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
