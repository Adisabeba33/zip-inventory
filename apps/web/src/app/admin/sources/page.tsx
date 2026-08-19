import Link from 'next/link';
import { sources } from '@inventory-index/db';
import { requireAdmin } from '@/lib/admin';
import { formatDate, formatDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

const CRAWLABLE = ['APPROVED', 'EXPLICIT_PERMISSION', 'API_LICENSED'];

export default async function AdminSourcesPage() {
  await requireAdmin();
  const rows = await sources.listSources();

  return (
    <>
      <h1>Sources</h1>
      <p className="small faint">
        One row per place we might read inventory from. A source becomes crawlable only through a recorded
        policy review; there is no way to enable one without that record.
      </p>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Domain</th>
              <th>Owner</th>
              <th>Type</th>
              <th>Adapter</th>
              <th>Automation</th>
              <th>Permission</th>
              <th>Terms reviewed</th>
              <th>Robots reviewed</th>
              <th>Next review</th>
              <th>Freq</th>
              <th>Failures</th>
              <th>Last success</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="mono small">{row.source_domain}</td>
                <td className="small">{row.source_owner ?? '—'}</td>
                <td className="small mono">{row.source_type}</td>
                <td className="small mono">{row.parser_adapter}</td>
                <td>
                  <span className="status-pill">{row.automation_status}</span>
                  <div className="small faint">{CRAWLABLE.includes(row.automation_status) && row.active ? 'crawler enabled' : 'crawler disabled'}</div>
                </td>
                <td className="small mono">{row.permission_type ?? '—'}</td>
                <td className="small nowrap">{row.terms_reviewed_at ? formatDate(row.terms_reviewed_at) : 'never'}</td>
                <td className="small nowrap">{row.robots_reviewed_at ? formatDate(row.robots_reviewed_at) : 'never'}</td>
                <td className="small nowrap">{row.next_review_due_at ? formatDate(row.next_review_due_at) : '—'}</td>
                <td className="mono small">{row.allowed_frequency_hours}h</td>
                <td className="mono small">{row.consecutive_failures}</td>
                <td className="small nowrap">{formatDateTime(row.last_success_at)}</td>
                <td className="small nowrap">
                  <Link href={`/admin/sources/${row.id}`}>Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
