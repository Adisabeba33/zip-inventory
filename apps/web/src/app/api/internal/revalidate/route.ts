import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { config } from '@inventory-index/db';

export const dynamic = 'force-dynamic';

/**
 * Cache invalidation after a new snapshot is published.
 *
 * Public pages are cached hard, because inventory changes about once a day. The
 * worker calls this after publishing so the retailer's page reflects the new
 * snapshot immediately rather than waiting out the revalidation window.
 *
 * It is authenticated with the admin token and takes only a slug: it can
 * invalidate a cache entry and nothing else.
 */
export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!config.adminApiToken || token !== config.adminApiToken) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  let slug: string;
  try {
    slug = String(((await request.json()) as { slug?: string }).slug ?? '');
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body with a slug.' }, { status: 400 });
  }
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) {
    return NextResponse.json({ error: 'Invalid slug.' }, { status: 400 });
  }

  revalidatePath(`/d/${slug}`);
  revalidatePath(`/d/${slug}/changes`);
  revalidatePath('/search');

  return NextResponse.json({ revalidated: [`/d/${slug}`, `/d/${slug}/changes`, '/search'] });
}
