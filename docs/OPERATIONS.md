# Operations

## Environment

Copy `.env.example` to `.env`. The flags that matter:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PUBLIC_LAUNCH_ENABLED` | `false` | While false, every page carries a staging notice |
| `PUBLIC_INDEXING_ENABLED` | `false` | Retailer pages are `noindex` until this and launch are both on |
| `AGE_GATE_ENABLED` | `true` | The 21+ interstitial. No date of birth is collected either way |
| `CRAWLER_NETWORK_ENABLED` | `false` | While false, network adapters refuse to fetch at all |
| `RAW_RETENTION_HOURS` | `48` | Raw body retention, capped at 72 |
| `ADMIN_API_TOKEN` | — | Required for the admin dashboard; 16+ characters |

`CRAWLER_NETWORK_ENABLED=false` is a second safety catch on top of the source gate: even a
misconfigured approved source cannot make a request while it is off.

## First run

```bash
npm install
npm run migrate
npm run seed                            # invented data, local fixture source only
npm run worker:cli -- seed-inventory    # build a realistic observation history
npm run web
```

## Importing the real directory

Download the licensed adult-use dispensary directory published by the New York Office of
Cannabis Management, then:

```bash
npm run worker:cli -- import-zips ./data/zcta-gazetteer.txt
npm run worker:cli -- import-ocm ./data/ocm-directory.csv --status Open
```

The importer:

- matches on licence identifier + address, never on trading name, so a rebrand does not
  create a second retailer;
- falls back to the ZIP centroid when a row has no coordinates, and reports how often it did;
- marks any retailer absent from the import as `directory_active = false`, keeping history
  and withdrawing current inventory, without drawing any conclusion about why.

Keep the file you imported. `--status` filters to the statuses you accept; check the actual
column values in the export before choosing them.

## Adding a source

1. Insert the source row (URL, domain, adapter, parser config), leaving it
   `PENDING_REVIEW` and inactive.
2. Open `/admin/sources/<id>` and work through [SOURCE-POLICY.md](SOURCE-POLICY.md).
3. Record the policy review.
4. If it permits automation, "Enable automation" becomes available. It refuses otherwise.
5. `npm run worker:cli -- plan` shows the source's slot and whether it is due.

## Daily operation

```bash
npm run worker            # long-running: checks every 15 minutes for due sources
npm run worker:once       # single pass, for cron
```

Confine observations to an off-peak window with `--window 2-6`.

`maintenance` runs after every pass and purges expired raw bodies. Run it standalone if the
worker is not running:

```bash
npm run worker:cli -- maintenance
```

## What to check daily

`/admin` shows all of it:

- **Anomalies** — snapshots held for confirmation. The previous snapshot is still live. Look
  at the source, decide, and record why.
- **Review queue** — weights the parser refused to guess at and titles it could not resolve.
  Each one is an item that was *not* published.
- **Crawl runs** — statuses and error codes. Repeated `FAILED` on one source means the parser
  or the source has changed. Repeated `BLOCKED` means the source is refusing us: stop, do not
  adjust the crawler to get around it.
- **Corrections** — reports from visitors and retailers.
- **Sources** — anything approaching `next_review_due_at`.

## Handling a crawler opt-out

1. Verify the request comes from someone associated with the source.
2. Open the source's admin page and set `PAUSED` (or `LEGAL_HOLD` if legal is involved), with
   a reason.
3. It takes effect on the next scheduled run, with no deployment.
4. Reply, and pass anything contentious to legal.

## Backups

Back up the database daily. The rows that are painful to lose are not the inventory — that
rebuilds itself in a day — but:

- `dispensaries` (directory identity)
- `strain_aliases` (curated merges)
- `source_policy_reviews` (**the legal audit trail**)
- `inventory_sources` (permission state)
- `audit_log`
- `legal_notices`

`source_policy_reviews` is the one that cannot be reconstructed. It is the record of why
automated access to each source was permitted at all.

## Admin identity

The dashboard uses a single shared token, and the audit log records `ADMIN_ACTOR` (default
`admin`) as the actor. Set `ADMIN_ACTOR` per operator, or move to per-user authentication
before more than one person uses it — an audit trail that cannot name a person is a weak one.
