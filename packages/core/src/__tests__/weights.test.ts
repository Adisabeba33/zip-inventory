import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractWeightFromTitle,
  normalizeWeight,
  parseWeightParam,
  weightFromSlug,
  weightSlug,
} from '../weights.js';

describe('normalizeWeight', () => {
  const cases: Array<[string, string]> = [
    ['3.5g', 'EIGHTH'],
    ['3.5 g', 'EIGHTH'],
    ['3,5 g', 'EIGHTH'],
    ['⅛', 'EIGHTH'],
    ['1/8', 'EIGHTH'],
    ['1/8 oz', 'EIGHTH'],
    ['eighth', 'EIGHTH'],
    ['3.54g', 'EIGHTH'],
    ['7g', 'QUARTER'],
    ['7 g', 'QUARTER'],
    ['¼', 'QUARTER'],
    ['1/4', 'QUARTER'],
    ['1/4 oz', 'QUARTER'],
    ['quarter', 'QUARTER'],
    ['14g', 'HALF'],
    ['14 g', 'HALF'],
    ['½', 'HALF'],
    ['1/2', 'HALF'],
    ['1/2 oz', 'HALF'],
    ['half ounce', 'HALF'],
    ['14.17 g', 'HALF'],
    ['28g', 'OUNCE'],
    ['28 g', 'OUNCE'],
    ['1oz', 'OUNCE'],
    ['1 oz', 'OUNCE'],
    ['ounce', 'OUNCE'],
    ['28.35 g', 'OUNCE'],
  ];

  for (const [input, expected] of cases) {
    it(`maps ${JSON.stringify(input)} to ${expected}`, () => {
      assert.equal(normalizeWeight(input).weight, expected);
    });
  }

  it('accepts agreeing ounce and gram notation in one string', () => {
    assert.equal(normalizeWeight('1/8 oz - 3.5 g').weight, 'EIGHTH');
    assert.equal(normalizeWeight('1 oz (28g)').weight, 'OUNCE');
  });

  it('refuses to guess when signals conflict', () => {
    const result = normalizeWeight('3.5g / 1oz bundle');
    assert.equal(result.weight, 'UNCLASSIFIED_WEIGHT');
    assert.equal(result.reason, 'conflicting_signals');
  });

  it('refuses to guess a non-standard net weight', () => {
    const result = normalizeWeight('10g');
    assert.equal(result.weight, 'UNCLASSIFIED_WEIGHT');
    assert.equal(result.reason, 'out_of_tolerance');
  });

  it('refuses a bare number unless the adapter declares the unit', () => {
    assert.equal(normalizeWeight('3.5').weight, 'UNCLASSIFIED_WEIGHT');
    assert.equal(normalizeWeight('3.5', { assumeGrams: true }).weight, 'EIGHTH');
  });

  it('treats empty input as unclassified, not as a default bucket', () => {
    assert.equal(normalizeWeight('').reason, 'empty_input');
    assert.equal(normalizeWeight(null).reason, 'empty_input');
  });
});

describe('extractWeightFromTitle', () => {
  it('reads an explicit size out of a product title', () => {
    assert.equal(extractWeightFromTitle('Blue Dream - 3.5g Flower').weight, 'EIGHTH');
    assert.equal(extractWeightFromTitle('Sour Diesel 1/8 oz').weight, 'EIGHTH');
    assert.equal(extractWeightFromTitle('GG4 1 oz').weight, 'OUNCE');
  });

  it('does not read cultivar words as package sizes', () => {
    assert.equal(extractWeightFromTitle('Half Baked').weight, 'UNCLASSIFIED_WEIGHT');
    assert.equal(extractWeightFromTitle('Quarter Moon').weight, 'UNCLASSIFIED_WEIGHT');
    assert.equal(extractWeightFromTitle('Eighth Wonder').weight, 'UNCLASSIFIED_WEIGHT');
  });
});

describe('weight params and slugs', () => {
  it('round-trips slugs', () => {
    assert.equal(weightSlug('EIGHTH'), '1-8-oz');
    assert.equal(weightFromSlug('1-8-oz'), 'EIGHTH');
    assert.equal(weightFromSlug('1-oz'), 'OUNCE');
  });

  it('accepts canonical names and human notation as params', () => {
    assert.equal(parseWeightParam('EIGHTH'), 'EIGHTH');
    assert.equal(parseWeightParam('eighth'), 'EIGHTH');
    assert.equal(parseWeightParam('3.5g'), 'EIGHTH');
    assert.equal(parseWeightParam('nonsense'), null);
  });
});
