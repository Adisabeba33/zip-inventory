import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateFreshness } from '../freshness.js';

const now = new Date('2026-08-19T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);

describe('evaluateFreshness', () => {
  it('is fresh inside 48 hours', () => {
    assert.equal(evaluateFreshness(hoursAgo(4), now).state, 'FRESH');
    assert.equal(evaluateFreshness(hoursAgo(47), now).state, 'FRESH');
  });

  it('is stale past 48 hours but still shows the list', () => {
    const result = evaluateFreshness(hoursAgo(60), now);
    assert.equal(result.state, 'STALE');
    assert.equal(result.showInventory, true);
  });

  it('stops presenting inventory as current past seven days', () => {
    const result = evaluateFreshness(hoursAgo(24 * 8), now);
    assert.equal(result.state, 'UNAVAILABLE');
    assert.equal(result.showInventory, false);
  });

  it('handles a source that has never been checked', () => {
    const result = evaluateFreshness(null, now);
    assert.equal(result.state, 'NEVER_CHECKED');
    assert.equal(result.showInventory, false);
  });
});
