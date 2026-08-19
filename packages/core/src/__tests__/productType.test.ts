import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyProduct } from '../productType.js';

describe('classifyProduct', () => {
  it('keeps flower', () => {
    assert.equal(classifyProduct('Blue Dream 3.5g Flower').productType, 'FLOWER');
    assert.equal(classifyProduct('Sour Diesel', { category: 'Flower' }).productType, 'FLOWER');
  });

  const excluded = [
    'Blue Dream Pre-Roll 1g',
    'Infused Pre-Roll 5pk',
    'Gelato Live Resin Cartridge',
    'Sour Diesel Vape 0.5g',
    'Watermelon Gummies 10pk',
    'Cold Brew Beverage 12oz',
    'Full Spectrum Tincture 30ml',
    'Relief Balm Topical 2oz',
    'Branded Grinder',
    'THC Capsules 10mg',
  ];
  for (const title of excluded) {
    it(`excludes ${JSON.stringify(title)}`, () => {
      assert.equal(classifyProduct(title).productType, 'EXCLUDED');
    });
  }

  it('trusts an explicit non-flower source category over the title', () => {
    const result = classifyProduct('Blue Dream 3.5g', { category: 'Pre-Rolls' });
    assert.equal(result.productType, 'EXCLUDED');
    assert.match(result.reason, /source category/);
  });

  it('does not exclude a cultivar that merely contains a weak keyword', () => {
    assert.equal(classifyProduct('Hash Plant 3.5g Flower', { category: 'Flower' }).productType, 'FLOWER');
  });

  it('records the flower subtype', () => {
    assert.equal(classifyProduct('Gushers Smalls 7g', { category: 'Flower' }).subtype, 'SMALLS');
  });
});
