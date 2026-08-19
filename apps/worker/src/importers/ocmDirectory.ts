import { readFile } from 'node:fs/promises';
import { normalizeZip } from '@inventory-index/core';
import { dispensaries, zip as zipRepo } from '@inventory-index/db';
import { parseRecords } from './csv.js';

/**
 * Import the licensed retailer directory.
 *
 * The New York Office of Cannabis Management publishes the list of licensed
 * adult-use dispensaries that are open to the public. That list is the only
 * thing that decides who appears in this service: not a mapping product, not a
 * menu aggregator, not a search result.
 *
 * The importer takes a file downloaded from that directory rather than
 * guessing at an endpoint, so the operator can see exactly what they imported
 * and keep a copy alongside the run.
 */

export interface OcmImportOptions {
  /** Column mapping, in case the published export changes its headers. */
  columns?: Partial<Record<keyof typeof DEFAULT_COLUMNS, string[]>>;
  /** Only import rows whose status matches. Empty means take every row. */
  acceptStatuses?: string[];
  /**
   * When a row has no coordinates, fall back to the ZIP centroid so the
   * retailer is still findable. Recorded so an admin can see it is approximate.
   */
  useZipCentroidFallback?: boolean;
  delimiter?: string;
  now?: Date;
}

const DEFAULT_COLUMNS = {
  identifier: ['license_number', 'licence_number', 'license_id', 'ocm_id', 'id'],
  legalName: ['entity_name', 'legal_name', 'business_name', 'licensee'],
  displayName: ['dba', 'trade_name', 'doing_business_as', 'entity_name', 'legal_name'],
  addressLine: ['address', 'street_address', 'address_line_1', 'business_address'],
  city: ['city', 'municipality', 'town'],
  state: ['state'],
  zip: ['zip', 'zip_code', 'postal_code'],
  latitude: ['latitude', 'lat'],
  longitude: ['longitude', 'lon', 'lng'],
  website: ['website', 'url', 'web_address'],
  status: ['license_status', 'status', 'operational_status'],
} as const;

function pick(record: Record<string, string>, candidates: readonly string[]): string | null {
  for (const key of candidates) {
    const value = record[key];
    if (value !== undefined && value.trim() !== '') return value.trim();
  }
  return null;
}

function toNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface OcmImportResult {
  read: number;
  imported: number;
  skipped: Array<{ row: number; reason: string }>;
  markedInactive: number;
  usedZipCentroid: number;
}

export async function importOcmDirectory(
  filePath: string,
  options: OcmImportOptions = {},
): Promise<OcmImportResult> {
  const now = options.now ?? new Date();
  const text = await readFile(filePath, 'utf8');
  const delimiter = options.delimiter ?? (filePath.endsWith('.tsv') ? '\t' : ',');
  const records = parseRecords(text, delimiter);

  const columns = { ...DEFAULT_COLUMNS, ...(options.columns ?? {}) } as Record<
    keyof typeof DEFAULT_COLUMNS,
    readonly string[]
  >;
  const acceptStatuses = (options.acceptStatuses ?? []).map((status) => status.toLowerCase());

  const result: OcmImportResult = { read: records.length, imported: 0, skipped: [], markedInactive: 0, usedZipCentroid: 0 };

  for (const [index, record] of records.entries()) {
    const legalName = pick(record, columns.legalName);
    const addressLine = pick(record, columns.addressLine);
    const zipCode = normalizeZip(pick(record, columns.zip));

    if (!legalName) {
      result.skipped.push({ row: index + 2, reason: 'no entity name column matched' });
      continue;
    }
    if (!addressLine || !zipCode) {
      // Identity is licence identifier plus address; without an address we
      // cannot tell one licensee from another reliably.
      result.skipped.push({ row: index + 2, reason: 'missing address or ZIP' });
      continue;
    }

    const status = pick(record, columns.status);
    if (acceptStatuses.length > 0 && !acceptStatuses.includes((status ?? '').toLowerCase())) {
      result.skipped.push({ row: index + 2, reason: `status "${status ?? 'none'}" not accepted` });
      continue;
    }

    let latitude = toNumber(pick(record, columns.latitude));
    let longitude = toNumber(pick(record, columns.longitude));
    if ((latitude === null || longitude === null) && options.useZipCentroidFallback !== false) {
      const centroid = await zipRepo.getZipCentroid(zipCode);
      if (centroid) {
        latitude = centroid.latitude;
        longitude = centroid.longitude;
        result.usedZipCentroid += 1;
      }
    }

    await dispensaries.upsertFromDirectory(
      {
        ocmIdentifier: pick(record, columns.identifier),
        legalName,
        displayName: pick(record, columns.displayName) ?? legalName,
        addressLine,
        city: pick(record, columns.city),
        state: pick(record, columns.state) ?? 'NY',
        zip: zipCode,
        latitude,
        longitude,
        officialWebsite: pick(record, columns.website),
        licenseStatus: status,
      },
      now,
    );
    result.imported += 1;
  }

  // Anything not present in this import is no longer an active licensee for our
  // purposes. History is kept and inventory stops being presented as current;
  // we draw no conclusion about why a licensee left the list.
  if (result.imported > 0) result.markedInactive = await dispensaries.markMissingInactive(now);

  return result;
}

export interface ZipImportResult {
  imported: number;
  skipped: number;
}

/**
 * Import ZIP centroids, e.g. from the US Census ZCTA gazetteer file
 * (tab separated: GEOID, ..., INTPTLAT, INTPTLONG).
 */
export async function importZipCentroids(filePath: string, state = 'NY'): Promise<ZipImportResult> {
  const text = await readFile(filePath, 'utf8');
  const delimiter = filePath.endsWith('.csv') ? ',' : '\t';
  const records = parseRecords(text, delimiter);

  let imported = 0;
  let skipped = 0;
  for (const record of records) {
    const zipCode = normalizeZip(record.geoid ?? record.zcta5 ?? record.zip ?? record.zip_code ?? null);
    const latitude = toNumber(record.intptlat ?? record.latitude ?? null);
    const longitude = toNumber(record.intptlong ?? record.intptlon ?? record.longitude ?? null);
    if (!zipCode || latitude === null || longitude === null) {
      skipped += 1;
      continue;
    }
    await zipRepo.upsertZipCentroid({
      zip: zipCode,
      city: record.city ?? null,
      state: record.state ?? state,
      latitude,
      longitude,
    });
    imported += 1;
  }
  return { imported, skipped };
}
