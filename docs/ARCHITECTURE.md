# Architecture

## The idea

This is not "a bot scrapes the internet and copies menus". It is an approved-source
observation engine that stores a minimal set of factual inventory observations and publishes
normalised historical snapshots. That distinction drives every design decision below.

## Processes

```
        OCM directory export
                 |
                 v
   +-------------------------+
   |  importer (worker CLI)  |
   +-------------------------+
                 |
                 v
   +-------------------------------------------------------------+
   |                        PostgreSQL                            |
   |  dispensaries · inventory_sources · source_policy_reviews    |
   |  crawl_runs · inventory_snapshots · inventory_observations   |
   |  inventory_entries · snapshot_entries · strain_aliases       |
   |  corrections · review_queue · audit_log · legal_notices      |
   +-------------------------------------------------------------+
        ^                                        |
        |                                        v
   +---------------+                   +--------------------+
   | crawler       |                   | web app            |
   | worker(s)     |                   | public site + API  |
   | scheduler     |                   | admin dashboard    |
   +---------------+                   +--------------------+
        |                                        ^
        v                                        |
   approved sources only                    visitors
```

The web app and the crawler never talk to each other, and the web app never talks to a
retailer. Opening a page reads our own database. A crawler that is down, broken or paused is
invisible to the site except as a "last successfully checked" timestamp that stops moving.

## Packages

### `packages/core`

Pure functions, no IO, no clock reads, no database. Everything with legal weight lives here
so it can be tested exhaustively:

| Module | Responsibility |
| --- | --- |
| `weights.ts` | Normalise a weight into `EIGHTH`/`QUARTER`/`HALF`/`OUNCE`, or refuse |
| `strainName.ts` | Strip packaging noise; never rewrite a cultivar; conservative match keys |
| `productType.ts` | Flower only; strong and weak exclusion tiers; subtype detection |
| `dedupe.ts` | One row per (weight, cultivar) with a listing count |
| `checksum.ts` | Deterministic snapshot fingerprint |
| `anomaly.ts` | Block publication on an implausible collapse |
| `status.ts` | The status model and the two-miss confirmation |
| `diff.ts` | Preview a snapshot's effect without applying it |
| `freshness.ts` | Fresh / stale / unavailable, from the last *successful* check |
| `gate.ts` | The single decision point for "may we fetch this source now" |
| `scheduler.ts` | Deterministic daily slots, retry ladder, HTTP failure classification |
| `vocabulary.ts` | The words the product does and does not use |
| `geo.ts` | Haversine distance, ZIP normalisation |

### `packages/db`

Schema, migrations and repositories. Notable choices:

- **No column exists for price, potency, description, imagery or reviews.** A field that does
  not exist cannot leak into an API response, a cache, a log or a backup.
- **`raw_fetch_artifacts` is not an archive.** Bodies are stored with a hard `expires_at`
  (72 hours maximum, 48 by default) so a parser can be debugged, then purged to a hash by the
  maintenance job.
- **`source_policy_reviews` is the legal audit trail.** Who determined the endpoint's owner,
  what the terms and robots policy said, what was decided and why, what permission backs it,
  and when it must be looked at again.
- **`inventory_entries` identity is `(dispensary_id, package_weight, match_key)`.** The match
  key is conservative: it folds case, whitespace and quote style and nothing else.

### `apps/worker`

```
gate → fetch → parse → normalise → de-duplicate → checksum → anomaly → diff → publish
```

Only the last step touches published state, and it is reached only when everything before it
succeeded. Adapters (`fixture`, `permitted-json-api`, `retailer-html`) live behind a small
interface and are versioned; the version is recorded on every run, so a parser change that
produces odd results can be traced.

`http.ts` is the only outbound request helper in the project. One identifiable user agent, a
per-host delay, `Retry-After` honoured, and challenge-page detection that fails the run
rather than trying to get past anything.

### `apps/web`

Next.js App Router. Server components read through `src/lib/queries.ts`; there is no other
path from a visitor to the data. Route handlers under `/api` expose the same normalised
fields — never raw scraped data. The admin dashboard sits behind a shared-secret cookie and
every mutation writes to the audit log.

## The main data flow

1. OCM directory export → licensed dispensary records (identity: licence id + address + UUID)
2. A human reviews each candidate source and records the decision
3. Only if that review permits automation does the source become crawlable
4. Once a day, in a deterministic per-source slot, one observation is made
5. Only the four factual fields are parsed
6. Strain names and weights are normalised; anything uncertain goes to review, not to the site
7. Duplicates collapse to one row per cultivar per package size
8. The snapshot is fingerprinted and checked for anomalies
9. It is compared with the last published snapshot
10. `first_seen` / `last_seen` / statuses advance
11. Current inventory is published
12. A visitor searches a ZIP, picks a retailer, picks a weight, copies the names

## The rule for contributors

If you ever face a choice between *getting more inventory* and *working around a source's
restrictions or doing something legally doubtful*, choose not to get the inventory.

"Inventory tracking unavailable" on a page is a better outcome than infrastructure built on
getting around somebody else's controls.
