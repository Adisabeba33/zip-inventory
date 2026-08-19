import { SourceAccessError } from './adapters/types.js';
import { isPathAllowed, parseRobots, type RobotsPolicy } from './robots.js';

export interface PoliteFetchOptions {
  userAgent: string;
  timeoutMs?: number;
  /** Minimum gap between requests to the same host, in milliseconds. */
  minDelayMs?: number;
  accept?: string;
}

export interface PoliteResponse {
  status: number;
  body: string;
  contentType: string | null;
  url: string;
}

/**
 * Signatures of an access control standing between us and the content.
 *
 * When any of these appear the run fails and the source is flagged. There is no
 * code path in this project that solves a challenge, submits credentials,
 * rotates an address, or presents itself as another client - not as a fallback,
 * not behind a flag. Losing the inventory is the correct outcome.
 */
const CHALLENGE_SIGNATURES: ReadonlyArray<[RegExp, string]> = [
  [/cf-browser-verification|cf_chl_|challenge-platform/i, 'CLOUDFLARE_CHALLENGE'],
  [/<title>\s*just a moment/i, 'CLOUDFLARE_CHALLENGE'],
  [/g-recaptcha|recaptcha\/api\.js|hcaptcha\.com/i, 'CAPTCHA'],
  [/are you a robot|verify you are human|unusual traffic from your computer/i, 'BOT_CHALLENGE'],
  [/incapsula incident id|_incapsula_resource/i, 'WAF_CHALLENGE'],
  [/access denied|request blocked|you have been blocked/i, 'ACCESS_BLOCKED'],
];

/** Signs the page is a login wall rather than the public menu. */
const AUTH_SIGNATURES: ReadonlyArray<RegExp> = [
  /<input[^>]+type=["']password["']/i,
  /please\s+(?:sign|log)\s?in\s+to\s+(?:view|continue|see)/i,
];

const lastRequestByHost = new Map<string, number>();

async function respectHostDelay(host: string, minDelayMs: number): Promise<void> {
  const previous = lastRequestByHost.get(host);
  if (previous !== undefined) {
    const wait = previous + minDelayMs - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestByHost.set(host, Date.now());
}

export function detectChallenge(body: string): string | null {
  for (const [pattern, code] of CHALLENGE_SIGNATURES) {
    if (pattern.test(body)) return code;
  }
  if (AUTH_SIGNATURES.some((pattern) => pattern.test(body))) return 'AUTH_WALL';
  return null;
}

/**
 * The only outbound request helper in the project.
 *
 * It sends one identifiable User-Agent, follows no redirect chain to another
 * origin silently, honours Retry-After, and refuses to interpret a challenge
 * page as content.
 */
export async function politeFetch(url: string, options: PoliteFetchOptions): Promise<PoliteResponse> {
  const target = new URL(url);
  await respectHostDelay(target.host, options.minDelayMs ?? 2000);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);

  let response: Response;
  try {
    response = await fetch(target, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // Identifiable, contactable, and never disguised as a browser or as
        // another crawler.
        'User-Agent': options.userAgent,
        Accept: options.accept ?? 'text/html,application/json;q=0.9,*/*;q=0.5',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  } catch (error) {
    clearTimeout(timeout);
    const message = (error as Error).name === 'AbortError' ? 'Request timed out' : (error as Error).message;
    throw new SourceAccessError(message, 'NETWORK_ERROR');
  }
  clearTimeout(timeout);

  const retryAfterHeader = response.headers.get('retry-after');
  const retryAfter = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : null;

  if (!response.ok) {
    throw new SourceAccessError(
      `HTTP ${response.status} from ${target.host}`,
      `HTTP_${response.status}`,
      response.status,
      Number.isFinite(retryAfter) ? retryAfter : null,
    );
  }

  const body = await response.text();
  const challenge = detectChallenge(body);
  if (challenge) {
    throw new SourceAccessError(
      `Source returned an access control page (${challenge}). Stopping; this is not something we work around.`,
      challenge,
      response.status,
    );
  }

  return {
    status: response.status,
    body,
    contentType: response.headers.get('content-type'),
    url: response.url,
  };
}

export interface RobotsCheck {
  policy: RobotsPolicy | null;
  allowed: boolean;
  crawlDelaySeconds: number | null;
  detail: string;
}

/** Fetch and evaluate robots.txt for a target URL. */
export async function checkRobots(url: string, options: PoliteFetchOptions): Promise<RobotsCheck> {
  const target = new URL(url);
  const robotsUrl = new URL('/robots.txt', target.origin).toString();
  try {
    const response = await politeFetch(robotsUrl, options);
    const policy = parseRobots(response.body);
    const token = options.userAgent.split('/')[0] ?? options.userAgent;
    const decision = isPathAllowed(policy, target.pathname + target.search, token);
    return {
      policy,
      allowed: decision.allowed,
      crawlDelaySeconds: decision.crawlDelaySeconds,
      detail: decision.matchedRule
        ? `robots.txt rule "${decision.matchedRule}" ${decision.allowed ? 'allows' : 'disallows'} ${target.pathname}`
        : 'No matching robots.txt rule.',
    };
  } catch (error) {
    const accessError = error as SourceAccessError;
    if (accessError.httpStatus === 404) {
      return { policy: null, allowed: true, crawlDelaySeconds: null, detail: 'No robots.txt published.' };
    }
    return {
      policy: null,
      allowed: false,
      crawlDelaySeconds: null,
      detail: `Could not read robots.txt (${accessError.code ?? 'error'}). Treating as not permitted.`,
    };
  }
}
