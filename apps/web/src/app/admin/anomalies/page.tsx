import { query, snapshots } from '@inventory-index/db';
import { requireAdmin } from '@/lib/admin';
import { reviewSnapshotAction } from '@/app/admin/actions';
import { formatDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminAnomaliesPage() {
  await requireAdmin();
  const pending = await snapshots.listPendingConfirmation();

  const names = new Map<string, string>();
  if (pending.length > 0) {
    const { rows } = await query<{ id: string; display_name: string }>(
      'SELECT id, display_name FROM dispensaries WHERE id = ANY($1)',
      [pending.map((snapshot) => snapshot.dispensary_id)],
    );
    for (const row of rows) names.set(row.id, row.display_name);
  }

  return (
    <>
      <h1>Anomalies</h1>
      <p className="small faint">
        Snapshots held back because the item count moved more than the threshold allows. The previous published
        snapshot is still live and untouched; nothing here has changed what the public sees.
      </p>

      {pending.length === 0 ? (
        <p className="muted">Nothing is waiting for confirmation.</p>
      ) : (
        pending.map((snapshot) => (
          <section className="card section" key={snapshot.id}>
            <h2>{names.get(snapshot.dispensary_id) ?? snapshot.dispensary_id}</h2>
            <p className="small mono">
              observed {formatDateTime(snapshot.observed_at)} · {snapshot.item_count} entries ·{' '}
              parser {snapshot.parser_version}
            </p>
            <p className="notice notice--warning">{snapshot.anomaly_reason}</p>

            <form action={reviewSnapshotAction} className="search-row">
              <input type="hidden" name="snapshotId" value={snapshot.id} />
              <div className="field" style={{ flex: '1 1 20rem' }}>
                <label htmlFor={`reason-${snapshot.id}`}>Reason</label>
                <input
                  id={`reason-${snapshot.id}`}
                  name="reason"
                  type="text"
                  placeholder="Re-checked the source; the retailer really did remove these."
                />
              </div>
              <button type="submit" name="decision" value="accept">
                Accept snapshot
              </button>
              <button type="submit" name="decision" value="reject">
                Reject snapshot
              </button>
            </form>
            <p className="small faint" style={{ marginTop: '0.6rem' }}>
              Accepting records the decision; the next successful observation applies the change. Rejecting keeps
              the previous snapshot live and leaves the source to be re-checked on its normal schedule.
            </p>
          </section>
        ))
      )}
    </>
  );
}
