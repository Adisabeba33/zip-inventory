import Link from 'next/link';
import { audit } from '@inventory-index/db';
import { requireAdmin } from '@/lib/admin';
import { getOverview } from '@/lib/adminQueries';
import { formatDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  await requireAdmin();
  const [overview, log] = await Promise.all([getOverview(), audit.listAudit(15)]);

  const tiles = [
    { label: 'Dispensaries in directory', value: `${overview.dispensaries.active} active / ${overview.dispensaries.total}` },
    { label: 'Sources crawlable now', value: overview.crawlable },
    { label: 'Snapshots awaiting confirmation', value: overview.pendingSnapshots, href: '/admin/anomalies' },
    { label: 'Open parser reviews', value: overview.openReviews, href: '/admin/reviews' },
    { label: 'Open corrections', value: overview.openCorrections, href: '/admin/corrections' },
    { label: 'Policy reviews due within 14 days', value: overview.reviewsDueSoon, href: '/admin/sources' },
  ];

  return (
    <>
      <h1>Overview</h1>

      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))' }}>
        {tiles.map((tile) => (
          <div className="card" key={tile.label}>
            <div className="small muted">{tile.label}</div>
            <div className="mono" style={{ fontSize: '1.4rem' }}>{tile.value}</div>
            {tile.href ? (
              <div className="small">
                <Link href={tile.href}>Open</Link>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <section className="section">
        <h2>Sources by automation status</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Status</th>
                <th>Count</th>
                <th>Crawler may run</th>
              </tr>
            </thead>
            <tbody>
              {overview.sourcesByStatus.map((row) => (
                <tr key={row.status}>
                  <td className="mono">{row.status}</td>
                  <td className="mono">{row.count}</td>
                  <td>{['APPROVED', 'EXPLICIT_PERMISSION', 'API_LICENSED'].includes(row.status) ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>Crawl runs, last 24 hours</h2>
        {overview.runsLast24h.length === 0 ? (
          <p className="muted small">No runs in the last 24 hours.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {overview.runsLast24h.map((row) => (
                  <tr key={row.status}>
                    <td className="mono">{row.status}</td>
                    <td className="mono">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section">
        <h2>Recent administrative actions</h2>
        <p className="small faint">
          Every change to what the crawler may do, what the public sees, or what the legal record says is
          recorded here.
        </p>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {log.map((entry) => (
                <tr key={entry.id}>
                  <td className="nowrap small">{formatDateTime(entry.created_at)}</td>
                  <td className="mono small">{entry.actor}</td>
                  <td className="mono small">{entry.action}</td>
                  <td className="mono small">{entry.entity_type}</td>
                  <td className="small">{entry.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
