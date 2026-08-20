/**
 * The browser-safe half of the domain rules.
 *
 * The main barrel pulls in checksum.ts and scheduler.ts, which need
 * node:crypto; importing it from a client component or a bookmarklet fails the
 * build. Everything re-exported here is pure computation with no Node built-in
 * behind it, so it is safe anywhere.
 *
 * If you add a module that imports a node: builtin, it does not belong here.
 */
export * from './types.js';
export * from './weights.js';
export * from './strainName.js';
export * from './productType.js';
export * from './aliases.js';
export * from './dedupe.js';
export * from './menuText.js';
export * from './freshness.js';
export * from './geo.js';
export * from './vocabulary.js';
