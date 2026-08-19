import { fixtureAdapter } from './fixture.js';
import { permittedJsonApiAdapter } from './permittedJsonApi.js';
import { retailerHtmlAdapter } from './retailerHtml.js';
import type { SourceAdapter } from './types.js';

/**
 * Adapters are looked up by the parser_adapter column on the source row. There
 * is no "try them all" fallback: a source whose adapter is unassigned simply
 * does not run.
 */
const ADAPTERS: readonly SourceAdapter[] = [permittedJsonApiAdapter, retailerHtmlAdapter, fixtureAdapter];

export function getAdapter(name: string): SourceAdapter | null {
  return ADAPTERS.find((adapter) => adapter.name === name) ?? null;
}

export function listAdapters(): readonly SourceAdapter[] {
  return ADAPTERS;
}
