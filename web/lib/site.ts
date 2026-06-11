// Canonical public URLs for the platform — single source for metadata,
// canonicals, sitemap, OG, llms.txt and the API client.
//
// Override per-environment with NEXT_PUBLIC_SITE_URL / NEXT_PUBLIC_API_URL
// (e.g. preview deploys, or while the production DNS is being set up). The
// defaults are the production MapaSUS domains.
export const SITE_URL = process.env['NEXT_PUBLIC_SITE_URL'] ?? 'https://mapasus.com.br';
export const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.mapasus.com.br';
