import { NextResponse } from 'next/server';
import { WEIGHT_PRESENTATION, parseMenuLines, type CanonicalWeight } from '@inventory-index/core';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 256 * 1024;

/**
 * Turn menu text into strain names.
 *
 * The integration point for anything that can get hold of menu text: a share
 * extension, a shortcut, a paste box. It is pure text processing - no database
 * is touched, nothing is stored, and the response is derived entirely from the
 * request body.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BYTES) {
    return NextResponse.json({ error: 'Text too large. Send at most 256 kB.' }, { status: 413 });
  }

  let text: string;
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const body = JSON.parse(raw) as { text?: unknown };
      if (typeof body.text !== 'string') {
        return NextResponse.json({ error: 'Expected a JSON body with a "text" string.' }, { status: 400 });
      }
      text = body.text;
    } catch {
      return NextResponse.json({ error: 'Body was not valid JSON.' }, { status: 400 });
    }
  } else {
    // A share extension posting text/plain is the common case; take it as-is.
    text = raw;
  }

  if (!text.trim()) {
    return NextResponse.json({ error: 'No text to read.' }, { status: 400 });
  }

  const result = parseMenuLines(text.split(/\r?\n/));

  const weights = (['EIGHTH', 'QUARTER', 'HALF', 'OUNCE'] as CanonicalWeight[])
    .map((weight) => {
      const rows = result.entries.filter((entry) => entry.packageWeight === weight);
      return {
        packageWeight: weight,
        ounceLabel: WEIGHT_PRESENTATION[weight].ounceLabel,
        gramLabel: WEIGHT_PRESENTATION[weight].gramLabel,
        count: rows.length,
        strains: rows.map((row) => ({ name: row.canonicalName, listings: row.listingCount })),
      };
    })
    .filter((section) => section.count > 0);

  return NextResponse.json({
    strainCount: result.entries.length,
    linesRead: result.lineCount,
    weights,
    // Never dropped quietly: whatever was not used, with the reason.
    setAside: result.skipped.map((item) => ({ line: item.line, reason: item.reason })),
    ambiguousBlocks: result.ambiguousBlocks,
  });
}

export async function GET() {
  return NextResponse.json({
    usage: 'POST menu text as text/plain, or JSON {"text": "..."}',
    returns: 'strain names grouped by package weight, plus every line that was set aside',
    stores: 'nothing',
  });
}
