import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AUTOMATION_STATUSES, CRAWL_PERMITTED_STATUSES } from '../types.js';
import { evaluateSourceGate, type SourceGateInput } from '../gate.js';

const now = new Date('2026-08-19T04:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

function source(overrides: Partial<SourceGateInput> = {}): SourceGateInput {
  return {
    automationStatus: 'APPROVED',
    active: true,
    termsReviewedAt: daysAgo(10),
    robotsReviewedAt: daysAgo(10),
    allowedFrequencyHours: 24,
    lastSuccessAt: daysAgo(1.5),
    lastAttemptAt: daysAgo(1.5),
    consecutiveFailures: 0,
    ...overrides,
  };
}

describe('evaluateSourceGate', () => {
  it('allows an approved, reviewed, due source', () => {
    assert.equal(evaluateSourceGate(source(), { now }).allowed, true);
  });

  it('permits exactly the three approved automation statuses and no others', () => {
    for (const status of AUTOMATION_STATUSES) {
      const result = evaluateSourceGate(source({ automationStatus: status }), { now });
      assert.equal(
        result.allowed,
        CRAWL_PERMITTED_STATUSES.includes(status),
        `automation_status ${status} should ${CRAWL_PERMITTED_STATUSES.includes(status) ? '' : 'not '}be crawlable`,
      );
    }
  });

  it('refuses a source that has never had its terms or robots reviewed', () => {
    assert.equal(evaluateSourceGate(source({ termsReviewedAt: null }), { now }).reason, 'policy_review_missing');
    assert.equal(evaluateSourceGate(source({ robotsReviewedAt: null }), { now }).reason, 'policy_review_missing');
  });

  it('refuses a source whose policy review has gone stale', () => {
    const result = evaluateSourceGate(source({ termsReviewedAt: daysAgo(120) }), { now });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'policy_review_expired');
  });

  it('enforces the source frequency limit', () => {
    const result = evaluateSourceGate(source({ lastAttemptAt: new Date(now.getTime() - 3600_000) }), { now });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'frequency_not_elapsed');
  });

  it('parks a degraded source until an admin looks at it', () => {
    const result = evaluateSourceGate(source({ consecutiveFailures: 5 }), { now });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'too_many_failures');
  });

  it('refuses an inactive source', () => {
    assert.equal(evaluateSourceGate(source({ active: false }), { now }).reason, 'source_inactive');
  });
});
