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

  it('excludes product classes that a menu still files under flower', () => {
    // All three were listed under Flower on a live Dutchie menu, and none of
    // them is plain flower.
    for (const title of [
      'Moonrocks Blueberry Muffin Baller Jar',
      'Hickory Hash',
      'Infused Pre-Ground',
    ]) {
      assert.equal(
        classifyProduct(title, { category: 'Flower' }).productType,
        'EXCLUDED',
        `${title} should not count as flower`,
      );
    }
  });

  it('keeps Hash Plant, which is a cultivar rather than a concentrate', () => {
    assert.equal(classifyProduct('Hash Plant 3.5g Flower', { category: 'Flower' }).productType, 'FLOWER');
  });

  it('records the flower subtype', () => {
    assert.equal(classifyProduct('Gushers Smalls 7g', { category: 'Flower' }).subtype, 'SMALLS');
  });
});
