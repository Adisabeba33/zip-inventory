import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NEVER_PERMITTED_PHRASES, findProhibitedPhrases } from '../vocabulary.js';

describe('findProhibitedPhrases', () => {
  it('catches retail and availability-guarantee language', () => {
    const matches = findProhibitedPhrases('Blue Dream is in stock now - buy now for the best deal!');
    const phrases = matches.map((match) => match.phrase);
    assert.ok(phrases.includes('in stock'));
    assert.ok(phrases.includes('buy now'));
    assert.ok(phrases.includes('best deal'));
  });

  it('leaves observation wording alone', () => {
    const copy = [
      'Listed at last check',
      'First observed Aug 19',
      'No longer listed',
      'Last successfully checked: Today',
      'Newly listed',
    ].join(' ');
    assert.deepEqual(findProhibitedPhrases(copy, NEVER_PERMITTED_PHRASES), []);
  });

  it('never treats sold out as acceptable', () => {
    assert.ok(NEVER_PERMITTED_PHRASES.includes('sold out'));
    assert.equal(findProhibitedPhrases('Sold Out', NEVER_PERMITTED_PHRASES).length, 1);
  });
});
