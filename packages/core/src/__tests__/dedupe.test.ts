import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dedupeObservations } from '../dedupe.js';
import type { NormalizedObservation } from '../types.js';

function observation(overrides: Partial<NormalizedObservation>): NormalizedObservation {
  return {
    sourceItemId: null,
    rawName: 'raw',
    canonicalName: 'Blue Dream',
    rawWeight: '3.5g',
    canonicalWeight: 'EIGHTH',
    productType: 'FLOWER',
    flowerSubtype: 'UNSPECIFIED',
    ...overrides,
  };
}

describe('dedupeObservations', () => {
  it('shows the same cultivar once per package weight and counts the listings', () => {
    const result = dedupeObservations([
      observation({ canonicalName: 'Permanent Marker', sourceItemId: 'a', rawName: 'Brand A' }),
      observation({ canonicalName: 'Permanent Marker', sourceItemId: 'b', rawName: 'Brand B' }),
    ]);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0]?.listingCount, 2);
    assert.deepEqual(result.entries[0]?.sourceItemIds, ['a', 'b']);
  });

  it('keeps the same cultivar separate across package weights', () => {
    const result = dedupeObservations([
      observation({ canonicalName: 'GG4', canonicalWeight: 'EIGHTH' }),
      observation({ canonicalName: 'GG4', canonicalWeight: 'OUNCE' }),
    ]);
    assert.equal(result.entries.length, 2);
  });

  it('merges premium and smalls listings of one cultivar into one public row', () => {
    const result = dedupeObservations([
      observation({ canonicalName: 'Gushers', flowerSubtype: 'WHOLE_FLOWER' }),
      observation({ canonicalName: 'Gushers', flowerSubtype: 'SMALLS' }),
    ]);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0]?.listingCount, 2);
  });

  it('parks unclassified weights instead of publishing them', () => {
    const result = dedupeObservations([observation({ canonicalWeight: 'UNCLASSIFIED_WEIGHT' })]);
    assert.equal(result.entries.length, 0);
    assert.equal(result.unclassified.length, 1);
  });

  it('drops non-flower items', () => {
    const result = dedupeObservations([observation({ productType: 'EXCLUDED' })]);
    assert.equal(result.entries.length, 0);
    assert.equal(result.excluded.length, 1);
  });
});
