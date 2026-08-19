export interface Coordinates {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_MILES = 3958.7613;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in statute miles. */
export function distanceMiles(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "0.8 mi", "12 mi" - one decimal under ten miles, whole numbers above. */
export function formatDistanceMiles(miles: number): string {
  if (!Number.isFinite(miles)) return '';
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
}

export const RADIUS_OPTIONS_MILES = [5, 10, 25] as const;
export const DEFAULT_RADIUS_MILES = 10;

export function parseRadiusMiles(value: string | number | null | undefined): number {
  const numeric = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return (RADIUS_OPTIONS_MILES as readonly number[]).includes(numeric) ? numeric : DEFAULT_RADIUS_MILES;
}

const ZIP_PATTERN = /^\d{5}$/;

/** Accepts "10605" and "10605-1234"; returns the five-digit form or null. */
export function normalizeZip(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = String(input).trim().split('-')[0]?.replace(/\D/g, '') ?? '';
  return ZIP_PATTERN.test(digits) ? digits : null;
}
