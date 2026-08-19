import { NextResponse } from 'next/server';
import { getChangesFor, getDispensaryView } from '@/lib/queries';

export const revalidate = 300;

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const view = await getDispensaryView(slug);
  if (!view) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const changes = await getChangesFor(view.id);
  const shape = (rows: typeof changes.newlyListed) =>
    rows.map((row) => ({
      name: row.canonicalName,
      packageWeight: row.packageWeight,
      firstObserved: row.firstSeenAt.toISOString(),
      lastObserved: row.lastSeenAt?.toISOString() ?? null,
    }));

  return NextResponse.json({
    slug: view.slug,
    name: view.displayName,
    newlyListed: shape(changes.newlyListed),
    returned: shape(changes.returned),
    noLongerListed: shape(changes.noLongerListed),
  });
}
