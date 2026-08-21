/**
 * The reader, as a service Soma can call.
 *
 * It does one thing: given a URL, return the page's lines. It is never told who
 * asked, never given a profile or a session, and keeps nothing between
 * requests. A machine that holds no personal data is a machine that can sit on
 * a shelf at home without being a liability.
 *
 *   POST /read   {"url": "https://..."}   ->  {finalUrl, lines, bytes, durationMs}
 *                                         ->  {error, message} on any refusal
 *   GET  /health                          ->  {ok: true}
 *
 * Failures keep their names all the way through: ROBOTS_DISALLOWED,
 * ACCESS_CONTROL, TIMEOUT, UNREACHABLE, EMPTY. Soma turns each into a sentence
 * for the person holding the phone, so "we could not read it" is never
 * presented as "there is nothing on this menu".
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { MenuReadError, MenuReader } from './read.js';

const PORT = Number(process.env.PORT ?? 8390);
const HOST = process.env.HOST ?? '127.0.0.1';
const TOKEN = process.env.MENU_RENDER_TOKEN?.trim() || null;
/** One browser, a few pages. More than this and a laptop starts swapping. */
const MAX_CONCURRENT = Number(process.env.MENU_RENDER_CONCURRENCY ?? 2);
const MAX_BODY_BYTES = 8192;

const reader = new MenuReader();
let inFlight = 0;

function send(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  response.end(payload);
}

/** Compared in constant time so the token cannot be guessed a character at a time. */
function tokenMatches(header: string | undefined): boolean {
  if (!TOKEN) return true;
  const offered = header?.replace(/^Bearer\s+/i, '') ?? '';
  const expected = Buffer.from(TOKEN);
  const actual = Buffer.from(offered);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('Request body too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer((request, response) => {
  void (async () => {
    const path = (request.url ?? '/').split('?')[0];

    if (request.method === 'GET' && path === '/health') {
      return send(response, 200, { ok: true, inFlight });
    }
    if (request.method !== 'POST' || path !== '/read') {
      return send(response, 404, { error: 'UNREACHABLE', message: 'POST /read' });
    }
    if (!tokenMatches(request.headers.authorization)) {
      return send(response, 401, { error: 'UNREACHABLE', message: 'Not authorised.' });
    }
    if (inFlight >= MAX_CONCURRENT) {
      return send(response, 503, {
        error: 'UNREACHABLE',
        message: 'The reader is busy. Try again in a moment.',
      });
    }

    let url: string;
    try {
      const body = JSON.parse(await readBody(request)) as { url?: unknown };
      if (typeof body.url !== 'string' || !body.url.trim()) throw new Error('no url');
      url = body.url.trim();
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('bad scheme');
    } catch {
      return send(response, 400, { error: 'UNREACHABLE', message: 'Send {"url": "https://..."}.' });
    }

    inFlight += 1;
    const startedAt = Date.now();
    try {
      const result = await reader.read(url);
      console.log(
        `read ${url} -> ${result.lines.length} lines, ${(result.bytes / 1_048_576).toFixed(2)} MB, ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
      );
      send(response, 200, {
        finalUrl: result.finalUrl,
        lines: result.lines,
        bytes: result.bytes,
        durationMs: result.durationMs,
      });
    } catch (error) {
      if (error instanceof MenuReadError) {
        console.log(`refused ${url} -> ${error.code}`);
        return send(response, 200, { error: error.code, message: error.message });
      }
      console.error(`failed ${url} ->`, error);
      send(response, 200, { error: 'UNREACHABLE', message: 'The page could not be read.' });
    } finally {
      inFlight -= 1;
    }
  })();
});

server.listen(PORT, HOST, () => {
  console.log(`Menu reader listening on http://${HOST}:${PORT}`);
  console.log(TOKEN ? 'Token required.' : 'No token set — bind to localhost or a private tunnel only.');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    void reader.close().then(() => process.exit(0));
  });
}
