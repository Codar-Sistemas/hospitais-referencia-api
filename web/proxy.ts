// Host-based router for the MapaSUS multi-tenant platform.
// (Next.js 16 renamed `middleware` → `proxy`; same functionality.)
//
// On a vertical subdomain (e.g. peconhentos.mapasus.com.br) we rewrite the
// request to the matching `app/[vertical]` route so the URL stays clean while
// the right vertical renders:
//   peconhentos.mapasus.com.br/            → /venomous-animals
//   peconhentos.mapasus.com.br/profissionais → /venomous-animals/profissionais
//
// The apex host (mapasus.com.br) and the current vercel.app / localhost hosts
// have no subdomain mapping, so they pass through untouched: `/` serves the hub
// and `/venomous-animals` is reachable via its clean path. Platform-wide pages
// (/stats, /docs, /termos) are never prefixed — they live at the root on every
// host.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SUBDOMAIN_TO_SLUG } from '@/lib/verticals';

// Paths that stay at the root on every host (not vertical-scoped).
const GLOBAL_PREFIXES = ['/stats', '/docs', '/termos', '/sobre'];

export function proxy(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').toLowerCase().split(':')[0] ?? '';
  const { pathname } = request.nextUrl;

  // Dev/QA override so subdomain routing can be exercised without DNS:
  //   ?vertical=venomous-animals   or   header `x-vertical: venomous-animals`.
  const devSlug =
    request.nextUrl.searchParams.get('vertical') ?? request.headers.get('x-vertical') ?? undefined;

  const slug = SUBDOMAIN_TO_SLUG[host] ?? devSlug;

  // No vertical subdomain (apex / vercel.app / localhost) and no override:
  // pass through. Hub at `/`, verticals reachable via clean `/<slug>` paths.
  if (!slug) return NextResponse.next();

  // Global pages are served from the root on subdomains too.
  if (GLOBAL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  // Idempotency: an already-prefixed path (or a stray request to a different
  // vertical) is left as-is to avoid double prefixing.
  if (pathname === `/${slug}` || pathname.startsWith(`/${slug}/`)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = pathname === '/' ? `/${slug}` : `/${slug}${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Skip API, Next internals, and metadata files so they resolve per-host.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|opengraph-image|.*\\.png$).*)',
  ],
};
