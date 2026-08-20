import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The browser barrel exists so client components and the bookmarklet cannot
 * accidentally pull node:crypto into a bundle. That only holds if nothing it
 * re-exports reaches a Node built-in, so the rule is checked rather than
 * remembered.
 */
describe('browser barrel', () => {
  it('re-exports nothing that reaches a node built-in', async () => {
    const barrel = await readFile(join(SRC, 'browser.ts'), 'utf8');
    const exported = [...barrel.matchAll(/from '\.\/(\w+)\.js'/g)].map((m) => m[1] as string);
    assert.ok(exported.length > 5, 'expected the barrel to re-export the domain modules');

    const seen = new Set<string>();
    const reachable: string[] = [];
    const walk = async (name: string) => {
      if (seen.has(name)) return;
      seen.add(name);
      reachable.push(name);
      const source = await readFile(join(SRC, `${name}.ts`), 'utf8');
      for (const match of source.matchAll(/from '\.\/(\w+)\.js'/g)) await walk(match[1] as string);
    };
    for (const name of exported) await walk(name);

    const offenders: string[] = [];
    for (const name of reachable) {
      const source = await readFile(join(SRC, `${name}.ts`), 'utf8');
      if (/from 'node:/.test(source)) offenders.push(name);
    }
    assert.deepEqual(offenders, [], `these reach a node built-in: ${offenders.join(', ')}`);
  });

  it('leaves the node-only modules out', async () => {
    const barrel = await readFile(join(SRC, 'browser.ts'), 'utf8');
    for (const nodeOnly of ['checksum', 'scheduler']) {
      assert.ok(!barrel.includes(`./${nodeOnly}.js`), `${nodeOnly} needs node:crypto`);
    }
    // And they still exist, so the main barrel keeps working.
    const all = await readdir(SRC);
    assert.ok(all.includes('checksum.ts') && all.includes('scheduler.ts'));
  });
});
