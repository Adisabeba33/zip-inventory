import { DEFAULT_RADIUS_MILES } from '@inventory-index/core';
import { query } from '../pool.js';

export interface DispensaryRow {
  id: string;
  ocm_identifier: string | null;
  identity_key: string;
  slug: string;
  legal_name: string;
  display_name: string;
  address_line: string | null;
  city: string | null;
  state: string;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  official_website: string | null;
  license_status: string | null;
  directory_active: boolean;
  ocm_first_seen_at: Date | null;
  ocm_last_seen_at: Date | null;
}

export interface DispensarySearchRow extends DispensaryRow {
  distance_miles: number | null;
  exact_zip_match: boolean;
  last_success_at: Date | null;
  automation_status: string | null;
  source_active: boolean | null;
}

/**
 * Haversine in SQL. Distance is the only ranking input the search has - there
 * is no featured, sponsored, promoted or popularity ordering anywhere, by
 * design and not by omission.
 */
const DISTANCE_SQL = `
  3958.7613 * 2 * asin(least(1, sqrt(
      power(sin(radians(d.latitude - $2) / 2), 2)
    + cos(radians($2)) * cos(radians(d.latitude))
      * power(sin(radians(d.longitude - $3) / 2), 2)
  )))
`;

export async function searchByZip(
  zip: string,
  radiusMiles: number = DEFAULT_RADIUS_MILES,
): Promise<DispensarySearchRow[]> {
  const centroid = await query<{ latitude: number; longitude: number }>(
    'SELECT latitude, longitude FROM zip_centroids WHERE zip = $1',
    [zip],
  );
  const origin = centroid.rows[0];
  if (!origin) return [];

  const { rows } = await query<DispensarySearchRow>(
    `
    SELECT
      d.*,
      ${DISTANCE_SQL} AS distance_miles,
      (d.zip = $1) AS exact_zip_match,
      s.last_success_at,
      s.automation_status,
      s.active AS source_active
    FROM dispensaries d
    LEFT JOIN LATERAL (
      SELECT last_success_at, automation_status, active
      FROM inventory_sources
      WHERE dispensary_id = d.id
      ORDER BY (active AND automation_status IN ('APPROVED','EXPLICIT_PERMISSION','API_LICENSED')) DESC,
               last_success_at DESC NULLS LAST
      LIMIT 1
    ) s ON true
    WHERE d.directory_active
      AND d.latitude IS NOT NULL
      AND d.longitude IS NOT NULL
      AND (d.zip = $1 OR ${DISTANCE_SQL} <= $4)
    ORDER BY (d.zip = $1) DESC, distance_miles ASC NULLS LAST, d.display_name ASC
    `,
    [zip, origin.latitude, origin.longitude, radiusMiles],
  );
  return rows;
}

export async function getBySlug(slug: string): Promise<DispensaryRow | null> {
  const { rows } = await query<DispensaryRow>('SELECT * FROM dispensaries WHERE slug = $1', [slug]);
  return rows[0] ?? null;
}

export async function getById(id: string): Promise<DispensaryRow | null> {
  const { rows } = await query<DispensaryRow>('SELECT * FROM dispensaries WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function listAll(includeInactive = false): Promise<DispensaryRow[]> {
  const { rows } = await query<DispensaryRow>(
    `SELECT * FROM dispensaries ${includeInactive ? '' : 'WHERE directory_active'} ORDER BY display_name`,
  );
  return rows;
}

export interface DirectoryRecord {
  ocmIdentifier: string | null;
  legalName: string;
  displayName: string;
  addressLine: string | null;
  city: string | null;
  state: string;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  officialWebsite: string | null;
  licenseStatus: string | null;
}

export function identityKeyFor(record: DirectoryRecord): string {
  // Identity is licence identifier plus address, never the trading name alone.
  const parts = [
    record.ocmIdentifier?.trim().toLowerCase() ?? '',
    record.addressLine?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '',
    record.zip ?? '',
  ];
  return parts.join('|');
}

export function slugFor(record: DirectoryRecord): string {
  const base = `${record.displayName} ${record.city ?? ''}`
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'dispensary';
}

/**
 * Import one directory record. Rows are matched on identity, never on name,
 * and a record that disappears from the active directory is marked inactive
 * rather than deleted.
 */
export async function upsertFromDirectory(record: DirectoryRecord, seenAt: Date): Promise<string> {
  const identityKey = identityKeyFor(record);
  const baseSlug = slugFor(record);

  const { rows } = await query<{ id: string }>(
    `
    INSERT INTO dispensaries (
      ocm_identifier, identity_key, slug, legal_name, display_name, address_line,
      city, state, zip, latitude, longitude, official_website, license_status,
      ocm_first_seen_at, ocm_last_seen_at, directory_active
    )
    VALUES ($1,$2,
      -- keep slugs unique without inventing a second identity concept
      COALESCE((SELECT slug FROM dispensaries WHERE identity_key = $2), 
               CASE WHEN EXISTS (SELECT 1 FROM dispensaries WHERE slug = $3)
                    THEN $3 || '-' || substr(md5($2), 1, 6) ELSE $3 END),
      $4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,true)
    ON CONFLICT (identity_key) DO UPDATE SET
      ocm_identifier   = EXCLUDED.ocm_identifier,
      legal_name       = EXCLUDED.legal_name,
      display_name     = EXCLUDED.display_name,
      address_line     = EXCLUDED.address_line,
      city             = EXCLUDED.city,
      state            = EXCLUDED.state,
      zip              = EXCLUDED.zip,
      latitude         = COALESCE(EXCLUDED.latitude, dispensaries.latitude),
      longitude        = COALESCE(EXCLUDED.longitude, dispensaries.longitude),
      official_website = EXCLUDED.official_website,
      license_status   = EXCLUDED.license_status,
      ocm_last_seen_at = EXCLUDED.ocm_last_seen_at,
      directory_active = true,
      updated_at       = now()
    RETURNING id
    `,
    [
      record.ocmIdentifier,
      identityKey,
      baseSlug,
      record.legalName,
      record.displayName,
      record.addressLine,
      record.city,
      record.state,
      record.zip,
      record.latitude,
      record.longitude,
      record.officialWebsite,
      record.licenseStatus,
      seenAt,
    ],
  );
  return rows[0]?.id as string;
}

/**
 * Anything not seen in this directory import is no longer an active licensee
 * for our purposes. History is kept; current inventory stops being presented.
 */
export async function markMissingInactive(seenAt: Date): Promise<number> {
  const { rowCount } = await query(
    `UPDATE dispensaries
        SET directory_active = false, updated_at = now()
      WHERE directory_active
        AND (ocm_last_seen_at IS NULL OR ocm_last_seen_at < $1)`,
    [seenAt],
  );
  return rowCount ?? 0;
}
