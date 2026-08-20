import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseMenuLines } from '../menuText.js';

const lines = (text: string) => text.trim().split('\n').map((l) => l.trim());

const names = (result: ReturnType<typeof parseMenuLines>, weight: string) =>
  result.entries.filter((e) => e.packageWeight === weight).map((e) => e.canonicalName).sort();

describe('parseMenuLines — one product per line', () => {
  const result = parseMenuLines(lines(`
    Hudson Valley Grown - Blue Dream - 3.5g Flower - $45.00
    Empire Cultivars - Gushers - 3.5g Flower - $50.00
    Northline Farms - Sour Diesel - 3.5g Premium Flower - $48.00
    Empire Cultivars - Permanent Marker - 3.5g - $52.00
    Northline Farms - Permanent Marker - 3.5g Flower - $49.00
    Hudson Valley Grown - GG4 - 28g Flower - $220.00
    Empire Cultivars - Animal Cookies - 1 oz - $210.00
    Blue Dream Pre-Roll 5pk - $35.00
    Gelato Live Resin Cartridge 0.5g - $40.00
    Northline Farms - Wedding Cake - 10g Flower - $99.00
  `));

  it('reads the strains out of full product lines', () => {
    assert.deepEqual(names(result, 'EIGHTH'), ['Blue Dream', 'Gushers', 'Permanent Marker', 'Sour Diesel']);
    assert.deepEqual(names(result, 'OUNCE'), ['Animal Cookies', 'GG4']);
  });

  it('shows a cultivar listed by two producers once, and counts both', () => {
    const marker = result.entries.find((e) => e.canonicalName === 'Permanent Marker');
    assert.equal(marker?.listingCount, 2);
  });

  it('leaves pre-rolls and cartridges out', () => {
    const reasons = result.skipped.map((s) => s.reason).join(' ');
    assert.match(reasons, /pre-roll/);
    assert.match(reasons, /concentrate|vape/);
  });

  it('sets aside a non-standard size rather than rounding it into a bucket', () => {
    const wedding = result.entries.find((e) => e.canonicalName === 'Wedding Cake');
    assert.equal(wedding, undefined);
    assert.ok(result.skipped.some((s) => /Wedding Cake/.test(s.line)));
  });
});

describe('parseMenuLines — one field per line, as menu cards copy out', () => {
  const result = parseMenuLines(lines(`
    Blue Dream
    Hudson Valley Grown
    Sativa
    3.5g
    $45.00
    Wedding Cake
    Empire Cultivars
    Indica
    1/8 oz
    $50.00
    Ice Cream Cake
    Northline Farms
    Hybrid
    28g
    $210.00
    Watermelon Gummies 10pk
    Sweetwater
    $25.00
    MAC 1
    Northline Farms
    THC 28.4%
    7g
    $85.00
  `));

  it('takes the strain, not the producer, from each card', () => {
    assert.deepEqual(names(result, 'EIGHTH'), ['Blue Dream', 'Wedding Cake']);
    assert.deepEqual(names(result, 'QUARTER'), ['MAC 1']);
    assert.deepEqual(names(result, 'OUNCE'), ['Ice Cream Cake']);
  });

  it('does not let a skipped product’s producer leak onto the next card', () => {
    // The price line ends a card, so Sweetwater cannot attach to MAC 1's size.
    assert.ok(!result.entries.some((e) => e.canonicalName === 'Sweetwater'));
  });

  it('accounts for every line it did not use', () => {
    assert.ok(result.skipped.length > 0);
    for (const item of result.skipped) assert.ok(item.reason.length > 0);
  });
});

describe('parseMenuLines — edges', () => {
  it('handles an empty page', () => {
    const result = parseMenuLines([]);
    assert.equal(result.entries.length, 0);
    assert.equal(result.lineCount, 0);
  });

  it('ignores navigation and filter chips that carry no size', () => {
    const result = parseMenuLines(lines(`
      Shop
      Flower
      Indica
      Sativa
      Hybrid
      Sort by
    `));
    assert.equal(result.entries.length, 0);
  });

  it('reports a size with nothing above it rather than inventing a strain', () => {
    const result = parseMenuLines(['3.5g']);
    assert.equal(result.entries.length, 0);
    assert.match(result.skipped[0]?.reason ?? '', /no strain name/);
  });
});
