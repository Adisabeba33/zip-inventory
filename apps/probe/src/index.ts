/**
 * Menu render probe - does opening a menu in a real browser get us the strains,
 * and what does doing so cost?
 *
 * A measurement tool. The reading is done by src/read.ts, which is the same
 * code the render service runs, and the parsing by core, which is the same code
 * the bookmarklet and Soma run. What this file adds is the report: the strains
 * by package size, every line set aside with its reason, and the bytes that
 * turn into money on a service that bills for traffic.
 */
import { writeFile } from 'node:fs/promises';
import {
  CANONICAL_WEIGHTS,
  WEIGHT_PRESENTATION,
  parseMenuLines,
  type CanonicalWeight,
} from '@inventory-index/core/browser';
import { MenuReadError, MenuReader } from './read.js';

interface Options {
  urls: string[];
  headed: boolean;
  blockHeavy: boolean;
  settleMs: number;
  maxScrolls: number;
  timeoutMs: number;
  userAgent: string | null;
  jsonPath: string | null;
  browserPath: string | null;
  dumpLines: boolean;
}

interface Report {
  url: string;
  ok: boolean;
  stoppedBecause: string | null;
  failureCode: string | null;
  robotsDetail: string | null;
  httpStatus: number | null;
  finalUrl: string | null;
  title: string;
  transfer: { bytes: number; requests: number; blockedRequests: number; blockingEnabled: boolean };
  render: { scrollRounds: number; heightPx: number; domNodes: number; durationMs: number };
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

function emptyReport(url: string, blockingEnabled: boolean): Report {
  return {
    url,
    ok: false,
    stoppedBecause: null,
    failureCode: null,
    robotsDetail: null,
    httpStatus: null,
    finalUrl: null,
    title: '',
    transfer: { bytes: 0, requests: 0, blockedRequests: 0, blockingEnabled },
    render: { scrollRounds: 0, heightPx: 0, domNodes: 0, durationMs: 0 },
    collectedLines: 0,
    parsed: null,
  };
}

async function probeUrl(url: string, options: Options, reader: MenuReader): Promise<Report> {
  const report = emptyReport(url, options.blockHeavy);

  let read;
  try {
    read = await reader.read(url);
  } catch (error) {
    if (error instanceof MenuReadError) {
      report.stoppedBecause = error.message;
      report.failureCode = error.code;
      return report;
    }
    report.stoppedBecause = (error as Error).message;
    return report;
  }

  report.robotsDetail = read.robotsDetail;
  report.httpStatus = read.httpStatus;
  report.finalUrl = read.finalUrl;
  report.title = read.title;
  report.transfer = {
    bytes: read.bytes,
    requests: read.requests,
    blockedRequests: read.blockedRequests,
    blockingEnabled: options.blockHeavy,
  };
  report.render = {
    scrollRounds: read.scrollRounds,
    heightPx: read.heightPx,
    domNodes: read.domNodes,
    durationMs: read.durationMs,
  };
  report.collectedLines = read.lines.length;

  const parsed = parseMenuLines(read.lines);
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
    collectedLines: options.dumpLines ? read.lines : null,
  };

  if (parsed.entries.length === 0) report.stoppedBecause = 'page rendered but no strains were recognised';
  else report.ok = true;
  return report;
}

function bar(label: string, value: string): string {
  return `  ${label.padEnd(22)}${value}`;
}

function printReport(report: Report): void {
  console.log(`\n${'='.repeat(72)}\n${report.url}\n${'='.repeat(72)}`);
  if (report.robotsDetail) console.log(bar('robots.txt', report.robotsDetail));
  if (report.failureCode) {
    console.log(bar('could not read', `${report.failureCode} - ${report.stoppedBecause ?? ''}`));
    return;
  }

  console.log(bar('http status', String(report.httpStatus ?? '-')));
  console.log(bar('page title', report.title || '-'));
  console.log(
    bar(
      'transferred',
      `${(report.transfer.bytes / 1_048_576).toFixed(2)} MB over ${report.transfer.requests} requests` +
        (report.transfer.blockingEnabled
          ? ` (${report.transfer.blockedRequests} heavy requests blocked)`
          : ' (nothing blocked)'),
    ),
  );
  console.log(
    bar(
      'render',
      `${report.render.scrollRounds} scrolls, ${report.render.heightPx}px, ${report.render.domNodes} nodes, ${(report.render.durationMs / 1000).toFixed(1)}s`,
    ),
  );
  console.log(bar('lines collected', String(report.collectedLines)));

  if (!report.parsed) {
    console.log(bar('result', report.stoppedBecause ?? 'no parse'));
    return;
  }

  // Listings and cultivars are different numbers. Counting products on the page
  // and comparing to the cultivar count is the usual way to conclude, wrongly,
  // that strains went missing.
  console.log(
    bar('strains found', `${report.parsed.strainCount} cultivars, from ${report.parsed.listingCount} listings`),
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
  const reader = new MenuReader({
    headless: !options.headed,
    blockHeavy: options.blockHeavy,
    settleMs: options.settleMs,
    maxScrolls: options.maxScrolls,
    timeoutMs: options.timeoutMs,
    userAgent: options.userAgent,
    browserPath: options.browserPath,
  });
  const reports: Report[] = [];

  try {
    for (const [index, url] of options.urls.entries()) {
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, 3000));
      const report = await probeUrl(url, options, reader);
      reports.push(report);
      printReport(report);
    }
  } finally {
    await reader.close();
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
