import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateAnomaly } from '../anomaly.js';

describe('evaluateAnomaly', () => {
  it('accepts the first snapshot', () => {
    const result = evaluateAnomaly({ previousItemCount: null, currentItemCount: 140 });
    assert.equal(result.blocked, false);
    assert.equal(result.reason, 'first_snapshot');
  });

  it('accepts ordinary day-to-day movement', () => {
    assert.equal(evaluateAnomaly({ previousItemCount: 140, currentItemCount: 126 }).blocked, false);
    assert.equal(evaluateAnomaly({ previousItemCount: 126, currentItemCount: 129 }).blocked, false);
  });

  it('blocks publication when the item count collapses', () => {
    // 140 -> 17 is the parser-regression shape, not 123 removals.
    const result = evaluateAnomaly({ previousItemCount: 140, currentItemCount: 17 });
    assert.equal(result.blocked, true);
    assert.equal(result.reason, 'large_drop');
  });

  it('blocks a snapshot that parsed nothing at all', () => {
    const result = evaluateAnomaly({ previousItemCount: 140, currentItemCount: 0 });
    assert.equal(result.blocked, true);
    assert.equal(result.reason, 'emptied');
    assert.equal(result.anomalyScore, 1);
  });

  it('allows a drop that sits exactly on the threshold', () => {
    assert.equal(evaluateAnomaly({ previousItemCount: 100, currentItemCount: 60 }).blocked, false);
    assert.equal(evaluateAnomaly({ previousItemCount: 100, currentItemCount: 59 }).blocked, true);
  });

  it('flags but does not block a suspicious jump', () => {
    const result = evaluateAnomaly({ previousItemCount: 20, currentItemCount: 200 });
    assert.equal(result.blocked, false);
    assert.equal(result.reason, 'large_increase');
  });
});
