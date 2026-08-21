/**
 * Menu render probe - does opening a menu page in a real browser get us the
 * strains, and what does doing so cost?
 *
 * This is a measurement tool, not a product surface. It answers the four
 * questions the render decision hangs on, per URL:
 *
 *   1. Does robots.txt permit reading this path at all?
 *   2. Does the site serve us the menu, or an access control page?
 *   3. How many strains come back, and how many lines were set aside?
 *   4. How many bytes crossed the wire - the number that drives the bill on
 *      every render service that charges for traffic.
 *
 * It reuses the bookmarklet's collector and core's parser unchanged, so a good
 * result here is evidence about the real pipeline rather than about this file.
 *
 * Nothing here disguises the client, solves a challenge, rotates an address or
 * works around robots.txt, and no flag turns any of that on. A page that will
 * not let us in is a finding, not a problem to route around.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { chromium, type Page } from 'playwright';
import {
  CANONICAL_WEIGHTS,
  WEIGHT_PRESENTATION,
  parseMenuLines,
  type CanonicalWeight,
} from '@inventory-index/core/browser';
import { checkRobots, detectChallenge } from '@inventory-index/worker/http';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * How we introduce ourselves. Appended to the browser's own string rather than
 * replacing it, so the page still gets an accurate description of the engine
 * that is about to render it, plus an honest note about who asked.
 */
const PROBE_TOKEN = 'SomaMenuProbe/0.1 (menu-reading measurement; one page per run)';

/** Resource kinds a strain list never needs. Dropping them is the cost lever. */
const HEAVY_RESOURCES = new Set(['image', 'media', 'font']);

interface Options {
  urls: string[];
  headed: boolean;
  blockHeavy: boolean;
  settleMs: number;
  maxScrolls: number;
  timeoutMs: number;
  userAgent: string | null;
  jsonPath: string | null;
  /** An existing Chromium, when you would rather not have Playwright fetch one. */
  browserPath: string | null;
  /** Put every collected line in the JSON, for diagnosing a menu that reads badly. */
  dumpLines: boolean;
}

interface Report {
  url: string;
  ok: boolean;
  stoppedBecause: string | null;
  robots: { allowed: boolean; detail: string; crawlDelaySeconds: number | null };
  http: { status: number | null; finalUrl: string | null };
  challenge: string | null;
  transfer: { bytes: number; requests: number; blockedRequests: number; blockingEnabled: boolean };
  render: { scrollRounds: number; heightPx: number; domNodes: number; title: string; durationMs: number };
  collectedLines: number;
  parsed: {
    /** Listings seen, before same-cultivar rows are collapsed. */
    listingCount: number;
    /** Distinct cultivars, after collapsing. The two differ when a menu sells one strain from two growers. */
    strainCount: number;
    lineCount: number;
    ambiguousBlocks: number;
    byWeight: Record<string, { name: string; listingCount: number }[]>;
    skippedByReason: Record<string, number>;
    /** Every set-aside line, with its reason. Not a sample - a missing strain is in here. */
    skipped: { line: string; reason: string }[];
    /** Everything the reader saw, when --dump-lines is on. */
    collectedLines: string[] | null;
  } | null;
}

function parseArgs(argv: string[]): Options {
  const urls: string[] = [];
  const options: Options = {
    urls,
    headed: false,
    blockHeavy: true,
    settleMs: 2500,
    maxScrolls: 40,
    timeoutMs: 45_000,
    userAgent: null,
    jsonPath: null,
    browserPath: process.env.PROBE_CHROMIUM ?? null,
    dumpLines: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    const next = (): string => {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      index += 1;
      return value;
    };
    switch (arg) {
      case '--headed': options.headed = true; break;
      case '--with-images': options.blockHeavy = false; break;
      case '--settle': options.settleMs = Number(next()); break;
      case '--max-scrolls': options.maxScrolls = Number(next()); break;
      case '--timeout': options.timeoutMs = Number(next()); break;
      case '--ua': options.userAgent = next(); break;
      case '--json': options.jsonPath = next(); break;
      case '--browser': options.browserPath = next(); break;
      case '--dump-lines': options.dumpLines = true; break;
      default:
        if (arg.startsWith('-')) throw new Error(`Unknown flag ${arg}`);
        urls.push(arg);
    }
  }

  if (urls.length === 0) {
    throw new Error(
      'Usage: npm run probe -- <menu-url> [more urls...] [--headed] [--with-images] [--dump-lines] [--json out.json] [--browser /path/to/chrome]',
    );
  }
  return options;
}

/**
 * Bundle the collector into one expression.
 *
 * It goes in through page.evaluate rather than a script tag on purpose: a menu
 * site's content security policy will refuse an injected tag, and failing on
 * that would tell us about CSP rather than about whether the menu is readable.
 */
async function buildCollector(): Promise<string> {
  const result = await esbuild.build({
    entryPoints: [join(HERE, 'collector-entry.js')],
    bundle: true,
    format: 'iife',
    globalName: '__somaProbe',
    target: ['es2020'],
    platform: 'browser',
    legalComments: 'none',
    write: false,
  });
  const file = result.outputFiles[0];
  if (!file) throw new Error('esbuild produced no output');
  return file.text;
}

/** Scroll until the page stops growing. Menus lazy-load; a static read sees a third of one. */
async function scrollToEnd(page: Page, options: Options): Promise<number> {
  let rounds = 0;
  let stable = 0;
  let lastHeight = -1;

  while (rounds < options.maxScrolls && stable < 3) {
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await page.waitForTimeout(options.settleMs);
    const height = (await page.evaluate('document.body ? document.body.scrollHeight : 0')) as number;
    rounds += 1;
    if (height === lastHeight) stable += 1;
    else stable = 0;
    lastHeight = height;
  }
  // Back to the top so anything that only renders in view has been in view.
  await page.evaluate('window.scrollTo(0, 0)');
  await page.waitForTimeout(500);
  return rounds;
}

async function probeUrl(url: string, options: Options, collector: string): Promise<Report> {
  const report: Report = {
    url,
    ok: false,
    stoppedBecause: null,
    robots: { allowed: false, detail: 'not checked', crawlDelaySeconds: null },
    http: { status: null, finalUrl: null },
    challenge: null,
    transfer: { bytes: 0, requests: 0, blockedRequests: 0, blockingEnabled: options.blockHeavy },
    render: { scrollRounds: 0, heightPx: 0, domNodes: 0, title: '', durationMs: 0 },
    collectedLines: 0,
    parsed: null,
  };

  const browser = await chromium.launch({
    headless: !options.headed,
    ...(options.browserPath ? { executablePath: options.browserPath } : {}),
  });
  try {
    // Ask the browser what it calls itself, then add our note to it.
    const scratch = await browser.newContext();
    const scratchPage = await scratch.newPage();
    const defaultUserAgent = (await scratchPage.evaluate('navigator.userAgent')) as string;
    await scratch.close();
    const userAgent = options.userAgent ?? `${defaultUserAgent} ${PROBE_TOKEN}`;

    // robots.txt first. If it says no, we do not open the page - that is the
    // whole answer for this URL and there is no flag to override it.
    const robots = await checkRobots(url, { userAgent });
    report.robots = {
      allowed: robots.allowed,
      detail: robots.detail,
      crawlDelaySeconds: robots.crawlDelaySeconds,
    };
    if (!robots.allowed) {
      report.stoppedBecause = 'robots.txt does not permit reading this path';
      return report;
    }

    const context = await browser.newContext({ userAgent, viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    if (options.blockHeavy) {
      await context.route('**/*', (route) => {
        if (HEAVY_RESOURCES.has(route.request().resourceType())) {
          report.transfer.blockedRequests += 1;
          return route.abort();
        }
        return route.continue();
      });
    }

    // Bytes actually transferred, straight from the protocol. This is the
    // figure every traffic-billed render service turns into money.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    cdp.on('Network.loadingFinished', (event: { encodedDataLength?: number }) => {
      report.transfer.bytes += event.encodedDataLength ?? 0;
      report.transfer.requests += 1;
    });

    const startedAt = Date.now();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
    report.http.status = response?.status() ?? null;
    report.http.finalUrl = page.url();

    // Menus poll and stream; networkidle often never arrives. Waiting for it
    // with a bound is useful, timing out on it is not a failure.
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);

    report.render.scrollRounds = await scrollToEnd(page, options);
    report.render.durationMs = Date.now() - startedAt;

    report.challenge = detectChallenge(await page.content());

    const vitals = (await page.evaluate(`(() => { ${collector}; return __somaProbe.vitals(); })()`)) as {
      heightPx: number;
      domNodes: number;
      title: string;
    };
    report.render.heightPx = vitals.heightPx;
    report.render.domNodes = vitals.domNodes;
    report.render.title = vitals.title;

    const lines = (await page.evaluate(
      `(() => { ${collector}; return __somaProbe.collect(); })()`,
    )) as string[];
    report.collectedLines = lines.length;

    const parsed = parseMenuLines(lines);
    const byWeight: Record<string, { name: string; listingCount: number }[]> = {};
    for (const weight of CANONICAL_WEIGHTS) {
      const names = parsed.entries
        .filter((entry) => entry.packageWeight === weight)
        .map((entry) => ({ name: entry.canonicalName, listingCount: entry.listingCount }))
        .sort((left, right) => left.name.localeCompare(right.name));
      if (names.length > 0) byWeight[WEIGHT_PRESENTATION[weight as CanonicalWeight].ounceLabel] = names;
    }

    const skippedByReason: Record<string, number> = {};
    for (const skipped of parsed.skipped) {
      skippedByReason[skipped.reason] = (skippedByReason[skipped.reason] ?? 0) + 1;
    }

    report.parsed = {
      listingCount: parsed.itemCount,
      strainCount: parsed.entries.length,
      lineCount: parsed.lineCount,
      ambiguousBlocks: parsed.ambiguousBlocks,
      byWeight,
      skippedByReason,
      skipped: parsed.skipped,
      collectedLines: options.dumpLines ? lines : null,
    };

    // A challenge page parses to nothing; say which of the two happened.
    if (report.challenge) report.stoppedBecause = `access control page (${report.challenge})`;
    else if (parsed.entries.length === 0) report.stoppedBecause = 'page rendered but no strains were recognised';
    else report.ok = true;

    await context.close();
    return report;
  } catch (error) {
    report.stoppedBecause = (error as Error).message;
    return report;
  } finally {
    await browser.close();
  }
}

function bar(label: string, value: string): string {
  return `  ${label.padEnd(22)}${value}`;
}

function printReport(report: Report): void {
  console.log(`\n${'='.repeat(72)}\n${report.url}\n${'='.repeat(72)}`);
  console.log(bar('robots.txt', `${report.robots.allowed ? 'allowed' : 'DISALLOWED'} - ${report.robots.detail}`));
  if (report.stoppedBecause && !report.robots.allowed) return;

  console.log(bar('http status', String(report.http.status ?? '-')));
  console.log(bar('page title', report.render.title || '-'));
  console.log(bar('access control', report.challenge ?? 'none detected'));
  console.log(
    bar(
      'transferred',
      `${(report.transfer.bytes / 1_048_576).toFixed(2)} MB over ${report.transfer.requests} requests` +
        (report.transfer.blockingEnabled
          ? ` (${report.transfer.blockedRequests} heavy requests blocked)`
          : ' (nothing blocked)'),
    ),
  );
  console.log(bar('render', `${report.render.scrollRounds} scrolls, ${report.render.heightPx}px, ${report.render.domNodes} nodes, ${(report.render.durationMs / 1000).toFixed(1)}s`));
  console.log(bar('lines collected', String(report.collectedLines)));

  if (!report.parsed) {
    console.log(bar('result', report.stoppedBecause ?? 'no parse'));
    return;
  }

  // Listings and cultivars are different numbers. Counting products on the page
  // and comparing to the cultivar count is the usual way to conclude, wrongly,
  // that strains went missing.
  console.log(
    bar(
      'strains found',
      `${report.parsed.strainCount} cultivars, from ${report.parsed.listingCount} listings`,
    ),
  );
  console.log(bar('ambiguous blocks', String(report.parsed.ambiguousBlocks)));

  const weights = Object.entries(report.parsed.byWeight);
  if (weights.length === 0) {
    console.log('\n  No strains recognised.');
  } else {
    for (const [label, entries] of weights) {
      console.log(`\n  ${label} - ${entries.length} strains`);
      for (const entry of entries) {
        console.log(`     ${entry.name}${entry.listingCount > 1 ? `  (x${entry.listingCount} listings)` : ''}`);
      }
    }
  }

  const reasons = Object.entries(report.parsed.skippedByReason).sort((a, b) => b[1] - a[1]);
  if (reasons.length > 0) {
    console.log('\n  Lines set aside, by reason:');
    for (const [reason, count] of reasons) {
      console.log(`\n     ${String(count).padStart(4)}  ${reason}`);
      // Examples, because a strain the parser lost is sitting in one of these
      // lists and a bare count will never show it to you.
      const examples = report.parsed.skipped.filter((entry) => entry.reason === reason).slice(0, 6);
      for (const example of examples) console.log(`           ${example.line}`);
      if (count > examples.length) console.log(`           ... and ${count - examples.length} more`);
    }
  }

  if (report.stoppedBecause) console.log(`\n  VERDICT: ${report.stoppedBecause}`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const collector = await buildCollector();
  const reports: Report[] = [];

  for (const [index, url] of options.urls.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 3000));
    const report = await probeUrl(url, options, collector);
    reports.push(report);
    printReport(report);
  }

  console.log(`\n${'-'.repeat(72)}\nSummary`);
  for (const report of reports) {
    const strains = report.parsed?.strainCount ?? 0;
    const megabytes = (report.transfer.bytes / 1_048_576).toFixed(2);
    console.log(
      `  ${report.ok ? 'OK  ' : 'FAIL'}  ${String(strains).padStart(4)} strains  ${megabytes.padStart(7)} MB  ${report.url}`,
    );
  }

  if (options.jsonPath) {
    await writeFile(options.jsonPath, JSON.stringify(reports, null, 2), 'utf8');
    console.log(`\nFull detail written to ${options.jsonPath}`);
  }

  process.exitCode = reports.some((report) => report.ok) ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
