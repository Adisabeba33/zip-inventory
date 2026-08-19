import { createHash } from 'node:crypto';
import type { DedupedStrain } from './dedupe.js';

/**
 * Deterministic fingerprint of a de-duplicated snapshot.
 *
 * Two runs that observed the same strains in the same package sizes produce the
 * same checksum, so an unchanged menu is recorded as an observation with a
 * NO CHANGE diff instead of thousands of pointless change events.
 */
export function snapshotChecksum(entries: readonly DedupedStrain[]): string {
  const canonical = entries
    .map((entry) => entry.key)
    .sort()
    .join('\n');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** Fingerprint of a raw payload, kept for debugging after the body is purged. */
export function payloadChecksum(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}
