import type { NormalizedObservation } from '@inventory-index/core';

/** One item exactly as the source presented it, before any normalisation. */
export interface RawItem {
  /** The source's own identifier, kept only to line items up between runs. */
  sourceItemId: string | null;
  name: string;
  weight: string | null;
  brand: string | null;
  category: string | null;
}

export interface FetchContext {
  sourceId: string;
  sourceUrl: string;
  parserConfig: Record<string, unknown>;
  userAgent: string;
  /** False in dry-run and in any environment without network permission. */
  networkEnabled: boolean;
  /** Called for each body retrieved, so the pipeline can store it briefly. */
  onRawBody?: (url: string, body: string) => void;
}

export interface FetchResult {
  pagesRequested: number;
  httpStatus: number | null;
  /** Whatever the adapter needs to hand to parseItems. */
  payload: unknown;
}

export interface ValidationIssue {
  code: string;
  message: string;
}

/**
 * One adapter per source platform.
 *
 * Parsing lives here, never in the scheduler, so a change to one retailer's
 * markup cannot break every other dispensary's observation. Adapters are
 * versioned; the version is recorded on every crawl run.
 */
export interface SourceAdapter {
  readonly name: string;
  /** e.g. "retailer-html-v1". Recorded on each run for forensics. */
  readonly version: string;
  /**
   * True if this adapter needs a real browser. Kept explicit so headless
   * browsers stay an exception that a human opts into per source, not a
   * default.
   */
  readonly requiresBrowser: boolean;

  fetchInventory(context: FetchContext): Promise<FetchResult>;
  parseItems(payload: unknown, context: FetchContext): RawItem[];
  normalizeItem(item: RawItem, context: FetchContext): NormalizedObservation;
  /** Sanity checks specific to this source shape. */
  validateSnapshot(items: readonly NormalizedObservation[]): ValidationIssue[];
}

export class SourceAccessError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus: number | null = null,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'SourceAccessError';
  }
}
