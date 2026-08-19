import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isPathAllowed, parseRobots } from '../robots.js';

const ROBOTS = `
# example
User-agent: *
Disallow: /admin
Disallow: /api/private
Crawl-delay: 10

User-agent: InventoryIndexBot
Disallow: /menu
Allow: /menu/public
`;

describe('robots.txt handling', () => {
  const policy = parseRobots(ROBOTS);

  it('prefers a group naming our crawler over the wildcard group', () => {
    assert.equal(isPathAllowed(policy, '/menu', 'InventoryIndexBot').allowed, false);
    // The wildcard rule does not apply once a specific group matched.
    assert.equal(isPathAllowed(policy, '/admin', 'InventoryIndexBot').allowed, true);
  });

  it('lets the longest match win', () => {
    assert.equal(isPathAllowed(policy, '/menu/public/flower', 'InventoryIndexBot').allowed, true);
  });

  it('applies the wildcard group to other agents', () => {
    const decision = isPathAllowed(policy, '/admin/users', 'SomeOtherBot');
    assert.equal(decision.allowed, false);
    assert.equal(decision.crawlDelaySeconds, 10);
  });

  it('allows a path no rule mentions', () => {
    assert.equal(isPathAllowed(policy, '/about', 'SomeOtherBot').allowed, true);
  });

  it('understands wildcard and end-anchor patterns', () => {
    const wildcards = parseRobots('User-agent: *\nDisallow: /*.json$\n');
    assert.equal(isPathAllowed(wildcards, '/menu/data.json', 'AnyBot').allowed, false);
    assert.equal(isPathAllowed(wildcards, '/menu/data.html', 'AnyBot').allowed, true);
  });
});
