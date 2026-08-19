import type { MetadataRoute } from 'next';
import { site } from '@/lib/site';

/**
 * Search-engine policy is a release gate, not a preference. Until public launch
 * and indexing are both switched on, nothing here is indexable.
 */
export default function robots(): MetadataRoute.Robots {
  if (!site.publicLaunchEnabled || !site.publicIndexingEnabled) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/admin', '/api'] },
    ],
    sitemap: `${site.url}/sitemap.xml`,
  };
}
