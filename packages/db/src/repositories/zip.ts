import { query } from '../pool.js';

export interface ZipCentroid {
  zip: string;
  city: string | null;
  state: string;
  latitude: number;
  longitude: number;
}

export async function getZipCentroid(zip: string): Promise<ZipCentroid | null> {
  const { rows } = await query<ZipCentroid>('SELECT * FROM zip_centroids WHERE zip = $1', [zip]);
  return rows[0] ?? null;
}

export async function upsertZipCentroid(centroid: ZipCentroid): Promise<void> {
  await query(
    `INSERT INTO zip_centroids (zip, city, state, latitude, longitude, updated_at)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (zip) DO UPDATE SET
       city = EXCLUDED.city, state = EXCLUDED.state,
       latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, updated_at = now()`,
    [centroid.zip, centroid.city, centroid.state, centroid.latitude, centroid.longitude],
  );
}
