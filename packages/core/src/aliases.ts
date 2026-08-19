import { strainMatchKey } from './strainName.js';

export interface StrainAlias {
  alias: string;
  canonicalName: string;
  confidence: number;
  source: string;
  manuallyVerified: boolean;
}

export interface AliasResolution {
  canonicalName: string;
  appliedAlias: StrainAlias | null;
}

/**
 * Alias table lookup.
 *
 * Only manually verified aliases are ever applied. Unverified rows exist so a
 * reviewer can see the suggestion in the admin dashboard, but they never change
 * what the public site shows: two similar names side by side is a smaller
 * mistake than merging two different cultivars.
 */
export function buildAliasIndex(aliases: readonly StrainAlias[]): Map<string, StrainAlias> {
  const index = new Map<string, StrainAlias>();
  for (const alias of aliases) {
    if (!alias.manuallyVerified) continue;
    const key = strainMatchKey(alias.alias);
    if (!key) continue;
    // Deterministic on duplicates: highest confidence wins, then first inserted.
    const existing = index.get(key);
    if (!existing || alias.confidence > existing.confidence) index.set(key, alias);
  }
  return index;
}

export function resolveAlias(name: string, index: Map<string, StrainAlias>): AliasResolution {
  const alias = index.get(strainMatchKey(name));
  if (!alias) return { canonicalName: name, appliedAlias: null };
  return { canonicalName: alias.canonicalName, appliedAlias: alias };
}

/**
 * Guard against alias chains and cycles (A -> B, B -> A). Applying an alias
 * once is enough; a chain means the table needs a human.
 */
export function findAliasCycles(aliases: readonly StrainAlias[]): string[] {
  const verified = aliases.filter((a) => a.manuallyVerified);
  const canonicalKeys = new Set(verified.map((a) => strainMatchKey(a.canonicalName)));
  return verified
    .filter((a) => canonicalKeys.has(strainMatchKey(a.alias)))
    .map((a) => `${a.alias} -> ${a.canonicalName}`);
}
