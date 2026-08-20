import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, 'dist');

/**
 * Bundle the bookmarklet.
 *
 * The parsing rules come from @inventory-index/core, so the bookmarklet and the
 * rest of the project cannot drift apart: there is one implementation of "what
 * counts as an eighth" and it is the tested one.
 */
const result = await esbuild.build({
  entryPoints: [join(HERE, 'src', 'index.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  platform: 'browser',
  legalComments: 'none',
  write: false,
});

const code = result.outputFiles[0].text.trim();

// Wrapped so a syntax error on the host page cannot leave a half-run script,
// and so nothing is left behind in the page's global scope.
const wrapped = `(function(){try{${code}}catch(e){alert('Strain reader failed on this page: '+e.message);}})()`;
const url = `javascript:${encodeURIComponent(wrapped)}`;

await mkdir(DIST, { recursive: true });
await writeFile(join(DIST, 'bookmarklet.js'), code, 'utf8');
await writeFile(join(DIST, 'bookmarklet.url.txt'), url, 'utf8');

const template = await readFile(join(HERE, 'src', 'install.template.html'), 'utf8');
// replaceAll, not replace: the placeholder appears in both the drag target and
// the copy box, and replacing only the first left the copy box handing out the
// literal placeholder.
const installed = template.replaceAll('__BOOKMARKLET_URL__', url.replace(/"/g, '&quot;'));
if (installed.includes('__BOOKMARKLET_URL__')) {
  throw new Error('A __BOOKMARKLET_URL__ placeholder survived into the install page.');
}
await writeFile(join(DIST, 'install.html'), installed, 'utf8');

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
console.log(`bundle   ${kb(code.length)}`);
console.log(`href     ${kb(url.length)}`);
if (url.length > 60000) console.warn('WARNING: some browsers refuse very long bookmarklet URLs.');
console.log(`written  ${DIST}`);
