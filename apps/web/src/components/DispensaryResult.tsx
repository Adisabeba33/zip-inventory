import Link from 'next/link';
import type { DirectoryEntry } from '@/lib/queries';
import { formatCheckDay } from '@/lib/format';

/**
 * A result card, deliberately almost entirely text.
 *
 * No logo, no photograph, no rating, no badge of any kind. Every retailer is
 * presented identically, and the only ordering input is distance.
 */
export function DispensaryResult({ entry, now }: { entry: DirectoryEntry; now: Date }) {
  const location = [entry.city, entry.state].filter(Boolean).join(', ');

  return (
    <li className="result">
      <div className="result__name">
        <Link href={`/d/${entry.slug}`}>{entry.displayName}</Link>
      </div>
      <div className="result__meta">
        {location}
        {entry.zip ? ` ${entry.zip}` : ''}
        {entry.distanceLabel ? ` · ${entry.distanceLabel}` : ''}
      </div>

      {!entry.hasApprovedSource ? (
        <div className="result__meta faint">Inventory tracking not available yet</div>
      ) : entry.freshness.state === 'UNAVAILABLE' ? (
        <div className="result__meta faint">
          Inventory temporarily unavailable · last successfully observed {formatCheckDay(entry.lastSuccessAt, now)}
        </div>
      ) : (
        <>
          <div className="result__meta">
            Inventory checked {formatCheckDay(entry.lastSuccessAt, now)}
            {entry.freshness.state === 'STALE' ? ' · data is stale' : ''}
          </div>
          <div className="result__counts">
            {entry.counts.map((count) => (
              <span key={count.weight}>
                {count.label} · {count.count}
              </span>
            ))}
          </div>
        </>
      )}

      <div className="result__link">
        <Link href={`/d/${entry.slug}`}>View inventory →</Link>
      </div>
    </li>
  );
}
