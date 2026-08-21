/**
 * Opening a menu page in a real browser and coming back with its lines.
 *
 * This is the whole of what the reader does. It is not told who asked, it keeps
 * nothing, and it hands back text rather than an opinion: deciding what is a
 * strain and what size it comes in belongs to the parser, which is tested, and
 * not to whatever the page happened to render.
 *
 * Nothing here disguises the client, solves a challenge, rotates an address or
 * works around robots.txt, and no option turns any of that on. A page that will
 * not let us in produces a reason, and the reason travels all the way to the
 * person holding the phone.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';
import { checkRobots, detectChallenge } from '@inventory-index/worker/http';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Kept in step with Soma's MenuReadFailure: these strings cross the wire. */
export type ReadFailure =
  | 'ROBOTS_DISALLOWED'
  | 'ACCESS_CONTROL'
  | 'UNREACHABLE'
  | 'TIMEOUT'
  | 'EMPTY';

export class MenuReadError extends Error {
  constructor(
    message: string,
    readonly code: ReadFailure,
  ) {
    super(message);
    this.name = 'MenuReadError';
  }
}

export interface ReaderOptions {
  headless?: boolean;
  /** Drop images, fonts and media. On by default: a strain list never needs them. */
  blockHeavy?: boolean;
  settleMs?: number;
  maxScrolls?: number;
  timeoutMs?: number;
  userAgent?: string | null;
  browserPath?: string | null;
}

export interface ReadResult {
  finalUrl: string;
  lines: string[];
  bytes: number;
  requests: number;
  blockedRequests: number;
  scrollRounds: number;
  heightPx: number;
  domNodes: number;
  title: string;
  durationMs: number;
  httpStatus: number | null;
  robotsDetail: string;
}

/**
 * How we introduce ourselves: the browser's own string plus a note about who
 * asked. Appended rather than replacing it, so the page still gets an accurate
 * description of the engine about to render it.
 */
// ASCII only: a header value is not text, and a typographic apostrophe here
// makes fetch throw before the request is ever sent.
const PROBE_TOKEN = 'SomaMenuReader/0.1 (one page per request, on an explicit human action)';

const HEAVY_RESOURCES = new Set(['image', 'media', 'font']);

/** Bundled once and reused; it never changes between reads. */
let collectorPromise: Promise<string> | null = null;

function collectorSource(): Promise<string> {
  collectorPromise ??= esbuild
    .build({
      entryPoints: [join(HERE, 'collector-entry.js')],
      bundle: true,
      format: 'iife',
      globalName: '__somaProbe',
      target: ['es2020'],
      platform: 'browser',
      legalComments: 'none',
      write: false,
    })
    .then((result) => {
      const file = result.outputFiles[0];
      if (!file) throw new Error('esbuild produced no output');
      return file.text;
    });
  return collectorPromise;
}

async function scrollToEnd(page: Page, settleMs: number, maxScrolls: number): Promise<number> {
  let rounds = 0;
  let stable = 0;
  let lastHeight = -1;

  while (rounds < maxScrolls && stable < 3) {
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await page.waitForTimeout(settleMs);
    const height = (await page.evaluate('document.body ? document.body.scrollHeight : 0')) as number;
    rounds += 1;
    if (height === lastHeight) stable += 1;
    else stable = 0;
    lastHeight = height;
  }
  await page.evaluate('window.scrollTo(0, 0)');
  await page.waitForTimeout(500);
  return rounds;
}

/**
 * A reader that keeps its browser alive between requests.
 *
 * Launching Chromium costs about a second, which is worth paying once rather
 * than on every menu. Each read still gets its own context: the cookies a
 * dispensary sets for one visitor have no business following the next one.
 */
export class MenuReader {
  private browser: Browser | null = null;
  private readonly options: Required<Omit<ReaderOptions, 'userAgent' | 'browserPath'>> & {
    userAgent: string | null;
    browserPath: string | null;
  };

  constructor(options: ReaderOptions = {}) {
    this.options = {
      headless: options.headless ?? true,
      blockHeavy: options.blockHeavy ?? true,
      settleMs: options.settleMs ?? 2500,
      maxScrolls: options.maxScrolls ?? 40,
      timeoutMs: options.timeoutMs ?? 45_000,
      userAgent: options.userAgent ?? null,
      browserPath: options.browserPath ?? process.env.PROBE_CHROMIUM ?? null,
    };
  }

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    this.browser = await chromium.launch({
      headless: this.options.headless,
      ...(this.options.browserPath ? { executablePath: this.options.browserPath } : {}),
    });
    return this.browser;
  }

  private async userAgent(browser: Browser): Promise<string> {
    if (this.options.userAgent) return this.options.userAgent;
    const scratch = await browser.newContext();
    try {
      const page = await scratch.newPage();
      const base = (await page.evaluate('navigator.userAgent')) as string;
      return `${base} ${PROBE_TOKEN}`;
    } finally {
      await scratch.close();
    }
  }

  async read(rawUrl: string): Promise<ReadResult> {
    const browser = await this.ensureBrowser();
    const userAgent = await this.userAgent(browser);

    // robots.txt first, and if it says no the page is never opened. There is no
    // option to override this, deliberately.
    const robots = await checkRobots(rawUrl, { userAgent });
    if (!robots.allowed) {
      throw new MenuReadError(
        `This site asks not to be read automatically. ${robots.detail}`,
        'ROBOTS_DISALLOWED',
      );
    }

    const context = await browser.newContext({ userAgent, viewport: { width: 1280, height: 900 } });
    let bytes = 0;
    let requests = 0;
    let blockedRequests = 0;

    try {
      if (this.options.blockHeavy) {
        await context.route('**/*', (route) => {
          if (HEAVY_RESOURCES.has(route.request().resourceType())) {
            blockedRequests += 1;
            return route.abort();
          }
          return route.continue();
        });
      }

      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      cdp.on('Network.loadingFinished', (event: { encodedDataLength?: number }) => {
        bytes += event.encodedDataLength ?? 0;
        requests += 1;
      });

      const startedAt = Date.now();
      let httpStatus: number | null = null;
      try {
        const response = await page.goto(rawUrl, {
          waitUntil: 'domcontentloaded',
          timeout: this.options.timeoutMs,
        });
        httpStatus = response?.status() ?? null;
      } catch (error) {
        const timedOut = /timeout/i.test((error as Error).message);
        throw new MenuReadError(
          timedOut ? 'The page took too long to open.' : 'The page could not be opened.',
          timedOut ? 'TIMEOUT' : 'UNREACHABLE',
        );
      }

      // Menus poll and stream, so networkidle often never arrives. Waiting for
      // it with a bound helps; timing out on it is not a failure.
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);

      const scrollRounds = await scrollToEnd(page, this.options.settleMs, this.options.maxScrolls);
      const durationMs = Date.now() - startedAt;

      const challenge = detectChallenge(await page.content());
      if (challenge) {
        throw new MenuReadError(
          `The site put an access control in front of the menu (${challenge}). We do not work around those.`,
          'ACCESS_CONTROL',
        );
      }

      const collector = await collectorSource();
      const vitals = (await page.evaluate(
        `(() => { ${collector}; return __somaProbe.vitals(); })()`,
      )) as { heightPx: number; domNodes: number; title: string };
      const lines = (await page.evaluate(
        `(() => { ${collector}; return __somaProbe.collect(); })()`,
      )) as string[];

      if (lines.length === 0) {
        throw new MenuReadError('The page opened but had no readable text.', 'EMPTY');
      }

      return {
        finalUrl: page.url(),
        lines,
        bytes,
        requests,
        blockedRequests,
        scrollRounds,
        heightPx: vitals.heightPx,
        domNodes: vitals.domNodes,
        title: vitals.title,
        durationMs,
        httpStatus,
        robotsDetail: robots.detail,
      };
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }
}
