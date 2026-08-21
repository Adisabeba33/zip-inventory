# Menu render probe

Answers one question with evidence instead of argument:

> If we open a dispensary menu in a real browser on our own machine, do we get
> the strains — and what does it cost in bytes?

It is a measurement tool, not a product surface. It reuses the bookmarklet's
`collect.js` and core's `parseMenuLines` **unchanged**, so a result here is
evidence about the real pipeline rather than about this directory.

## Run it

```bash
npm install
npm run probe -w @inventory-index/probe -- --help-ish   # prints usage on bad args
npx playwright install chromium                          # once

npm run probe -- "https://example.com/menu?weight=1oz"
```

Several menus at once, and keep the detail:

```bash
npm run probe -- "https://a/menu" "https://b/menu" "https://c/menu" --json probe.json
```

| Flag | Effect |
| --- | --- |
| `--headed` | Show the browser. Use this the first time — watching it scroll explains most surprises |
| `--with-images` | Do **not** block images, fonts and media. Use once per site to measure the difference |
| `--settle <ms>` | Pause after each scroll before measuring. Default 2500 |
| `--max-scrolls <n>` | Give up scrolling after this many rounds. Default 40 |
| `--timeout <ms>` | Navigation timeout. Default 45000 |
| `--browser <path>` | Use an existing Chromium instead of Playwright's. Also `PROBE_CHROMIUM` |
| `--json <file>` | Write the full report, including every set-aside line |

## What the numbers mean

- **robots.txt** — checked before the page is opened. If it disallows the path,
  nothing is fetched and that is the answer for this URL. There is no override
  flag, deliberately.
- **access control** — a challenge, CAPTCHA, WAF or login wall was recognised in
  what came back. The strain list will be empty and that is why.
- **transferred** — bytes measured off the protocol, not estimated. This is the
  figure that turns into money on every render service that bills for traffic.
  Compare a normal run against `--with-images` to size the saving.
- **lines collected** — what the reader saw. A large number with few strains
  means the parser needs work; a small number means the page never rendered or
  never finished lazy-loading.
- **strains found** and the per-size lists — the actual deliverable.
- **lines set aside** — every unused line, grouped by reason. Nothing is dropped
  quietly, so a low strain count can be diagnosed rather than guessed at.

## What it will not do

Nothing here disguises the client, solves a challenge, rotates an address or
works around robots.txt, and no flag turns any of that on. A page that will not
let us in is a finding. Losing the menu is the correct outcome.

## Checking the probe itself

```bash
cd apps/bookmarklet/test && python3 -m http.server 8765 &
npm run probe -- "http://127.0.0.1:8765/fake-menu.html" --settle 300 --max-scrolls 3
```

The fixture is the same one the bookmarklet's browser test asserts against, so
the per-size lists should match it exactly — 1/4 oz is Blue Dream, Sour Diesel
and Wedding Cake; 1/2 oz is Blue Dream and GG4. If they diverge, the probe has
drifted from the reader it is supposed to be measuring.
