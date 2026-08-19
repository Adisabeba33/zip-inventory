import 'server-only';
import {
  DEFAULT_RADIUS_MILES,
  evaluateFreshness,
  formatDistanceMiles,
  normalizeZip,
  parseRadiusMiles,
  WEIGHT_PRESENTATION,
  weightSlug,
  type CanonicalWeight,
  type Freshness,
} from '@inventory-index/core';
import { dispensaries, inventory, snapshots } from '@inventory-index/db';

/**
 * The only path between a visitor and the data.
 *
 * Opening a page never causes a request to a retailer. Visitors always see the
 * last successfully observed snapshot from our own database; the crawler runs
 * on its own schedule in a separate process.
 */

export interface DirectoryEntry {
  slug: string;
  displayName: string;
  city: string | null;
  state: string;
  zip: string | null;
  addressLine: string | null;
  distanceMiles: number | null;
  distanceLabel: string | null;
  exactZipMatch: boolean;
  lastSuccessAt: Date | null;
  freshness: Freshness;
  hasApprovedSource: boolean;
  counts: Array<{ weight: CanonicalWeight; count: number; label: string; slug: string }>;
}

export interface SearchResult {
  zip: string | null;
  radiusMiles: number;
  knownZip: boolean;
  inZip: DirectoryEntry[];
  nearby: DirectoryEntry[];
}

async function toDirectoryEntry(
  row: {
    id: string;
    slug: string;
    display_name: string;
    city: string | null;
    state: string;
    zip: string | null;
    address_line: string | null;
    distance_miles?: number | null;
    exact_zip_match?: boolean;
    last_success_at?: Date | null;
    automation_status?: string | null;
    source_active?: boolean | null;
  },
  now: Date,
): Promise<DirectoryEntry> {
  const hasApprovedSource =
    row.source_active === true &&
    ['APPROVED', 'EXPLICIT_PERMISSION', 'API_LICENSED'].includes(row.automation_status ?? '');
  const freshness = evaluateFreshness(row.last_success_at ?? null, now);
  const counts = freshness.showInventory && hasApprovedSource ? await inventory.getWeightCounts(row.id) : [];

  return {
    slug: row.slug,
    displayName: row.display_name,
    city: row.city,
    state: row.state,
    zip: row.zip,
    addressLine: row.address_line,
    distanceMiles: row.distance_miles ?? null,
    distanceLabel: row.distance_miles === null || row.distance_miles === undefined ? null : formatDistanceMiles(row.distance_miles),
    exactZipMatch: row.exact_zip_match ?? false,
    lastSuccessAt: row.last_success_at ?? null,
    freshness,
    hasApprovedSource,
    counts: counts.map((entry) => ({
      weight: entry.weight,
      count: entry.count,
      label: WEIGHT_PRESENTATION[entry.weight].ounceLabel,
      slug: weightSlug(entry.weight),
    })),
  };
}

export async function searchDispensaries(
  rawZip: string | null,
  rawRadius: string | null,
  now = new Date(),
): Promise<SearchResult> {
  const zip = normalizeZip(rawZip);
  const radiusMiles = parseRadiusMiles(rawRadius) || DEFAULT_RADIUS_MILES;
  if (!zip) return { zip: null, radiusMiles, knownZip: false, inZip: [], nearby: [] };

  const rows = await dispensaries.searchByZip(zip, radiusMiles);
  const entries = await Promise.all(rows.map((row) => toDirectoryEntry(row, now)));

  return {
    zip,
    radiusMiles,
    knownZip: true,
    // Retailers in the typed ZIP first, then everything else by distance.
    // Distance and then name are the only ordering inputs.
    inZip: entries.filter((entry) => entry.exactZipMatch),
    nearby: entries.filter((entry) => !entry.exactZipMatch),
  };
}

export interface DispensaryView {
  id: string;
  slug: string;
  displayName: string;
  legalName: string;
  addressLine: string | null;
  city: string | null;
  state: string;
  zip: string | null;
  directoryActive: boolean;
  hasApprovedSource: boolean;
  automationStatus: string | null;
  lastSuccessAt: Date | null;
  freshness: Freshness;
  counts: Array<{ weight: CanonicalWeight; count: number; ounceLabel: string; gramLabel: string; slug: string }>;
  totalCurrent: number;
}

export async function getDispensaryView(slug: string, now = new Date()): Promise<DispensaryView | null> {
  const row = await dispensaries.getBySlug(slug);
  if (!row) return null;

  const health = await inventory.getInventoryHealth(row.id);
  const freshness = evaluateFreshness(health.lastSuccessAt, now);
  const showInventory = freshness.showInventory && health.hasApprovedSource && row.directory_active;
  const counts = showInventory ? await inventory.getWeightCounts(row.id) : [];

  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    legalName: row.legal_name,
    addressLine: row.address_line,
    city: row.city,
    state: row.state,
    zip: row.zip,
    directoryActive: row.directory_active,
    hasApprovedSource: health.hasApprovedSource,
    automationStatus: health.automationStatus,
    lastSuccessAt: health.lastSuccessAt,
    freshness,
    counts: counts.map((entry) => ({
      weight: entry.weight,
      count: entry.count,
      ounceLabel: WEIGHT_PRESENTATION[entry.weight].ounceLabel,
      gramLabel: WEIGHT_PRESENTATION[entry.weight].gramLabel,
      slug: weightSlug(entry.weight),
    })),
    totalCurrent: counts.reduce((total, entry) => total + entry.count, 0),
  };
}

export async function getStrainsFor(dispensaryId: string, weight: CanonicalWeight, now = new Date()) {
  return inventory.getCurrentStrains(dispensaryId, weight, now);
}

export async function getChangesFor(dispensaryId: string) {
  return inventory.getChanges(dispensaryId);
}

export async function getLatestSnapshotFor(dispensaryId: string) {
  return snapshots.getLatestPublished(dispensaryId);
}

export async function listDirectory() {
  return dispensaries.listAll();
}
