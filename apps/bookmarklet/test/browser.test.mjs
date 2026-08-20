/**
 * End-to-end check: run the built bookmarklet against a page shaped like a real
 * dispensary menu and assert on what the panel shows.
 *
 * Needs Chromium. Set CHROME to point at one; without it the test skips rather
 * than failing, so `npm test` still works on a machine with no browser.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));

function findChrome() {
  const candidates = [
    process.env.CHROME,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  return candidates.find((path) => existsSync(path)) ?? null;
}

test('reads a realistic menu page', async (t) => {
  const chrome = findChrome();
  if (!chrome) return t.skip('no chromium available');

  const bundle = join(HERE, '..', 'dist', 'bookmarklet.js');
  if (!existsSync(bundle)) return t.skip('run `npm run build` first');

  const page = await readFile(join(HERE, 'fake-menu.html'), 'utf8');
  const code = await readFile(bundle, 'utf8');

  const driver = `<script>window.addEventListener('load',()=>{${code}
    setTimeout(()=>{
      const root=document.getElementById('inventory-index-bookmarklet-host').shadowRoot;
      const out={};
      for(const g of root.querySelectorAll('.grp')){
        out[g.querySelector('.glabel').textContent.split(' ')[0]]=
          [...g.querySelectorAll('.row')].map(r=>r.querySelector('span').textContent);
      }
      document.title='JSON'+JSON.stringify(out);
    },250);
  });<\/script>`;

  const dir = mkdtempSync(join(tmpdir(), 'bookmarklet-'));
  writeFileSync(join(dir, 'page.html'), page.replace('</body>', `${driver}</body>`));

  const run = spawnSync(chrome, [
    '--headless', '--no-sandbox', '--disable-gpu', '--virtual-time-budget=4000',
    '--dump-dom', `file://${join(dir, 'page.html')}`,
  ], { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 });

  const match = /<title>JSON(.*?)<\/title>/s.exec(run.stdout ?? '');
  assert.ok(match, 'the panel never rendered');
  const found = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));

  assert.deepEqual(found['1/8'], [
    'Blue Dream', 'Gelato 41', 'Gushers', 'Ice Cream Cake', 'Lemon Cherry Gelato',
    'MAC 1', 'Permanent Marker', 'Runtz', 'Sour Diesel', 'Wedding Cake', 'Zkittlez',
  ]);
  assert.deepEqual(found['1/4'], ['Blue Dream', 'Sour Diesel', 'Wedding Cake']);
  assert.deepEqual(found['1/2'], ['Blue Dream', 'GG4']);
  assert.deepEqual(found['1'], [
    'Animal Cookies', 'Ghost Train Haze', 'Gushers', 'Pineapple Express',
    'Sour Diesel', 'Super Silver Haze',
  ]);

  const all = Object.values(found).flat();
  // Filter chips and page furniture must not become strains.
  for (const junk of ['Effects', 'Sort', 'Flower', 'Popularity', 'Showing 29 products']) {
    assert.ok(!all.includes(junk), `page furniture leaked in: ${junk}`);
  }
  // Non-flower and non-standard sizes stay out.
  for (const junk of ['Blue Dream Pre-Roll 5-Pack', 'Watermelon Gummies 10pk', 'Branded Grinder']) {
    assert.ok(!all.includes(junk), `not flower: ${junk}`);
  }
  // display:none content is not on the page as far as a reader is concerned.
  assert.ok(!all.includes('Secret Strain'), 'hidden element was read');
});
