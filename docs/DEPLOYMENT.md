# Deploying to Vercel

The whole flow works from a phone browser. Nothing below needs a terminal.

## What goes where

Vercel runs the **web app only**. Two other things live elsewhere:

| Piece | Where | Why |
| --- | --- | --- |
| Web app, public API, admin | Vercel | Ordinary Next.js app |
| PostgreSQL | Neon (or Supabase) | Vercel does not host a database itself |
| Observation worker | GitHub Actions (`.github/workflows/observe.yml`) | A polite crawl with per-host delays does not fit a serverless timeout, and a crawler failure must not touch page serving |

## Before you start

Read this part; it is the bit that is easy to get wrong.

**This is a staging deployment, not a launch.** `PUBLIC_LAUNCH_ENABLED` and
`PUBLIC_INDEXING_ENABLED` stay `false`. With them off, every page carries a staging banner,
`robots.txt` disallows everything and retailer pages are `noindex`. That is exactly the
private/staging mode the legal release gate calls for — see
[LEGAL-RELEASE-GATES.md](LEGAL-RELEASE-GATES.md). Do not flip either flag to put a domain
live until that checklist is done.

**Turn on Vercel's Deployment Protection.** Project → Settings → Deployment Protection →
Vercel Authentication. That makes the URL reachable only by you, which is what you want while
the data is seeded example data and counsel has not reviewed anything.

**The release-gate flags are read at build time.** They are baked into the build on purpose —
changing one is meant to be a deliberate deployment, not a toggle. After changing any
environment variable, redeploy.

## 1. Create the database (Neon)

From the phone browser:

1. In the Vercel dashboard, open your project once it exists (or go to neon.tech directly).
2. Storage → Create Database → Neon (Postgres). The free tier is enough.
3. Copy the **pooled** connection string — the one whose host contains `-pooler`. Serverless
   runs many short-lived instances, and the unpooled endpoint will run out of connections.

Supabase works the same way; use its connection pooler string on port `6543`.

## 2. Import the project into Vercel

1. vercel.com → Add New → Project → import `zip-inventory` from GitHub.
2. **Root Directory: `apps/web`.** This matters — the repo is an npm workspaces monorepo.
   Leave "Include files outside the Root Directory" enabled; the app imports the `core` and
   `db` packages as TypeScript sources.
3. Framework preset: Next.js (detected automatically).
4. Leave the build and install commands at their defaults. Vercel detects npm workspaces and
   installs from the repo root.
5. Production branch: pick `claude/inventory-index-service-fpiaa5` for now, or merge to `main`
   first and use that.

## 3. Environment variables

Set these on the Vercel project **before the first deploy** (Settings → Environment
Variables), for Production and Preview:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | The pooled Neon connection string |
| `ADMIN_API_TOKEN` | A long random string — 32+ characters |
| `SERVICE_NAME` | Whatever the service is called |
| `SERVICE_PUBLIC_URL` | `https://your-domain` (or the `.vercel.app` URL for now) |
| `PUBLIC_LAUNCH_ENABLED` | `false` |
| `PUBLIC_INDEXING_ENABLED` | `false` |
| `AGE_GATE_ENABLED` | `true` |
| `CRAWLER_NETWORK_ENABLED` | `false` |
| `CONTACT_CORRECTIONS_EMAIL` | A real address you monitor |
| `CONTACT_SOURCE_OWNER_EMAIL` | A real address — source owners use it to ask us to stop |
| `CONTACT_LEGAL_EMAIL` | A real address |

The three contact addresses appear on the crawler policy and correction pages. They are the
route by which a source owner tells us to stop, so they must reach someone.

There is no phone-friendly way to generate a good token; ask any password manager for a
32-character random string, or use a passphrase generator.

## 4. Create the schema

The schema is not created by the Vercel build. Run it once from GitHub, which works fine in a
mobile browser:

1. In the GitHub repo → Settings → Secrets and variables → Actions → New repository secret:
   `DATABASE_URL`, same pooled string.
2. Actions tab → **Migrate database** → Run workflow.
3. Tick "Also load development seed data" only if you want the invented example retailers to
   look at. Never tick it against a database that holds real directory data.

## 5. Deploy

Vercel deploys automatically on push. If you changed environment variables after the first
build, go to Deployments → the latest one → Redeploy.

Check `https://<your-url>/api/health` — it should return `status: ok`. If it returns
`degraded`, the database URL is wrong or the schema has not been created.

## 6. Custom domain

Vercel project → Settings → Domains → Add. Then either:

- **Domain bought at Vercel**: nothing else to do.
- **Domain elsewhere**: add the DNS records Vercel shows you (an `A` record for the apex, a
  `CNAME` for `www`) in your registrar's control panel. Most registrar panels work on a phone.

Then set `SERVICE_PUBLIC_URL` to the new domain and redeploy, so the sitemap and canonical
URLs match.

While the release gates are closed, the domain will serve a `robots.txt` that disallows
everything. That is intended.

## 7. The worker (only when there is something to observe)

Leave this off until at least one source has a policy review that permits automation. Until
then the worker would run and correctly do nothing.

When you are ready:

1. GitHub repo → Settings → Secrets and variables → Actions → Variables:
   - `CRAWLER_NETWORK_ENABLED` = `true`
   - `CRAWLER_USER_AGENT` = `InventoryIndexBot/1.0 (+https://your-domain/crawler; crawler@your-domain)`
   - `CRAWLER_CONTACT_EMAIL` = the same address
   - `WEB_REVALIDATE_URL` = `https://your-domain/api/internal/revalidate`
2. Add `ADMIN_API_TOKEN` as a repository **secret**, matching the Vercel value, so the worker
   can ask the site to drop its cached pages.
3. Actions → **Observe approved sources** → Run workflow, leaving "dry run" ticked. It prints
   the plan and fetches nothing.
4. Once the plan looks right, the daily schedule takes over.

The user agent must point at a page that exists and an address someone reads. That is the
whole point of an identifiable crawler.

## Cost

Vercel Hobby, Neon free tier and GitHub Actions free minutes cover this comfortably at MVP
scale. Note that Vercel's Hobby plan is for non-commercial use; if the service ever earns
money, that needs a Pro plan — and by then the monetisation question has had its own legal
review anyway.

## What is deliberately not automated

- **Migrations do not run during the build.** Builds run concurrently and on every preview;
  a schema change should be a decision.
- **The seed never runs in production automatically.** It inserts invented retailers.
- **Nothing flips the release gates for you.** They are environment variables that require a
  redeploy, and that friction is the point.
