import { config } from '@inventory-index/db';

/**
 * Site-wide identity and release-gate state, read once per request on the
 * server. The gates default closed, so a misconfigured deployment is private
 * rather than public.
 */
export const site = {
  name: config.serviceName,
  url: config.servicePublicUrl,
  tagline: 'Independent dispensary inventory index',
  ageGateEnabled: config.ageGateEnabled,
  publicIndexingEnabled: config.publicIndexingEnabled,
  publicLaunchEnabled: config.publicLaunchEnabled,
  contact: config.contact,
  crawlerUserAgent: config.crawler.userAgent,
} as const;

/**
 * Robots metadata for a page.
 *
 * Retailer inventory pages stay noindex until the legal release gate is
 * signed off; the directory front page is controlled separately so it can be
 * indexable on its own.
 */
export function robotsFor(kind: 'directory' | 'inventory' | 'always-noindex') {
  if (kind === 'always-noindex') return { index: false, follow: false };
  const allowed = site.publicIndexingEnabled && site.publicLaunchEnabled;
  if (kind === 'directory') return { index: allowed, follow: allowed };
  return { index: allowed, follow: allowed };
}
