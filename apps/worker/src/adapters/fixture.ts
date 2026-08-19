import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeRawItem } from './normalize.js';
import type { FetchContext, FetchResult, RawItem, SourceAdapter, ValidationIssue } from './types.js';
import { SourceAccessError } from './types.js';

const FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');

interface FixtureConfig {
  /** File under apps/worker/fixtures, e.g. "example-menu.json". */
  file?: string;
  /** Which day of the fixture to serve, for demonstrating diffs over time. */
  day?: number;
  brandPosition?: 'prefix' | 'suffix' | 'unknown';
  weightFieldIsGrams?: boolean;
}

interface FixtureFile {
  days: Array<{ label: string; items: RawItem[] }>;
}

/**
 * A local fixture source. It makes no network requests at all, and exists so
 * the pipeline, the diff engine and the site can be developed and demonstrated
 * without touching anybody's server.
 */
export const fixtureAdapter: SourceAdapter = {
  name: 'fixture',
  version: 'fixture-v1',
  requiresBrowser: false,

  async fetchInventory(context: FetchContext): Promise<FetchResult> {
    const config = context.parserConfig as FixtureConfig;
    const file = config.file ?? 'example-menu.json';
    if (file.includes('..') || file.includes('/')) {
      throw new SourceAccessError('Fixture file must be a bare filename.', 'CONFIG_ERROR');
    }
    let contents: string;
    try {
      contents = await readFile(join(FIXTURES_DIR, file), 'utf8');
    } catch {
      throw new SourceAccessError(`Fixture ${file} not found.`, 'CONFIG_ERROR');
    }
    return { pagesRequested: 0, httpStatus: null, payload: JSON.parse(contents) };
  },

  parseItems(payload: unknown, context: FetchContext): RawItem[] {
    const config = context.parserConfig as FixtureConfig;
    const fixture = payload as FixtureFile;
    const index = Math.min(config.day ?? 0, fixture.days.length - 1);
    const day = fixture.days[index];
    if (!day) throw new SourceAccessError('Fixture has no days.', 'SCHEMA_ERROR');
    return day.items;
  },

  normalizeItem(item: RawItem, context: FetchContext) {
    const config = context.parserConfig as FixtureConfig;
    return normalizeRawItem(item, {
      brandPosition: config.brandPosition,
      weightFieldIsGrams: config.weightFieldIsGrams,
    });
  },

  validateSnapshot(): ValidationIssue[] {
    return [];
  },
};
