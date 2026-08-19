# Independent Dispensary Inventory Index

An independent index that answers one question:

> Which flower strains were listed in a licensed New York retailer's public inventory at the
> last check, and in which standard package sizes?

Enter a ZIP code, pick a retailer, pick a package size (1/8, 1/4, 1/2 or 1 oz), read an
alphabetical list of strain names, and copy the whole list with one tap.

It is not a dispensary, a marketplace, a store, an ordering service, an advertising platform
or a recommendation engine. There are no prices, no photographs, no potency figures, no
brands, no ratings, no promotions, no purchase links, no cart and no checkout — not hidden
behind a flag, but absent from the schema.

> **Not ready for public launch.** `PUBLIC_LAUNCH_ENABLED` and `PUBLIC_INDEXING_ENABLED`
> default to `false`, and must stay that way until the checklist in
> [docs/LEGAL-RELEASE-GATES.md](docs/LEGAL-RELEASE-GATES.md) is complete — including review
> by a New York attorney familiar with both the Cannabis Law and internet/data law. The
> definition of a third-party platform in the New York regulations is written broadly enough
> that an informational service may fall inside it, and that question needs a real answer
> before anything goes public.

## Layout

```
packages/core     Pure domain rules. No IO, no clock, no database. Heavily unit tested.
packages/db       Postgres schema, migrations and repositories.
apps/worker       The observation pipeline: scheduler, source gate, adapters, importers.
apps/web          Next.js public site, public API and admin dashboard.
```

The web app and the crawler are separate processes that share only the database. A crawler
failure cannot take the public site down, and the public site never makes a request to a
retailer — visitors always read the last successfully observed snapshot from our own
database.

## Getting started

```bash
npm install
cp .env.example .env          # then set DATABASE_URL and ADMIN_API_TOKEN

npm run migrate               # create the schema
npm run seed                  # invented retailers, a local fixture source, legal copy
npm run worker:cli -- seed-inventory   # replay the fixtures to build a realistic history

npm run web                   # http://localhost:3000
```

The seed makes no outbound requests. Its only inventory source is a local fixture file, and
the retailers in it are invented — no real licensee, brand or website is represented.

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Every workspace's tests |
| `npm run typecheck` | Typecheck every workspace |
| `npm run migrate` | Apply pending migrations |
| `npm run seed` | Seed development data |
| `npm run web` | Run the site, API and admin |
| `npm run worker` | Long-running observation scheduler |
| `npm run worker:once` | Observe everything currently due, once |
| `npm run worker:cli -- plan` | Show today's plan and why each source is or is not due |
| `npm run worker:cli -- import-ocm <file>` | Import the licensed retailer directory |
| `npm run worker:cli -- import-zips <file>` | Import ZIP centroids |
| `npm run worker:cli -- run-source <id>` | Observe one source now, still subject to the gate |
| `npm run worker:cli -- maintenance` | Purge expired raw fetch artifacts |

## The rules that matter

These are enforced in code and covered by tests, not left to reviewer discipline:

- **No source is read without a recorded policy review that permits it.** `evaluateSourceGate`
  is the only thing that can authorise a request, and the verdict is written onto every crawl
  run. A source in any state other than `APPROVED`, `EXPLICIT_PERMISSION` or `API_LICENSED` is
  not fetched.
- **Nothing works around an access control.** A CAPTCHA, a bot challenge, a WAF page, a login
  wall, a 401/403/451 — each fails the run and pauses the source. There is no bypass path, no
  credential store, no address rotation and no user-agent disguise. Losing the inventory is the
  intended outcome.
- **A failed observation never changes inventory.** Timeouts, rate limits, parse failures,
  schema changes and empty responses all leave the previous good snapshot exactly as it was.
- **Two misses before anything is de-listed.** A strain must be absent from two consecutive
  *successful* observations before it becomes `NO_LONGER_LISTED`. It is never called "sold out",
  because a crawler cannot observe physical stock.
- **A collapse in item count is our bug until proven otherwise.** A drop past the threshold
  blocks publication, holds the snapshot for confirmation, and keeps the previous one live.
- **We never guess a package size.** An unrecognised or conflicting weight goes to admin review
  as `UNCLASSIFIED_WEIGHT` rather than into the nearest bucket.
- **We never rewrite a cultivar name.** The parser only removes packaging, price, potency and
  category noise. `GG4` does not become `Gorilla Glue #4` unless a human verifies an alias.
- **We store facts, not other people's content.** There is no column for price, potency,
  description, imagery or reviews anywhere in the schema. Raw fetched bodies live in a separate
  table with a hard expiry and are purged.
- **Distance is the only ranking input.** No featured, sponsored, promoted or popularity
  ordering exists, and no retailer can pay for placement.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pieces fit and how data flows
- [docs/LEGAL-RELEASE-GATES.md](docs/LEGAL-RELEASE-GATES.md) — the pre-launch checklist
- [docs/SOURCE-POLICY.md](docs/SOURCE-POLICY.md) — how a source is reviewed and approved
- [docs/OPERATIONS.md](docs/OPERATIONS.md) — running it, importing the directory, opt-outs
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — deploying the web app to Vercel, database, worker
