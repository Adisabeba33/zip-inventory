import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { NEVER_PERMITTED_PHRASES, findProhibitedPhrases } from '@inventory-index/core';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function collect(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      files.push(...(await collect(full)));
    } else if (['.ts', '.tsx'].includes(extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

/** Comments explain the rules and are allowed to name the words they ban. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('user-facing copy', () => {
  it('never uses retail or availability-guarantee language', async () => {
    const files = await collect(SRC);
    assert.ok(files.length > 20, 'expected to find the application sources');

    const offences: string[] = [];
    for (const file of files) {
      const source = stripComments(await readFile(file, 'utf8'));
      for (const match of findProhibitedPhrases(source, NEVER_PERMITTED_PHRASES)) {
        offences.push(`${relative(SRC, file)}: "${match.phrase}" in ...${match.excerpt}...`);
      }
    }

    assert.deepEqual(offences, [], `prohibited wording found:\n${offences.join('\n')}`);
  });

  it('has no purchase, ordering or cart affordances', async () => {
    const files = await collect(SRC);
    const banned = /\b(?:addToCart|checkoutUrl|orderNow|purchaseLink|affiliate|utm_source)\b/i;
    const offences = [];
    for (const file of files) {
      if (banned.test(stripComments(await readFile(file, 'utf8')))) offences.push(relative(SRC, file));
    }
    assert.deepEqual(offences, []);
  });
});
