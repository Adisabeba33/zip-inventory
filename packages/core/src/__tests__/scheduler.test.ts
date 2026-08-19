import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyHttpFailure, nextRetryAt, planRun, plannedMinuteOfDay } from '../scheduler.js';

describe('daily planning', () => {
  it('is deterministic per source', () => {
    assert.equal(plannedMinuteOfDay('source-a'), plannedMinuteOfDay('source-a'));
  });

  it('spreads sources across the day instead of stacking them', () => {
    const minutes = Array.from({ length: 40 }, (_, i) => plannedMinuteOfDay(`source-${i}`));
    const distinct = new Set(minutes);
    assert.ok(distinct.size > 30, `expected a spread of slots, got ${distinct.size}`);
  });

  it('can be confined to an off-peak window', () => {
    for (let i = 0; i < 50; i += 1) {
      const minute = plannedMinuteOfDay(`source-${i}`, 2, 6);
      assert.ok(minute >= 120 && minute < 360, `minute ${minute} outside 02:00-06:00`);
    }
  });

  it('produces a readable label', () => {
    const plan = planRun('source-a', new Date('2026-08-19T00:00:00'), 2, 6);
    assert.match(plan.label, /^0[2-5]:\d{2}$/);
  });
});

describe('retry ladder', () => {
  const from = new Date('2026-08-19T04:00:00Z');

  it('backs off conservatively and then gives up until the next slot', () => {
    assert.equal(nextRetryAt(1, from)?.toISOString(), '2026-08-19T04:30:00.000Z');
    assert.equal(nextRetryAt(2, from)?.toISOString(), '2026-08-19T06:00:00.000Z');
    assert.equal(nextRetryAt(3, from)?.toISOString(), '2026-08-19T10:00:00.000Z');
    assert.equal(nextRetryAt(4, from), null);
  });
});

describe('classifyHttpFailure', () => {
  it('pauses the source on an explicit refusal instead of retrying', () => {
    assert.equal(classifyHttpFailure(403, null).action, 'pause_source');
    assert.equal(classifyHttpFailure(401, null).action, 'pause_source');
    assert.equal(classifyHttpFailure(451, null).action, 'pause_source');
  });

  it('honours rate limiting', () => {
    const result = classifyHttpFailure(429, 600);
    assert.equal(result.action, 'retry');
    assert.match(result.detail, /600s/);
  });

  it('retries transient server errors', () => {
    assert.equal(classifyHttpFailure(503, null).action, 'retry');
  });

  it('fails the run without touching inventory on anything else', () => {
    assert.equal(classifyHttpFailure(404, null).action, 'fail_run');
  });
});
