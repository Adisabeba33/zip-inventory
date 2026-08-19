import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseDelimited, parseRecords } from '../importers/csv.js';

describe('delimited parsing', () => {
  it('handles quoted fields containing the delimiter and newlines', () => {
    const rows = parseDelimited('a,b\n"one, two","line\nbreak"\n');
    assert.deepEqual(rows, [
      ['a', 'b'],
      ['one, two', 'line\nbreak'],
    ]);
  });

  it('handles escaped quotes', () => {
    assert.deepEqual(parseDelimited('x\n"say ""hi"""\n'), [['x'], ['say "hi"']]);
  });

  it('normalises header names into stable keys', () => {
    const records = parseRecords('License Number,Entity Name,ZIP Code\nOCM-1,Example LLC,10605\n');
    assert.deepEqual(records, [
      { license_number: 'OCM-1', entity_name: 'Example LLC', zip_code: '10605' },
    ]);
  });

  it('reads tab separated files', () => {
    const records = parseRecords('GEOID\tINTPTLAT\tINTPTLONG\n10605\t41.0067\t-73.7629\n', '\t');
    assert.equal(records[0]?.geoid, '10605');
    assert.equal(records[0]?.intptlong, '-73.7629');
  });
});
