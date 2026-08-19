import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import { listDiffSummaries } from '@/lib/adminQueries';
import { formatDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminDiffsPage() {
  await requireAdmin();
  const rows = await listDiffSummaries();

  return (
    <>
      <h1>Inventory diffs</h1>
      <p className="small faint">
        The last published snapshot against the one before it, with the change counts currently visible on each
        retailer’s changes tab.
      </p>

      {rows.length === 0 ? (
        <p className="muted">No published snapshots yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Dispensary</th>
                <th>Last observed</th>
                <th>Previous</th>
                <th>Current</th>
                <th>Delta</th>
                <th>Newly listed</th>
                <th>Returned</th>
                <th>No longer listed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const delta = row.previous_count === null ? null : row.current_count - row.previous_count;
                return (
                  <tr key={row.slug}>
                    <td>{row.display_name}</td>
                    <td className="small nowrap">{formatDateTime(row.last_observed)}</td>
                    <td className="mono">{row.previous_count ?? '—'}</td>
                    <td className="mono">{row.current_count}</td>
                    <td className="mono">{delta === null ? '—' : delta > 0 ? `+${delta}` : delta}</td>
                    <td className="mono">{row.newly_listed}</td>
                    <td className="mono">{row.returned}</td>
                    <td className="mono">{row.no_longer_listed}</td>
                    <td className="small nowrap">
                      <Link href={`/d/${row.slug}/changes`}>View changes</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
