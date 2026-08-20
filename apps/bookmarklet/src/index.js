import { parseMenuLines } from '@inventory-index/core/menuText';
import { collectLines, collectSelection } from './collect.js';
import { renderPanel } from './overlay.js';

/**
 * Entry point.
 *
 * Everything happens inside the page the reader already has open. No request
 * is made, nothing is uploaded, and the only thing that leaves is whatever the
 * reader chooses to put on their own clipboard.
 */
function run() {
  // A selection means "just this bit"; otherwise read the whole page.
  const selected = collectSelection();
  const lines = selected.length > 0 ? selected : collectLines();
  renderPanel(parseMenuLines(lines), { onRescan: run });
}

run();
