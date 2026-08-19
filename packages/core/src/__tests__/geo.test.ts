import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { distanceMiles, formatDistanceMiles, normalizeZip, parseRadiusMiles } from '../geo.js';

describe('distanceMiles', () => {
  it('measures a known short hop', () => {
    // White Plains to New Rochelle is about six miles.
    const miles = distanceMiles(
      { latitude: 41.0339, longitude: -73.7629 },
      { latitude: 40.9115, longitude: -73.7824 },
    );
    assert.ok(miles > 8 && miles < 9, `got ${miles}`);
  });

  it('is zero for the same point', () => {
    assert.equal(distanceMiles({ latitude: 41, longitude: -73 }, { latitude: 41, longitude: -73 }), 0);
  });
});

describe('formatDistanceMiles', () => {
  it('uses one decimal close by and whole numbers further out', () => {
    assert.equal(formatDistanceMiles(0.84), '0.8 mi');
    assert.equal(formatDistanceMiles(12.4), '12 mi');
  });
});

describe('normalizeZip', () => {
  it('accepts five digit and ZIP+4 forms', () => {
    assert.equal(normalizeZip('10605'), '10605');
    assert.equal(normalizeZip(' 10605-1234 '), '10605');
  });

  it('rejects anything else', () => {
    assert.equal(normalizeZip('1060'), null);
    assert.equal(normalizeZip('abcde'), null);
    assert.equal(normalizeZip(null), null);
  });
});

describe('parseRadiusMiles', () => {
  it('defaults to ten miles', () => {
    assert.equal(parseRadiusMiles(null), 10);
    assert.equal(parseRadiusMiles('99'), 10);
  });

  it('accepts the offered radii', () => {
    assert.equal(parseRadiusMiles('5'), 5);
    assert.equal(parseRadiusMiles(25), 25);
  });
});
