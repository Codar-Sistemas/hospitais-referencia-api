import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { LIVE_VERTICALS } from '@/lib/verticals';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = SITE_URL;
  const now = new Date();

  // Hub landing.
  const entries: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: 'daily', priority: 1 },
  ];

  // Per-vertical routes (search home + professional view).
  for (const v of LIVE_VERTICALS) {
    entries.push(
      { url: `${baseUrl}/${v.slug}`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
      {
        url: `${baseUrl}/${v.slug}/profissionais`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.7,
      },
    );
  }

  // Platform-wide pages.
  entries.push(
    { url: `${baseUrl}/stats`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/docs`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/termos`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
  );

  return entries;
}
