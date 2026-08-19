import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeRawItem } from '../adapters/normalize.js';

describe('normalizeRawItem', () => {
  it('keeps only the fields the product needs', () => {
    const result = normalizeRawItem({
      sourceItemId: 'sku-1',
      name: 'Hudson Valley Grown - Blue Dream - 3.5g Flower',
      weight: '3.5g',
      brand: 'Hudson Valley Grown',
      category: 'Flower',
    });

    assert.equal(result.canonicalName, 'Blue Dream');
    assert.equal(result.canonicalWeight, 'EIGHTH');
    assert.equal(result.productType, 'FLOWER');
    assert.deepEqual(Object.keys(result).sort(), [
      'canonicalName',
      'canonicalWeight',
      'flowerSubtype',
      'nameConfident',
      'productType',
      'rawName',
      'rawWeight',
      'sourceItemId',
      'weightReason',
    ]);
  });

  it('falls back to a size stated in the title when the field is missing', () => {
    const result = normalizeRawItem({
      sourceItemId: null,
      name: 'Gushers 1 oz',
      weight: null,
      brand: null,
      category: 'Flower',
    });
    assert.equal(result.canonicalWeight, 'OUNCE');
  });

  it('leaves a non-standard size unclassified instead of guessing', () => {
    const result = normalizeRawItem({
      sourceItemId: null,
      name: 'Blue Dream 10g Flower',
      weight: '10g',
      brand: null,
      category: 'Flower',
    });
    assert.equal(result.canonicalWeight, 'UNCLASSIFIED_WEIGHT');
  });

  it('excludes non-flower items', () => {
    const result = normalizeRawItem({
      sourceItemId: null,
      name: 'Blue Dream Pre-Roll 5pk',
      weight: '0.5g',
      brand: null,
      category: 'Pre-Rolls',
    });
    assert.equal(result.productType, 'EXCLUDED');
  });
});
