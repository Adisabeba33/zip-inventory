import { reviewQueue } from '@inventory-index/db';
import { requireAdmin } from '@/lib/admin';
import { resolveReviewAction } from '@/app/admin/actions';
import { formatDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

const KIND_NOTES: Record<string, string> = {
  UNCLASSIFIED_WEIGHT: 'A flower item whose package size the parser refused to guess at. It was not published.',
  LOW_CONFIDENCE_NAME: 'A title where several segments could have been the cultivar name.',
  ANOMALY: 'A snapshot held back because the item count moved too far.',
  SOURCE_FAILURE: 'A failed or blocked observation. Inventory was left untouched.',
  ALIAS_SUGGESTION: 'A proposed name merge awaiting verification.',
};

export default async function AdminReviewsPage() {
  await requireAdmin();
  const rows = await reviewQueue.listReviews('OPEN');

  return (
    <>
      <h1>Review queue</h1>
      <p className="small faint">
        Everything the pipeline refused to decide on its own. Nothing here is published, and nothing here has
        changed public inventory.
      </p>

      {rows.length === 0 ? (
        <p className="muted">The queue is empty.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Raised</th>
                <th>Kind</th>
                <th>Detail</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="small nowrap">{formatDateTime(row.created_at)}</td>
                  <td>
                    <span className="status-pill">{row.kind}</span>
                    <div className="small faint">{KIND_NOTES[row.kind]}</div>
                  </td>
                  <td className="small mono" style={{ maxWidth: '30rem', wordBreak: 'break-word' }}>
                    {JSON.stringify(row.payload)}
                  </td>
                  <td>
                    <form action={resolveReviewAction} className="search-row">
                      <input type="hidden" name="reviewId" value={row.id} />
                      <button type="submit" name="decision" value="resolve">
                        Resolve
                      </button>
                      <button type="submit" name="decision" value="dismiss">
                        Dismiss
                      </button>
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
