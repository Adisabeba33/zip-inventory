/**
 * A small, strict robots.txt reader.
 *
 * robots.txt is one input to a source policy review, never the whole review: a
 * permissive robots file does not override terms of service that prohibit
 * automated extraction. See docs/SOURCE-POLICY.md.
 */
export interface RobotsRule {
  path: string;
  allow: boolean;
}

export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
  crawlDelaySeconds: number | null;
}

export interface RobotsPolicy {
  groups: RobotsGroup[];
  raw: string;
}

export function parseRobots(text: string): RobotsPolicy {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastLineWasAgent = false;

  for (const line of text.split(/\r?\n/)) {
    const withoutComment = line.split('#')[0]?.trim() ?? '';
    if (!withoutComment) continue;
    const separator = withoutComment.indexOf(':');
    if (separator === -1) continue;
    const field = withoutComment.slice(0, separator).trim().toLowerCase();
    const value = withoutComment.slice(separator + 1).trim();

    if (field === 'user-agent') {
      if (!current || !lastLineWasAgent) {
        current = { agents: [], rules: [], crawlDelaySeconds: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastLineWasAgent = true;
      continue;
    }

    lastLineWasAgent = false;
    if (!current) continue;
    if (field === 'disallow') current.rules.push({ path: value, allow: false });
    else if (field === 'allow') current.rules.push({ path: value, allow: true });
    else if (field === 'crawl-delay') {
      const delay = Number.parseFloat(value);
      if (Number.isFinite(delay)) current.crawlDelaySeconds = delay;
    }
  }

  return { groups, raw: text };
}

function matchLength(pattern: string, path: string): number {
  if (pattern === '') return -1;
  // Support the * and $ wildcards that the common robots dialect uses.
  if (pattern.includes('*') || pattern.endsWith('$')) {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\\\$$/, '$');
    return new RegExp(`^${escaped}`).test(path) ? pattern.length : -1;
  }
  return path.startsWith(pattern) ? pattern.length : -1;
}

function selectGroup(policy: RobotsPolicy, userAgentToken: string): RobotsGroup | null {
  const token = userAgentToken.toLowerCase();
  let specific: RobotsGroup | null = null;
  let wildcard: RobotsGroup | null = null;
  for (const group of policy.groups) {
    for (const agent of group.agents) {
      if (agent === '*') wildcard = wildcard ?? group;
      else if (token.includes(agent)) specific = specific ?? group;
    }
  }
  return specific ?? wildcard;
}

export interface RobotsDecision {
  allowed: boolean;
  crawlDelaySeconds: number | null;
  matchedRule: string | null;
}

/**
 * Longest-match wins, allow beats disallow on an equal-length tie - the
 * conventional interpretation. When robots.txt cannot be read at all we return
 * allowed:false and let the policy review decide, rather than assuming consent.
 */
export function isPathAllowed(policy: RobotsPolicy, path: string, userAgentToken: string): RobotsDecision {
  const group = selectGroup(policy, userAgentToken);
  if (!group) return { allowed: true, crawlDelaySeconds: null, matchedRule: null };

  let best: { length: number; allow: boolean; path: string } | null = null;
  for (const rule of group.rules) {
    const length = matchLength(rule.path, path);
    if (length < 0) continue;
    if (!best || length > best.length || (length === best.length && rule.allow)) {
      best = { length, allow: rule.allow, path: rule.path };
    }
  }

  return {
    allowed: best ? best.allow : true,
    crawlDelaySeconds: group.crawlDelaySeconds,
    matchedRule: best?.path ?? null,
  };
}
