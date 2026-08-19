import { politeFetch } from '../http.js';
import { normalizeRawItem } from './normalize.js';
import type { FetchContext, FetchResult, RawItem, SourceAdapter, ValidationIssue } from './types.js';
import { SourceAccessError } from './types.js';

interface JsonApiConfig {
  /** Dotted path to the array of items, e.g. "data.products". */
  itemsPath?: string;
  fields?: { id?: string; name?: string; weight?: string; brand?: string; category?: string };
  weightFieldIsGrams?: boolean;
  brandPosition?: 'prefix' | 'suffix' | 'unknown';
  knownBrands?: string[];
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

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

/**
 * First-choice adapter: a feed or API the retailer has licensed or explicitly
 * permitted us to read. Field mapping is configuration, so a new permitted feed
 * usually needs a source row rather than new code.
 */
export const permittedJsonApiAdapter: SourceAdapter = {
  name: 'permitted-json-api',
  version: 'permitted-json-api-v1',
  requiresBrowser: false,

  async fetchInventory(context: FetchContext): Promise<FetchResult> {
    if (!context.networkEnabled) {
      throw new SourceAccessError('Network access is disabled for the crawler in this environment.', 'NETWORK_DISABLED');
    }
    const response = await politeFetch(context.sourceUrl, {
      userAgent: context.userAgent,
      accept: 'application/json',
    });
    context.onRawBody?.(response.url, response.body);
    let payload: unknown;
    try {
      payload = JSON.parse(response.body);
    } catch {
      throw new SourceAccessError('Response was not valid JSON.', 'PARSE_ERROR', response.status);
    }
    return { pagesRequested: 1, httpStatus: response.status, payload };
  },

  parseItems(payload: unknown, context: FetchContext): RawItem[] {
    const config = context.parserConfig as JsonApiConfig;
    const list = readPath(payload, config.itemsPath);
    if (!Array.isArray(list)) {
      throw new SourceAccessError(
        `Expected an array at "${config.itemsPath ?? '<root>'}"; the feed shape has changed.`,
        'SCHEMA_ERROR',
      );
    }
    const fields = config.fields ?? {};
    return list.map((entry) => {
      const record = entry as Record<string, unknown>;
      return {
        sourceItemId: asString(readPath(record, fields.id ?? 'id')),
        name: asString(readPath(record, fields.name ?? 'name')) ?? '',
        weight: asString(readPath(record, fields.weight ?? 'weight')),
        brand: asString(readPath(record, fields.brand ?? 'brand')),
        category: asString(readPath(record, fields.category ?? 'category')),
      };
    });
  },

  normalizeItem(item: RawItem, context: FetchContext) {
    const config = context.parserConfig as JsonApiConfig;
    return normalizeRawItem(item, {
      weightFieldIsGrams: config.weightFieldIsGrams,
      brandPosition: config.brandPosition,
      knownBrands: config.knownBrands,
    });
  },

  validateSnapshot(items): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (items.some((item) => !item.rawName.trim())) {
      issues.push({ code: 'EMPTY_NAME', message: 'At least one item parsed with an empty name.' });
    }
    return issues;
  },
};
