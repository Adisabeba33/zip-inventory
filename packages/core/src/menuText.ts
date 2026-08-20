import { dedupeObservations, type DedupedStrain } from './dedupe.js';
import { classifyProduct } from './productType.js';
import { canonicalizeStrainName, isPackagingNoise } from './strainName.js';
import { UNCLASSIFIED_WEIGHT, type NormalizedObservation } from './types.js';
import { extractWeightFromTitle, normalizeWeight } from './weights.js';

export interface SkippedLine {
  line: string;
  reason: string;
}

export interface MenuTextResult {
  entries: DedupedStrain[];
  /** Nothing is dropped quietly; every unused line is here with a reason. */
  skipped: SkippedLine[];
  lineCount: number;
  itemCount: number;
  /** Blocks that held more than one candidate name, worth a human glance. */
  ambiguousBlocks: number;
}

/**
 * Marker a caller may insert to say "a new product block starts here".
 *
 * A reader that can see the page structure knows where one product card ends
 * and the next begins; text alone does not. Without it, page furniture above
 * the grid drifts into the first card and takes its strain name with it.
 */
export const BLOCK_BOUNDARY = '\u001f';

/** A line that is only a price. In a card layout this ends the card. */
const PRICE_ONLY = /^[\s$]*\d+(?:[.,]\d{1,2})?\s*(?:usd)?$/i;

/** A line with no letters at all cannot be a cultivar name. */
const HAS_LETTERS = /[a-z]/i;

/**
 * A cultivar name needs two consecutive letters. This is what keeps the "g" in
 * "3.5g" from being mistaken for a name.
 */
const HAS_WORD = /[a-z]{2}/i;

function isBareSize(line: string): boolean {
  // A size on its own line, e.g. "3.5g" or "1/8 oz", with nothing else.
  return normalizeWeight(line).weight !== UNCLASSIFIED_WEIGHT && !HAS_LETTERS.test(line.replace(/oz|ounce|gram|g\b|eighth|quarter|half/gi, ''));
}

/**
 * Turn menu text into observations.
 *
 * Menus copy out in two shapes and this handles both:
 *
 *   "Brand - Strain - 3.5g - $45"        one product per line
 *   "Strain" / "Brand" / "3.5g" / "$45"  one field per line, as menu cards do
 *
 * In the second shape the block's first name is taken as the cultivar, because
 * a menu card leads with the product and follows with the producer. Every line
 * that is not used is returned with the reason, so the result can be checked
 * rather than trusted.
 */
export function parseMenuLines(rawLines: readonly string[]): MenuTextResult {
  const lines = rawLines.map((line) => (line === BLOCK_BOUNDARY ? line : line.trim())).filter(Boolean);
  const observations: NormalizedObservation[] = [];
  const skipped: SkippedLine[] = [];
  let block: string[] = [];
  let ambiguousBlocks = 0;

  const flushBlock = () => {
    if (block.length > 0) skipped.push({ line: block[0] as string, reason: 'no package size found' });
    block = [];
  };

  const emit = (name: string, weight: NormalizedObservation['canonicalWeight'], raw: string) => {
    const parsed = canonicalizeStrainName(name);
    observations.push({
      sourceItemId: null,
      rawName: raw,
      canonicalName: parsed.canonicalName,
      rawWeight: null,
      canonicalWeight: weight,
      productType: 'FLOWER',
      flowerSubtype: parsed.subtype,
    });
  };

  for (const line of lines) {
    if (line === BLOCK_BOUNDARY) {
      flushBlock();
      continue;
    }

    if (classifyProduct(line).productType === 'EXCLUDED' && /[a-z]{3}/i.test(line)) {
      const classification = classifyProduct(line);
      if (classification.reason.startsWith('excluded category')) {
        flushBlock();
        skipped.push({ line, reason: classification.reason });
        continue;
      }
    }

    if (PRICE_ONLY.test(line)) {
      flushBlock();
      continue;
    }

    // A line that is only a package size closes the block of names above it.
    // Checked before anything else: it cannot also be a product line.
    if (isBareSize(line)) {
      const match = normalizeWeight(line);
      if (block.length > 0 && match.weight !== UNCLASSIFIED_WEIGHT) {
        if (block.length > 1) ambiguousBlocks += 1;
        emit(block[0] as string, match.weight, `${block[0]} + ${line}`);
        block = [];
      } else {
        skipped.push({ line, reason: 'package size with no strain name above it' });
      }
      continue;
    }

    const inline = extractWeightFromTitle(line);
    const named = canonicalizeStrainName(line);
    const hasName = HAS_WORD.test(named.canonicalName);

    // Name and size on the same line: a complete product.
    if (inline.weight !== UNCLASSIFIED_WEIGHT && hasName) {
      flushBlock();
      emit(line, inline.weight, line);
      continue;
    }

    if (hasName && !isPackagingNoise(line)) {
      block.push(line);
      continue;
    }

    if (line.length > 1 && HAS_LETTERS.test(line)) {
      skipped.push({ line, reason: 'no package size' });
    }
  }
  flushBlock();

  const deduped = dedupeObservations(observations);

  return {
    entries: deduped.entries,
    skipped,
    lineCount: lines.filter((line) => line !== BLOCK_BOUNDARY).length,
    itemCount: observations.length,
    ambiguousBlocks,
  };
}
