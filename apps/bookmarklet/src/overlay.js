import { WEIGHT_PRESENTATION } from '@inventory-index/core/types';

/**
 * The panel that shows the result.
 *
 * It lives in a shadow root so the host page's stylesheet cannot reach it and
 * ours cannot reach the host page. Dispensary sites carry heavy CSS; without
 * this the panel would inherit whatever they set on div, ul and button.
 */
const STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .panel {
    position: fixed; top: 12px; right: 12px; bottom: 12px; width: min(420px, calc(100vw - 24px));
    background: #fbfbf9; color: #1b1b19; z-index: 2147483647;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 15px; line-height: 1.5; font-variant-numeric: tabular-nums;
    border: 1px solid #c9c8bf; border-radius: 4px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.28);
    display: flex; flex-direction: column; overflow: hidden;
  }
  @media (prefers-color-scheme: dark) {
    .panel { background: #1d1d21; color: #ececea; border-color: #45454f; }
    .head, .foot { background: #232328 !important; border-color: #32323a !important; }
    .row, .lo { border-color: #32323a !important; }
    .btn { background: #1d1d21; color: #ececea; border-color: #45454f; }
    .btn.primary { background: #9db8d4; color: #14202b; border-color: #9db8d4; }
    .sub, .why, .note { color: #a3a39c !important; }
    details { background: #232328 !important; border-color: #32323a !important; }
  }
  .head {
    padding: 10px 12px; border-bottom: 1px solid #e2e1da; background: #fff;
    display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
  }
  .title { font-weight: 600; font-size: 14px; letter-spacing: 0.02em; margin: 0; }
  .sub { font-size: 12px; color: #64645d; margin: 0; }
  .x { margin-left: auto; cursor: pointer; border: 0; background: none; font-size: 20px; line-height: 1; color: inherit; padding: 0 4px; }
  .body { padding: 12px; overflow-y: auto; flex: 1; }
  .grp { border-top: 1px solid #e2e1da; padding-top: 10px; margin-top: 12px; }
  .grp:first-child { border-top: 0; margin-top: 0; padding-top: 0; }
  .ghead { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
  .glabel { font-size: 11px; letter-spacing: 0.09em; text-transform: uppercase; color: #64645d; margin: 0; }
  ul { list-style: none; margin: 0; padding: 0; }
  .row { padding: 5px 0; border-bottom: 1px solid #e2e1da; display: flex; gap: 8px; align-items: baseline; }
  .row span:first-child { flex: 1; }
  .cnt { font-size: 10px; letter-spacing: 0.06em; border: 1px solid #c9c8bf; border-radius: 2px; padding: 0 4px; color: #64645d; }
  .btn {
    font: inherit; font-size: 13px; cursor: pointer; background: #fff; color: #1b1b19;
    border: 1px solid #c9c8bf; border-radius: 3px; padding: 5px 10px; white-space: nowrap;
  }
  .btn.primary { background: #33506b; color: #fff; border-color: #33506b; }
  .btn:disabled { opacity: 0.5; cursor: default; }
  .foot { padding: 10px 12px; border-top: 1px solid #e2e1da; background: #fff; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .status { font-size: 12px; color: #64645d; min-height: 1em; }
  .note { font-size: 12px; color: #64645d; margin: 10px 0 0; }
  details { border: 1px solid #e2e1da; border-radius: 3px; padding: 8px 10px; margin-top: 14px; background: #f4f3ef; }
  summary { cursor: pointer; font-size: 13px; }
  .lo { font-size: 12px; padding: 3px 0; border-bottom: 1px solid #e2e1da; display: flex; gap: 8px; }
  .lo span:first-child { flex: 1; overflow-wrap: anywhere; }
  .why { color: #8a8a82; font-size: 11px; white-space: nowrap; }
`;

const HOST_ID = 'inventory-index-bookmarklet-host';

export function renderPanel(result, { onRescan }) {
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  root.appendChild(style);

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  const panel = el('div', 'panel');

  // ---- header
  const head = el('div', 'head');
  const total = result.entries.length;
  head.appendChild(el('p', 'title', `${total} ${total === 1 ? 'strain' : 'strains'} found`));
  head.appendChild(el('p', 'sub', `${result.lineCount} lines read on this page`));
  const close = el('button', 'x', '×');
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', () => host.remove());
  head.appendChild(close);
  panel.appendChild(head);

  // ---- body
  const body = el('div', 'body');
  const status = el('span', 'status');

  const copy = async (names, label) => {
    const text = names.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = `${names.length} ${label} copied`;
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
        status.textContent = `${names.length} ${label} copied`;
      } catch {
        status.textContent = 'Clipboard blocked here — select the list and copy by hand.';
      }
      area.remove();
    }
    setTimeout(() => { status.textContent = ''; }, 3500);
  };

  const everything = [];
  for (const weight of ['EIGHTH', 'QUARTER', 'HALF', 'OUNCE']) {
    const rows = result.entries.filter((e) => e.packageWeight === weight);
    if (rows.length === 0) continue;
    const names = rows.map((r) => r.canonicalName);
    everything.push(...names);

    const group = el('section', 'grp');
    const ghead = el('div', 'ghead');
    const presentation = WEIGHT_PRESENTATION[weight];
    ghead.appendChild(el('p', 'glabel', `${presentation.ounceLabel} · ${presentation.gramLabel} · ${rows.length}`));
    const btn = el('button', 'btn', `Copy ${rows.length}`);
    btn.addEventListener('click', () => copy(names, 'names'));
    ghead.appendChild(btn);
    group.appendChild(ghead);

    const list = el('ul');
    for (const row of rows) {
      const li = el('li', 'row');
      li.appendChild(el('span', null, row.canonicalName));
      if (row.listingCount > 1) li.appendChild(el('span', 'cnt', `${row.listingCount}×`));
      list.appendChild(li);
    }
    group.appendChild(list);
    body.appendChild(group);
  }

  if (total === 0) {
    body.appendChild(el('p', 'note',
      'Nothing on this page parsed as flower with a standard package size. If the menu loads as you scroll, scroll to the bottom and press Rescan.'));
  }

  // Nothing vanishes quietly: every unused line is listed with its reason.
  if (result.skipped.length) {
    const details = el('details');
    details.appendChild(el('summary', null, `Set aside — ${result.skipped.length} lines`));
    for (const item of result.skipped.slice(0, 300)) {
      const row = el('div', 'lo');
      row.appendChild(el('span', null, item.line.length > 120 ? `${item.line.slice(0, 120)}…` : item.line));
      row.appendChild(el('span', 'why', item.reason));
      details.appendChild(row);
    }
    body.appendChild(details);
  }

  if (result.ambiguousBlocks > 0) {
    body.appendChild(el('p', 'note',
      `${result.ambiguousBlocks} blocks held more than one name; the first was taken as the strain. Worth a glance.`));
  }

  panel.appendChild(body);

  // ---- footer
  const foot = el('div', 'foot');
  const copyAll = el('button', 'btn primary', `Copy all ${everything.length}`);
  copyAll.disabled = everything.length === 0;
  copyAll.addEventListener('click', () => copy(everything, 'strain names'));
  foot.appendChild(copyAll);

  const rescan = el('button', 'btn', 'Rescan');
  rescan.addEventListener('click', () => onRescan());
  foot.appendChild(rescan);
  foot.appendChild(status);
  panel.appendChild(foot);

  root.appendChild(panel);
  document.body.appendChild(host);
}
