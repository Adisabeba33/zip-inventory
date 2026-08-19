import type { MetadataRoute } from 'next';
import { listDirectory } from '@/lib/queries';
import { site } from '@/lib/site';

/**
 * The sitemap only exists once both release gates are open. Before that the
 * whole site is disallowed in robots.txt and there is nothing to submit.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${site.url}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${site.url}/data-sources`, changeFrequency: 'monthly' },
    { url: `${site.url}/crawler`, changeFrequency: 'monthly' },
    { url: `${site.url}/terms`, changeFrequency: 'yearly' },
    { url: `${site.url}/privacy`, changeFrequency: 'yearly' },
    { url: `${site.url}/corrections`, changeFrequency: 'yearly' },
  ];

  if (!site.publicLaunchEnabled || !site.publicIndexingEnabled) return staticPages;

  const directory = await listDirectory().catch(() => []);
  return [
    ...staticPages,
    ...directory.map((entry) => ({
      url: `${site.url}/d/${entry.slug}`,
      changeFrequency: 'daily' as const,
      priority: 0.5,
    })),
  ];
}
