// Canonical PUBLIC URLs of the platform — single source for metadata,
// canonicals, sitemap, OG, llms.txt and the docs page. These are display
// URLs: they always point at production, regardless of environment (a
// canonical/documented URL must not become `localhost` on a dev build).
//
// The API CLIENT's fetch base is a separate concern: it reads
// NEXT_PUBLIC_API_URL to let local/preview deploys hit a different API,
// falling back to API_URL. See lib/api-client.ts.
export const SITE_URL = 'https://mapasus.com.br';
export const API_URL = 'https://api.mapasus.com.br';
