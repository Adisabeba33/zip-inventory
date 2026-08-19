import Link from 'next/link';
import { crawlRuns } from '@inventory-index/db';
import { requireAdmin } from '@/lib/admin';
import { formatDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminRunsPage() {
  await requireAdmin();
  const runs = await crawlRuns.listRuns(120);

  return (
    <>
      <h1>Crawl runs</h1>
      <p className="small faint">
        Every attempt, including the ones the gate refused, so “did we ever request this, and under what
        authority” is answerable later.
      </p>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Started</th>
              <th>Status</th>
              <th>Gate</th>
              <th>HTTP</th>
              <th>Raw</th>
              <th>Parsed</th>
              <th>Accepted</th>
              <th>Rejected</th>
              <th>Anomaly</th>
              <th>Parser</th>
              <th>Error</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td className="small nowrap">{formatDateTime(run.started_at)}</td>
                <td><span className="status-pill">{run.status}</span></td>
                <td className="small mono">{run.gate_allowed ? 'allowed' : run.gate_reason}</td>
                <td className="mono small">{run.http_status ?? '—'}</td>
                <td className="mono small">{run.raw_item_count}</td>
                <td className="mono small">{run.parsed_item_count}</td>
                <td className="mono small">{run.accepted_item_count}</td>
                <td className="mono small">{run.rejected_item_count}</td>
                <td className="mono small">{run.anomaly_score === null ? '—' : run.anomaly_score.toFixed(2)}</td>
                <td className="mono small">{run.parser_version ?? '—'}</td>
                <td className="small">{run.error_code ?? '—'}</td>
                <td className="small nowrap"><Link href={`/admin/sources/${run.source_id}`}>Source</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
