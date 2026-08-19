import { aliases } from '@inventory-index/db';
import { requireAdmin } from '@/lib/admin';
import { suggestAliasAction, verifyAliasAction } from '@/app/admin/actions';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminAliasesPage() {
  await requireAdmin();
  const rows = await aliases.listAliases();
  const verified = rows.filter((row) => row.manually_verified);
  const suggested = rows.filter((row) => !row.manually_verified);

  return (
    <>
      <h1>Strain aliases</h1>
      <p className="small faint">
        An alias merges two spellings into one public row. Only verified aliases are applied. Two similar names
        sitting side by side is a smaller mistake than merging two different cultivars, so unverified suggestions
        change nothing until someone confirms them.
      </p>

      <section className="section">
        <h2>Suggest an alias</h2>
        <form action={suggestAliasAction} className="search-row" style={{ maxWidth: '46rem' }}>
          <div className="field" style={{ flex: '1 1 12rem' }}>
            <label htmlFor="alias">Alias (the spelling we see)</label>
            <input id="alias" name="alias" type="text" placeholder="GG #4" required />
          </div>
          <div className="field" style={{ flex: '1 1 12rem' }}>
            <label htmlFor="canonicalName">Canonical name (what to show)</label>
            <input id="canonicalName" name="canonicalName" type="text" placeholder="GG4" required />
          </div>
          <div className="field" style={{ flex: '1 1 12rem' }}>
            <label htmlFor="notes">Notes</label>
            <input id="notes" name="notes" type="text" />
          </div>
          <button type="submit">Add unverified</button>
        </form>
      </section>

      <section className="section">
        <h2>Awaiting verification — {suggested.length}</h2>
        {suggested.length === 0 ? (
          <p className="muted small">Nothing waiting.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Alias</th>
                  <th>Canonical</th>
                  <th>Confidence</th>
                  <th>Source</th>
                  <th>Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {suggested.map((row) => (
                  <tr key={row.id}>
                    <td className="mono">{row.alias}</td>
                    <td className="mono">{row.canonical_name}</td>
                    <td className="mono small">{row.confidence.toFixed(2)}</td>
                    <td className="small">{row.source}</td>
                    <td className="small">{row.notes ?? '—'}</td>
                    <td>
                      <form action={verifyAliasAction}>
                        <input type="hidden" name="aliasId" value={row.id} />
                        <button type="submit" name="decision" value="verify">
                          Verify and publish
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section">
        <h2>Verified — {verified.length}</h2>
        {verified.length === 0 ? (
          <p className="muted small">No verified aliases. Nothing is being merged.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Alias</th>
                  <th>Canonical</th>
                  <th>Verified by</th>
                  <th>Verified</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {verified.map((row) => (
                  <tr key={row.id}>
                    <td className="mono">{row.alias}</td>
                    <td className="mono">{row.canonical_name}</td>
                    <td className="small mono">{row.verified_by ?? '—'}</td>
                    <td className="small nowrap">{formatDate(row.verified_at)}</td>
                    <td>
                      <form action={verifyAliasAction}>
                        <input type="hidden" name="aliasId" value={row.id} />
                        <input type="hidden" name="notes" value="Merge withdrawn from the admin dashboard." />
                        <button type="submit" name="decision" value="unverify">
                          Withdraw
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
