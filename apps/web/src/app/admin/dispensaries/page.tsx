import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import { listAdminDispensaries } from '@/lib/adminQueries';
import { formatDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminDispensariesPage() {
  await requireAdmin();
  const rows = await listAdminDispensaries();

  return (
    <>
      <h1>Dispensaries</h1>
      <p className="small faint">
        Directory membership comes from the OCM importer. A retailer with no approved source stays in the
        directory and shows no inventory.
      </p>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>ZIP</th>
              <th>Directory</th>
              <th>Coords</th>
              <th>Source</th>
              <th>Automation</th>
              <th>Gate</th>
              <th>Last success</th>
              <th>Data health</th>
              <th>Strains</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/d/${row.slug}`}>{row.display_name}</Link>
                  <div className="small faint">{row.city}</div>
                </td>
                <td className="mono">{row.zip}</td>
                <td>
                  <span className="status-pill">{row.directory_active ? 'ACTIVE' : 'INACTIVE'}</span>
                </td>
                <td className="small mono">
                  {row.latitude !== null && row.longitude !== null
                    ? `${row.latitude.toFixed(3)}, ${row.longitude.toFixed(3)}`
                    : 'missing'}
                </td>
                <td className="small mono">{row.parser_adapter ?? '—'}</td>
                <td>
                  <span className="status-pill">{row.automation_status ?? 'NO SOURCE'}</span>
                </td>
                <td className="small mono">{row.gate}</td>
                <td className="small nowrap">{formatDateTime(row.last_success_at)}</td>
                <td>
                  <span className="status-pill">{row.freshness}</span>
                </td>
                <td className="mono">{row.current_strains}</td>
                <td className="small nowrap">
                  {row.source_id ? <Link href={`/admin/sources/${row.source_id}`}>Review source</Link> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
