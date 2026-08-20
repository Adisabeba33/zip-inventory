# Handoff — where this project stands

Written at the end of a long working session so the next one can start from the
conclusions rather than rediscover them. It records what was built, what was
decided, what was abandoned and why, and the questions still open.

Read this first. `README.md` describes the code; this describes the thinking.

---

## 1. What the product is actually for

The original brief described a standalone public directory: enter a ZIP, pick a
licensed New York dispensary, see which flower strains it lists in 1/8, 1/4,
1/2 and 1 oz, copy the list.

Most of that got built. But the real goal surfaced late in the session and is
narrower:

> A SŌMA user is looking at a dispensary menu of 30–50 strains. They want those
> strain names inside SŌMA, without typing them by hand and without trusting an
> LLM to extract them correctly.

**Everything below should be judged against that sentence**, not against the
original brief. The directory is a means, not the end.

### What SŌMA is

A cannabis sommelier: it recommends strains matching a user's taste
preferences. Site and engine are built; not publicly launched yet.

**SŌMA is a PWA. There is no native app.** This constrains the mobile
integration options - see section 6.

---

## 2. The two problems, and which one is solved

The project keeps getting tangled because two independent problems were treated
as one. Separating them is the single most useful idea in this session:

| Problem | Status | Where the difficulty lives |
| --- | --- | --- |
| **Normalisation** — messy menu text into a clean strain list | **Solved.** Built and tested | Engineering. No legal weight at all |
| **Acquisition** — getting the menu text in the first place | **Open** | Legal and UX. Almost no engineering |

`packages/core` solves the first completely: weight normalisation, strain-name
canonicalisation, flower-only filtering, de-duplication, and the observation
status model. It is pure computation, has no IO, and is covered by ~170 tests.
It works wherever JavaScript runs and does not care what is built around it.

The second problem is where every hard conversation in this session ended up.

---

## 3. Acquisition: the options, honestly assessed

Ranked by how much work the end user has to do.

| Option | User effort | Legal exposure | Status |
| --- | --- | --- | --- |
| **Retailer opt-in feed** | None | Lowest. Removes scraping, terms of service and most of the platform question at once | Not started. Needs one retailer to say yes |
| **Share target / share sheet** | One gesture | None — the user's own browsing, nothing published | Receiving end built; sending end blocked by PWA limits, see §6 |
| **Browser extension** | One install, then one tap | None. Reads a page the user already loaded | Not built. Bookmarklet is the prototype |
| **Bookmarklet** | Manual install, fiddly on a phone | Same as an extension | **Built and working on real Dutchie menus.** Rejected as a consumer feature |
| **Paste into a box** | Copy, switch app, paste | None | Built at `/add` |
| **Crawling without permission** | None | Highest, and it follows the data forever | Built, gated off. Not recommended |

### What was tried and rejected

**Paste-only tool.** Built first. The user immediately found the hole: *where
does a 30–50 strain menu come from?* Selecting that on a phone is not
realistic. A paste box assumes the hard step is already done.

**Bookmarklet.** Built, and it genuinely works — tested on a live Dutchie menu
on an iPhone, found 25 strains from 232 lines. But installing it means editing
a bookmark's address field, and the user's verdict was correct: *"каждый раз
так делать пользователь просто скажет, нахуй мне это надо"*. It survives as an
internal tool for testing the parser and building a private dataset. **It is
not a consumer feature.**

**Crawling every NY dispensary.** Fully built with compliance controls, then
argued down. Keeping it private removes the cannabis-regulatory layer but not
the acquisition layer — terms of service and unauthorised-access questions are
unchanged by who sees the result. And data provenance follows the data: a
private database built this way becomes a liability the day anything public
runs on it.

---

## 4. Legal position — the short version

This took many turns. The conclusions, compressed. **None of this is legal
advice; it is reasoning that needs a New York attorney to confirm.**

### The definition that matters

New York defines a third-party platform / marketplace / aggregator as an entity
"hosting, maintaining, or otherwise providing a marketplace or aggregator
service that advertises, markets, promotes, or **otherwise lists** cannabis
products."

That is broad enough to reach an informational index with no prices and no
checkout.

### The key realisation

**Do not try to be outside the definition. Comply with it.**

Leafly and Weedmaps operate *inside* the category: agreements with licensed
retailers, retailer opt-in for data, objective sorting criteria. When New York
tried to prohibit dispensaries from using such platforms, a state court voided
those rules in April 2024. The path exists and is defended.

They also monetise through paid placement and advertising — Weedmaps listings
run a few hundred dollars a month, advertising into four figures; Leafly's
basic listing is free with paid ads on top. That money is what makes them
advertising platforms.

### Risk assessment for this project's configuration

Retailer opt-in, only OCM-listed licensees, strain names and weights only, no
prices, no photos, no logos, no ordering, no commission, distance-only sorting:

| Risk | Likelihood | Mitigation, mostly already built |
| --- | --- | --- |
| Listing an unlicensed retailer | Low | Directory imported only from the OCM published list; daily reimport; inactive when they leave it. **This is the one with real enforcement history** |
| Advertising rules | Medium | No imagery, no claims, no promotional language, age gate, configurable disclosure slots |
| Third-party platform status | **You will be one** | Agreements, opt-in, objective sorting — all three already satisfied |
| Deceptive practices | Low | "Listed at last check" plus a date, never "in stock". Better than the incumbents, who show no freshness at all |
| Copyright | Very low | Facts are not protected; no descriptions, photos or layout are stored |
| Scraping / terms / CFAA | Removed by opt-in | Returns immediately if opt-in is abandoned |

**Realistic worst case is a letter, not a lawsuit** — from a retailer or from
OCM. The architecture answers one in a day: pausing a source is a database
change, not a deployment, and the audit trail records why access was ever
permitted.

### The one unresolved factual question

Does New York require registration as a third-party platform, and what does it
involve? Could not be settled from open sources. There is a reference to OCM
"TPI guidance" that was not located.

**This is a question of fact, not judgement, and OCM answers questions**:
`info@ocm.ny.gov`, 1-888-626-5151. A written answer from the regulator is worth
more than an opinion, and asking in advance is itself a good position.

### Deferred

Cross-retailer strain search ("who near 10605 lists Sour Diesel") was deferred
by the brief as Phase 2. Worth noting the regulations *presuppose* platforms
displaying and sorting products across retailers by distance — so it may be
less exotic than the brief assumed, provided the service operates as a
compliant platform. Built as a demo in the preview artifact, not in the app.

---

## 5. What exists in this repository

```
packages/core       Domain rules. Pure, no IO, ~170 tests. THE VALUABLE PART.
packages/db         Postgres schema and repositories
apps/worker         Observation pipeline, scheduler, OCM importer
apps/web            Next.js public site, public API, admin dashboard
apps/bookmarklet    The strain reader (internal tool)
```

### `packages/core` — reusable anywhere, including in SŌMA

| Module | What it does |
| --- | --- |
| `weights.ts` | Text to one of four canonical sizes. Gram tolerance bands. Refuses to guess on conflicting or non-standard sizes |
| `strainName.ts` | Strips producer, price, potency, packaging and growing-method phrases. **Never rewrites a cultivar** |
| `productType.ts` | Flower only. Excludes pre-rolls, vapes, edibles, concentrates, moonrocks, hash, infused |
| `menuText.ts` | Menu text to observations. Handles both copy shapes: one product per line, and card layout with one field per line |
| `dedupe.ts` | One row per cultivar per size, with a listing count |
| `status.ts` | Observation status model. No SOLD_OUT. Two misses before de-listing. RETURNED, not NEW, on reappearance |
| `anomaly.ts` | Blocks publication when item count collapses |
| `gate.ts` | The only thing that can authorise a crawl request |
| `browser.ts` | Browser-safe barrel. Import this from client code |

**Import `@inventory-index/core/browser` from any client component or
bundle.** The main barrel pulls in `node:crypto` and will break the build. A
test walks the import graph and enforces this.

### The web app

Public: ZIP search, retailer pages with weight tabs and copy-all, changes tab,
corrections form, data sources, crawler policy, terms, privacy. Neutral
database-like design, no imagery, no logos.

`/add` — **the share target.** Accepts text via `?text=`, paste, or empty.
Parses in the page. Checkboxes per strain, copy selected, and a "set aside"
list with reasons.

`/api/parse` — same thing for a native or server caller. POST `text/plain` or
JSON, get strains grouped by weight. Stateless, stores nothing.

Admin: dispensaries, sources, crawl runs, anomalies, diffs, aliases, review
queue, corrections, legal copy. Every mutation is audited.

### Release gates

`PUBLIC_LAUNCH_ENABLED` and `PUBLIC_INDEXING_ENABLED` default to `false`. While
off: staging banner on every page, `robots.txt` disallows everything, retailer
pages `noindex`. Read at build time deliberately — changing one is a decision,
not a toggle. `docs/LEGAL-RELEASE-GATES.md` has the 25-item checklist.

### Verified working

- Full pipeline end to end against local Postgres, with the seeded fixtures
  reproducing the brief's worked example exactly (1 oz — 6 strains)
- Two-miss de-listing, RETURNED on reappearance, anomaly blocking, and the
  admin override that releases the anomaly gate without releasing the two-miss
  rule — all covered by database-backed integration tests
- Bookmarklet on a live Dutchie menu on iOS: 25 strains from 232 lines
- `/add` and `/api/parse` driven in a real browser

```bash
npm install && npm run migrate && npm run seed
npm run worker:cli -- seed-inventory
npm test && npm run typecheck && npm run build
```

---

## 6. The immediate blocker: SŌMA is a PWA

The one-gesture answer for mobile was going to be a share sheet extension. That
assumed a native app. It is a PWA, so:

**Android** — the Web Share Target API works. An installed PWA declares
`share_target` in its manifest and appears in the system share sheet. Text
shared from a dispensary menu arrives at a URL the PWA controls. `/add` is
already shaped to be exactly that target. This should work today.

**iOS** — Safari supports the Web Share API for sharing *out*, but almost
certainly not `share_target` for receiving *in*. This could not be confirmed
from open sources and **must be verified against WebKit documentation before
anything is built on it.** If it is unsupported, iOS options are:

1. An **iOS Shortcut** — installs from a link in one tap, appears in the share
   sheet, can open `/add?text=...` with the page text. No App Store, no
   developer account. Closest thing to one gesture on iOS.
2. **Paste** — copy in Safari, open SŌMA, paste. Zero install, more friction.
3. A **native wrapper** for the PWA, which reopens the whole native-app
   question.

**This is the first thing to settle in the next session.**

---

## 7. What to do next

In order:

1. **Confirm the iOS share-target situation.** It determines the mobile design.
2. **Wire the Android path.** Add `share_target` to SŌMA's manifest pointing at
   an ingest route; reuse `parseMenuLines` from `@inventory-index/core/browser`.
   Should be small.
3. **Decide where the parser lives.** SŌMA can import `packages/core` directly —
   it is a plain TypeScript package with no dependencies. Publishing it, vendoring
   it, or a monorepo are all options. This is the main integration decision.
4. **Send the retailer opt-in letter** (`docs/RETAILER-OPT-IN.md`) to one
   dispensary. Everything in section 4 improves the moment one says yes, and the
   preview artifact makes the pitch concrete.
5. **Email OCM** with the registration question.

### Deliberately not next

- Building more acquisition tooling before the share path is settled. Two tools
  were built and rejected on UX grounds already.
- Making anything public. The gates stay closed until the checklist is done.
- Cross-retailer search in the product.

---

## 8. Things worth knowing before changing the code

- **The wording rules are load-bearing, not stylistic.** "Listed at last check"
  instead of "in stock" is what keeps the service out of the deceptive-practices
  problem that Leafly and Weedmaps are open to. A test fails the build if retail
  language appears in the UI.
- **A failed observation must never change inventory.** Integration tests pin
  this. Every failure path leaves the previous snapshot untouched.
- **Nothing in this codebase works around an access control.** Challenges,
  CAPTCHAs, login walls and 401/403/451 all fail the run and pause the source.
  Keep it that way.
- **Never guess a package size.** Unrecognised or conflicting weights go to
  review as `UNCLASSIFIED_WEIGHT`.
- **Never rewrite a cultivar name.** `GG4` does not become `Gorilla Glue #4`
  without a manually verified alias. Two similar names are a smaller mistake
  than merging two different strains.
- **The parser was tuned against a real menu** and the regression tests use
  those exact strings — "Beary White Sun Grown", "Moonrocks … Baller Jar",
  "Hickory Hash", "Infused Pre-Ground". Do not loosen them without a real menu
  to test against.

---

## 9. Open questions

1. Does iOS Safari support `share_target` for installed PWAs? (blocks §6)
2. Does New York require third-party platform registration? (ask OCM)
3. Where should `packages/core` live once SŌMA uses it?
4. Should the producer/grower name be shown? The brief said no for phase 1; the
   user later wanted it. It is useful for a sommelier, but names a second class
   of licensee who has not agreed to anything. Not implemented.
5. Was the live Dutchie test on an ounce-filtered page? Every strain landed in
   1 oz, which is either correct for that page or a weight-detection problem
   worth checking against a full menu.
