import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DedupedStrain } from '../dedupe.js';
import { entryKey } from '../dedupe.js';
import { applySnapshot, deriveBadge, type EntryState } from '../status.js';

const DAY = 24 * 60 * 60 * 1000;
const day0 = new Date('2026-08-10T04:00:00Z');
const day = (n: number) => new Date(day0.getTime() + n * DAY);

function observed(name: string, weight: 'EIGHTH' | 'OUNCE' = 'EIGHTH'): DedupedStrain {
  return {
    key: entryKey(weight, name),
    canonicalName: name,
    packageWeight: weight,
    listingCount: 1,
    sourceItemIds: [],
  };
}

function run(snapshots: DedupedStrain[][], start = 0): EntryState[] {
  let entries: EntryState[] = [];
  snapshots.forEach((snapshot, index) => {
    entries = applySnapshot(entries, snapshot, day(start + index)).entries;
  });
  return entries;
}

const find = (entries: EntryState[], name: string) =>
  entries.find((entry) => entry.canonicalStrainName === name);

describe('applySnapshot', () => {
  it('marks a first observation NEWLY_LISTED', () => {
    const entries = run([[observed('GG4')]]);
    assert.equal(find(entries, 'GG4')?.currentStatus, 'NEWLY_LISTED');
    assert.equal(find(entries, 'GG4')?.consecutiveHits, 1);
  });

  it('settles to LISTED_NOW once the new window has passed', () => {
    const snapshots = Array.from({ length: 9 }, () => [observed('GG4')]);
    const entries = run(snapshots);
    assert.equal(find(entries, 'GG4')?.currentStatus, 'LISTED_NOW');
  });

  it('does not de-list after a single miss', () => {
    const entries = run([[observed('GG4')], []]);
    const entry = find(entries, 'GG4');
    assert.equal(entry?.currentStatus, 'NEWLY_LISTED');
    assert.equal(entry?.consecutiveMisses, 1);
  });

  it('de-lists only after two consecutive successful misses', () => {
    const entries = run([[observed('GG4')], [], []]);
    const entry = find(entries, 'GG4');
    assert.equal(entry?.currentStatus, 'NO_LONGER_LISTED');
    assert.equal(entry?.consecutiveMisses, 2);
  });

  it('resets the miss counter when the strain reappears before de-listing', () => {
    const entries = run([[observed('GG4')], [], [observed('GG4')], []]);
    const entry = find(entries, 'GG4');
    assert.equal(entry?.consecutiveMisses, 1);
    assert.notEqual(entry?.currentStatus, 'NO_LONGER_LISTED');
  });

  it('marks a de-listed strain RETURNED, never NEW, when it comes back', () => {
    const entries = run([[observed('GG4')], [], [], [observed('GG4')]]);
    const entry = find(entries, 'GG4');
    assert.equal(entry?.currentStatus, 'RETURNED');
    assert.equal(entry?.firstSeenAt.getTime(), day(0).getTime());
    assert.equal(entry?.returnedAt?.getTime(), day(3).getTime());
  });

  it('keeps first_seen_at stable across the whole life of an entry', () => {
    const entries = run([[observed('GG4')], [observed('GG4')], [observed('GG4')]]);
    assert.equal(find(entries, 'GG4')?.firstSeenAt.getTime(), day(0).getTime());
  });

  it('counts listings per snapshot', () => {
    const entries = applySnapshot([], [{ ...observed('GG4'), listingCount: 3 }], day(0)).entries;
    assert.equal(entries[0]?.listingCount, 3);
  });

  it('reports transitions for the changes feed', () => {
    const first = applySnapshot([], [observed('GG4')], day(0));
    assert.equal(first.transitions[0]?.kind, 'added');
    const second = applySnapshot(first.entries, [], day(1));
    assert.equal(second.transitions[0]?.kind, 'missed_once');
    const third = applySnapshot(second.entries, [], day(2));
    assert.equal(third.transitions[0]?.kind, 'delisted');
  });
});

describe('deriveBadge', () => {
  it('shows NEW for seven days after the first observation', () => {
    const entry = { currentStatus: 'NEWLY_LISTED' as const, firstSeenAt: day(0), returnedAt: null };
    assert.equal(deriveBadge(entry, day(3)), 'NEW');
    assert.equal(deriveBadge(entry, day(8)), null);
  });

  it('shows RETURNED, not NEW, for a re-appearance', () => {
    const entry = { currentStatus: 'RETURNED' as const, firstSeenAt: day(0), returnedAt: day(5) };
    assert.equal(deriveBadge(entry, day(6)), 'RETURNED');
  });

  it('shows nothing for an ordinary current listing', () => {
    const entry = { currentStatus: 'LISTED_NOW' as const, firstSeenAt: day(0), returnedAt: null };
    assert.equal(deriveBadge(entry, day(1)), null);
  });
});
