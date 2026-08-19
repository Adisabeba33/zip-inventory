import { NextResponse } from 'next/server';
import { query } from '@inventory-index/db';
import { site } from '@/lib/site';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await query('SELECT 1');
    return NextResponse.json({
      status: 'ok',
      service: site.name,
      publicLaunchEnabled: site.publicLaunchEnabled,
      publicIndexingEnabled: site.publicIndexingEnabled,
    });
  } catch (error) {
    return NextResponse.json({ status: 'degraded', detail: (error as Error).message }, { status: 503 });
  }
}
