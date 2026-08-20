import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canonicalizeStrainName,
  compareStrainNames,
  pickDisplayName,
  strainMatchKey,
} from '../strainName.js';

describe('canonicalizeStrainName', () => {
  it('strips brand, size and category noise from a menu title', () => {
    const result = canonicalizeStrainName('Dank - GG4 - 3.5g Premium Flower');
    assert.equal(result.canonicalName, 'GG4');
  });

  it('uses the brand field when the source provides one', () => {
    const result = canonicalizeStrainName('Sunshine Farms - Sour Diesel - 7g', {
      brand: 'Sunshine Farms',
    });
    assert.equal(result.canonicalName, 'Sour Diesel');
    assert.equal(result.confident, true);
  });

  it('removes price and potency tokens', () => {
    const result = canonicalizeStrainName('Blue Dream 1/8 oz THC 24.5% $45.00');
    assert.equal(result.canonicalName, 'Blue Dream');
  });

  it('removes parenthetical packaging notes but keeps the cultivar', () => {
    assert.equal(canonicalizeStrainName('Gushers (Smalls) 7g').canonicalName, 'Gushers');
    assert.equal(canonicalizeStrainName('Pineapple Express (Indoor Flower)').canonicalName, 'Pineapple Express');
  });

  it('records the flower subtype it saw', () => {
    assert.equal(canonicalizeStrainName('Gushers (Smalls) 7g').subtype, 'SMALLS');
    assert.equal(canonicalizeStrainName('Gelato - Ground Flower - 14g').subtype, 'GROUND');
    assert.equal(canonicalizeStrainName('Gelato - Whole Flower - 14g').subtype, 'WHOLE_FLOWER');
  });

  it('strips growing-method and packaging phrases seen on real menus', () => {
    // These came off a live Dutchie menu. Word-by-word trimming could not
    // remove them: "Grown" and "Jar" are not noise on their own.
    assert.equal(canonicalizeStrainName('Beary White Sun Grown').canonicalName, 'Beary White');
    assert.equal(canonicalizeStrainName('Grapple Pie Sun Grown').canonicalName, 'Grapple Pie');
    assert.equal(
      canonicalizeStrainName('Ice Cream Cake x Grape Gas Sun Grown').canonicalName,
      'Ice Cream Cake x Grape Gas',
    );
    assert.equal(canonicalizeStrainName('Blue Dream Small Buds').canonicalName, 'Blue Dream');
    assert.equal(canonicalizeStrainName('Gelato 41 Top Shelf').canonicalName, 'Gelato 41');
  });

  it('leaves a cross alone', () => {
    assert.equal(canonicalizeStrainName('Soap x Purple Punch').canonicalName, 'Soap x Purple Punch');
  });

  it('never rewrites the cultivar itself', () => {
    // GG4 must not become "Gorilla Glue #4" without a verified alias.
    assert.equal(canonicalizeStrainName('GG4 - 28g').canonicalName, 'GG4');
    assert.equal(canonicalizeStrainName('MAC 1 - 3.5g').canonicalName, 'MAC 1');
  });

  it('keeps the raw title when stripping would leave nothing', () => {
    const result = canonicalizeStrainName('Premium Flower 3.5g');
    assert.equal(result.canonicalName, 'Premium Flower 3.5g');
    assert.equal(result.confident, false);
  });

  it('flags ambiguous multi-segment titles instead of silently guessing', () => {
    const result = canonicalizeStrainName('Alpha - Beta - Gamma', { brandPosition: 'unknown' });
    assert.equal(result.confident, false);
    assert.ok(result.alternatives.length > 0);
  });
});

describe('strainMatchKey', () => {
  it('folds case, whitespace and quote style', () => {
    assert.equal(strainMatchKey('BLUE DREAM'), strainMatchKey('Blue  Dream'));
    assert.equal(strainMatchKey('Runtz.'), strainMatchKey('runtz'));
  });

  it('keeps genuinely different spellings apart until a human merges them', () => {
    // GG #4 vs GG4 is exactly the case the alias table exists for.
    assert.notEqual(strainMatchKey('GG #4'), strainMatchKey('GG4'));
  });
});

describe('pickDisplayName', () => {
  it('prefers the most frequent spelling', () => {
    assert.equal(pickDisplayName(['Blue Dream', 'Blue Dream', 'BLUE DREAM']), 'Blue Dream');
  });

  it('prefers mixed case over shouting on a tie', () => {
    assert.equal(pickDisplayName(['BLUE DREAM', 'Blue Dream']), 'Blue Dream');
  });
});

describe('compareStrainNames', () => {
  it('sorts alphabetically, case insensitively', () => {
    const sorted = ['gushers', 'Animal Cookies', 'Sour Diesel'].sort(compareStrainNames);
    assert.deepEqual(sorted, ['Animal Cookies', 'gushers', 'Sour Diesel']);
  });
});
