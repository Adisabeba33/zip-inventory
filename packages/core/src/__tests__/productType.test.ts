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
    // Both were listed under Flower on a live Dutchie menu, and neither is
    // plain flower.
    for (const title of ['Moonrocks Blueberry Muffin Baller Jar', 'Infused Pre-Ground']) {
      assert.equal(
        classifyProduct(title, { category: 'Flower' }).productType,
        'EXCLUDED',
        `${title} should not count as flower`,
      );
    }
  });

  // "Hickory Hash" was in that list until a run against a live ounce menu found
  // it, "Baller Mints" and one other missing from a 26-product page. The
  // retailer sells all three as flower. A word that names a product class and a
  // cultivar family equally often cannot exclude on its own.
  const cultivarsSharingAProductWord = [
    'Hickory Hash 28g',
    'Baller Mints 3.5g',
    'Kush Mints 3.5g',
    'Animal Mints Smalls 7g',
    'Thin Mints 1 oz',
    // Guarded this way from the start; the rule above generalises it.
    'Animal Cookies 3.5g',
    'Hash Plant 3.5g Flower',
  ];
  for (const title of cultivarsSharingAProductWord) {
    it(`keeps the cultivar ${JSON.stringify(title)}`, () => {
      assert.equal(classifyProduct(title, { category: 'Flower' }).productType, 'FLOWER');
    });
  }

  // The protection those names used to provide has to survive the change.
  const productsSharingACultivarWord = [
    'Mints',
    'Mints 10pk',
    'Peppermint Mints 100mg',
    'Hash',
    'Hashish',
    'Bubble Hash 1g',
    'Ice Water Hash 2g',
    'Dry Sift Hash',
    'Hash Rosin 1g',
    'Live Hash Rosin',
    'Temple Ball Hash',
    'Full Melt Hash 1g',
  ];
  for (const title of productsSharingACultivarWord) {
    it(`still excludes ${JSON.stringify(title)}`, () => {
      assert.equal(classifyProduct(title, { category: 'Flower' }).productType, 'EXCLUDED');
    });
  }

  it('records the flower subtype', () => {
    assert.equal(classifyProduct('Gushers Smalls 7g', { category: 'Flower' }).subtype, 'SMALLS');
  });
});
