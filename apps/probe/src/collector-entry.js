/**
 * What gets injected into the menu page.
 *
 * Deliberately nothing but a call into the bookmarklet's collector. The whole
 * point of this probe is to measure the reader we already have, on a page a
 * real browser has really rendered. The moment this file grows logic of its
 * own, the measurement stops describing the product and starts describing the
 * probe.
 */
import { collectLines } from '../../bookmarklet/src/collect.js';

export function collect() {
  return collectLines();
}

/** Cheap page vitals, read from the same place at the same moment. */
export function vitals() {
  return {
    heightPx: document.body ? document.body.scrollHeight : 0,
    domNodes: document.getElementsByTagName('*').length,
    title: document.title,
  };
}
