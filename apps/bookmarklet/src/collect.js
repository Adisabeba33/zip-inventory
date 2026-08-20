/**
 * Read the page the user is already looking at.
 *
 * This runs in the reader's own browser, on a page their browser has already
 * loaded, when they ask for it. It makes no network request of any kind, and
 * nothing leaves the page.
 */

import { BLOCK_BOUNDARY } from '@inventory-index/core/browser';

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH', 'CANVAS', 'IFRAME',
  'NAV', 'HEADER', 'FOOTER', 'FORM', 'SELECT', 'OPTION', 'BUTTON',
]);

/**
 * True when this element is one of several siblings drawn the same way - a
 * product card in a grid. Their boundaries are what stop one card's fields
 * from being read as part of the next.
 */
function isRepeatedItem(node) {
  const parent = node.parentElement;
  if (!parent) return false;
  const siblings = [...parent.children].filter(
    (child) => child.tagName === node.tagName && child.className === node.className,
  );
  return siblings.length >= 3;
}

/** Elements that are present but not shown contribute nothing. */
function isVisible(node) {
  if (!(node instanceof Element)) return true;
  const style = window.getComputedStyle(node);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  return node.getClientRects().length > 0;
}

/**
 * Collect one line per leaf element.
 *
 * Menu cards put the strain, the producer, the size and the price in separate
 * elements, so taking the deepest element that owns text reproduces exactly the
 * field-per-line shape the parser handles best - and far more reliably than
 * innerText, which glues neighbouring fields together.
 */
export function collectLines(root = document.body) {
  const lines = [];

  const walk = (node) => {
    if (!(node instanceof Element)) return;
    if (SKIP_TAGS.has(node.tagName)) return;
    if (node.getAttribute('aria-hidden') === 'true') return;
    if (!isVisible(node)) return;

    if (isRepeatedItem(node)) lines.push(BLOCK_BOUNDARY);

    const childElements = [...node.children].filter(
      (child) => !SKIP_TAGS.has(child.tagName) && (child.textContent || '').trim().length > 0,
    );

    if (childElements.length === 0) {
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (text && text.length <= 200) lines.push(text);
      return;
    }

    /* Text that belongs to this element rather than to a child still counts. */
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent || '').replace(/\s+/g, ' ').trim();
        if (text && text.length <= 200) lines.push(text);
      }
    }

    for (const child of childElements) walk(child);
  };

  walk(root);

  // Deliberately no de-duplication here. Product attributes repeat by nature -
  // a menu with twelve eighths has twelve "3.5g" lines - and collapsing repeats
  // silently destroys most of the menu. Navigation and filter chips repeat too,
  // but they carry no package size, so the parser sets them aside on its own.
  return lines;
}

/** Just the current selection, for the highlight-one-strain case. */
export function collectSelection() {
  const selection = window.getSelection();
  const text = selection ? String(selection) : '';
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}
