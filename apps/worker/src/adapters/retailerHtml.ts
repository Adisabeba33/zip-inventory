import { politeFetch } from '../http.js';
import { normalizeRawItem } from './normalize.js';
import type { FetchContext, FetchResult, RawItem, SourceAdapter, ValidationIssue } from './types.js';
import { SourceAccessError } from './types.js';

interface HtmlConfig {
  /**
   * Many retailer sites publish their menu as a JSON blob inside the page.
   * Reading that is both more reliable and less work than scraping markup.
   */
  jsonScriptPattern?: string;
  jsonItemsPath?: string;
  /** Fallback: a repeated block plus per-field patterns. */
  itemPattern?: string;
  namePattern?: string;
  weightPattern?: string;
  brandPattern?: string;
  categoryPattern?: string;
  weightFieldIsGrams?: boolean;
  brandPosition?: 'prefix' | 'suffix' | 'unknown';
  knownBrands?: string[];
}

function firstGroup(html: string, pattern: string | undefined): string | null {
  if (!pattern) return null;
  const match = new RegExp(pattern, 'is').exec(html);
  return match?.[1]?.trim() ?? null;
}

function stripTags(value: string | null): string | null {
  return value ? value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : null;
}

function readPath(value: unknown, path: string | undefined): unknown {
  if (!path) return value;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, value);
}

/**
 * Third-choice adapter: a retailer-owned public page, used only where the
 * source policy review concluded that automated access is permitted.
 *
 * It reads the page as delivered. It does not execute scripts, does not drive a
 * browser, and does not call internal endpoints discovered by reverse
 * engineering an authenticated client.
 */
export const retailerHtmlAdapter: SourceAdapter = {
  name: 'retailer-html',
  version: 'retailer-html-v1',
  requiresBrowser: false,

  async fetchInventory(context: FetchContext): Promise<FetchResult> {
    if (!context.networkEnabled) {
      throw new SourceAccessError('Network access is disabled for the crawler in this environment.', 'NETWORK_DISABLED');
    }
    const response = await politeFetch(context.sourceUrl, { userAgent: context.userAgent });
    context.onRawBody?.(response.url, response.body);
    if (!response.body.trim()) {
      throw new SourceAccessError('Source returned an empty page.', 'EMPTY_RESPONSE', response.status);
    }
    return { pagesRequested: 1, httpStatus: response.status, payload: response.body };
  },

  parseItems(payload: unknown, context: FetchContext): RawItem[] {
    const html = String(payload);
    const config = context.parserConfig as HtmlConfig;

    if (config.jsonScriptPattern) {
      const raw = firstGroup(html, config.jsonScriptPattern);
      if (!raw) throw new SourceAccessError('Embedded menu data not found in the page.', 'SCHEMA_ERROR');
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new SourceAccessError('Embedded menu data was not valid JSON.', 'PARSE_ERROR');
      }
      const list = readPath(parsed, config.jsonItemsPath);
      if (!Array.isArray(list)) throw new SourceAccessError('Embedded menu data changed shape.', 'SCHEMA_ERROR');
      return list.map((entry) => {
        const record = entry as Record<string, unknown>;
        return {
          sourceItemId: record.id === undefined ? null : String(record.id),
          name: String(record.name ?? ''),
          weight: record.weight === undefined || record.weight === null ? null : String(record.weight),
          brand: record.brand === undefined || record.brand === null ? null : String(record.brand),
          category: record.category === undefined || record.category === null ? null : String(record.category),
        };
      });
    }

    if (!config.itemPattern) {
      throw new SourceAccessError('Adapter is not configured for this source.', 'CONFIG_ERROR');
    }

    const blocks = html.match(new RegExp(config.itemPattern, 'gis')) ?? [];
    return blocks.map((block, index) => ({
      sourceItemId: String(index),
      name: stripTags(firstGroup(block, config.namePattern)) ?? '',
      weight: stripTags(firstGroup(block, config.weightPattern)),
      brand: stripTags(firstGroup(block, config.brandPattern)),
      category: stripTags(firstGroup(block, config.categoryPattern)),
    }));
  },

  normalizeItem(item: RawItem, context: FetchContext) {
    const config = context.parserConfig as HtmlConfig;
    return normalizeRawItem(item, {
      weightFieldIsGrams: config.weightFieldIsGrams,
      brandPosition: config.brandPosition,
      knownBrands: config.knownBrands,
    });
  },

  validateSnapshot(items): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const named = items.filter((item) => item.rawName.trim().length > 0);
    if (items.length > 0 && named.length / items.length < 0.8) {
      issues.push({
        code: 'MOSTLY_EMPTY_NAMES',
        message: 'More than a fifth of parsed items had no name; the markup has probably changed.',
      });
    }
    return issues;
  },
};
