import { CopyAllButton } from '@/components/CopyAllButton';
import { pluralize } from '@/lib/format';

export interface StrainRow {
  canonicalName: string;
  badge: 'NEW' | 'RETURNED' | null;
}

/**
 * The list itself: alphabetical, one cultivar per line, nothing else.
 *
 * Not sorted by popularity, brand, potency or price - none of which this
 * service holds.
 */
export function StrainList({
  strains,
  weightLabel,
}: {
  strains: StrainRow[];
  weightLabel: string;
}) {
  const names = strains.map((strain) => strain.canonicalName);

  return (
    <section aria-labelledby="strain-list-heading">
      <div className="list-header">
        <h2 className="list-header__title" id="strain-list-heading">
          {weightLabel} — {strains.length} {pluralize(strains.length, 'strain')}
        </h2>
        <CopyAllButton
          strains={names}
          label={`Copy all ${strains.length} ${pluralize(strains.length, 'strain')}`}
        />
      </div>

      {strains.length === 0 ? (
        <p className="muted small" style={{ marginTop: '0.9rem' }}>
          Nothing was listed in this package size at the last successful check.
        </p>
      ) : (
        <ul className="strain-list">
          {strains.map((strain) => (
            <li className="strain" key={strain.canonicalName}>
              <span className="strain__name">{strain.canonicalName}</span>
              {strain.badge ? (
                <span
                  className="badge"
                  title={
                    strain.badge === 'NEW'
                      ? 'First observed in this retailer’s public inventory within the last 7 days.'
                      : 'Observed again after a period of not being listed.'
                  }
                >
                  {strain.badge === 'NEW' ? 'NEW' : 'BACK'}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
