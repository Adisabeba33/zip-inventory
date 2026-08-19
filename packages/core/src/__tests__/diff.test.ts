import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { entryKey, type DedupedStrain } from '../dedupe.js';
import { previewDiff } from '../diff.js';
import { applySnapshot, type EntryState } from '../status.js';
import { snapshotChecksum } from '../checksum.js';

const at = (iso: string) => new Date(iso);

function observed(name: string, weight: 'EIGHTH' | 'OUNCE' = 'EIGHTH'): DedupedStrain {
  return { key: entryKey(weight, name), canonicalName: name, packageWeight: weight, listingCount: 1, sourceItemIds: [] };
}

describe('previewDiff', () => {
  const yesterday: EntryState[] = applySnapshot(
    [],
    [observed('Blue Dream'), observed('GG4', 'OUNCE'), observed('Gelato')],
    at('2026-08-18T04:00:00Z'),
  ).entries;

  it('lists additions and removal candidates without applying anything', () => {
    const diff = previewDiff(yesterday, [observed('Blue Dream'), observed('Permanent Marker')]);
    assert.deepEqual(diff.added.map((row) => row.canonicalName), ['Permanent Marker']);
    assert.deepEqual(
      diff.removalCandidates.map((row) => row.canonicalName).sort(),
      ['GG4', 'Gelato'],
    );
    assert.equal(diff.unchangedCount, 1);
  });

  it('separates removal candidates from removals a second miss would confirm', () => {
    const afterOneMiss = applySnapshot(yesterday, [observed('Blue Dream')], at('2026-08-19T04:00:00Z')).entries;
    const diff = previewDiff(afterOneMiss, [observed('Blue Dream')]);
    assert.equal(diff.removalCandidates.length, 2);
    assert.equal(diff.confirmedRemovals.length, 2);
  });

  it('reports no change when the menu is identical', () => {
    const diff = previewDiff(yesterday, [observed('Blue Dream'), observed('GG4', 'OUNCE'), observed('Gelato')]);
    assert.equal(diff.noChange, true);
    assert.equal(diff.added.length, 0);
    assert.equal(diff.removalCandidates.length, 0);
  });

  it('treats a strain coming back as returned, not added', () => {
    let state = yesterday;
    state = applySnapshot(state, [], at('2026-08-19T04:00:00Z')).entries;
    state = applySnapshot(state, [], at('2026-08-20T04:00:00Z')).entries;
    const diff = previewDiff(state, [observed('Blue Dream')]);
    assert.equal(diff.added.length, 0);
    assert.deepEqual(diff.returned.map((row) => row.canonicalName), ['Blue Dream']);
  });
});

describe('snapshotChecksum', () => {
  it('is stable regardless of observation order', () => {
    const a = snapshotChecksum([observed('Gelato'), observed('Blue Dream')]);
    const b = snapshotChecksum([observed('Blue Dream'), observed('Gelato')]);
    assert.equal(a, b);
  });

  it('changes when the strain set changes', () => {
    const a = snapshotChecksum([observed('Gelato')]);
    const b = snapshotChecksum([observed('Gelato'), observed('Blue Dream')]);
    assert.notEqual(a, b);
  });

  it('distinguishes the same strain in different package sizes', () => {
    assert.notEqual(snapshotChecksum([observed('GG4', 'EIGHTH')]), snapshotChecksum([observed('GG4', 'OUNCE')]));
  });
});
