import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // The repo root also has a package-lock.json (for backend lint deps).
  // Pin Turbopack to this directory so it picks up web/'s lockfile, not the
  // root one — otherwise modules like `tailwindcss` resolve from the wrong tree.
  turbopack: {
    root: path.resolve(__dirname),
  },
  async redirects() {
    return [
      // SEO consolidation: send every non-canonical host to https://mapasus.com.br
      // so link juice and indexing land on one domain. The canonical <link> tags
      // already point here; these 308s make it authoritative.
      //   www.mapasus.com.br/*               → mapasus.com.br/*
      //   hospitais-referencia-web.vercel.app/* → mapasus.com.br/*
      // The vertical subdomains (peconhentos/raras/oncologia.mapasus.com.br) are
      // NOT redirected — proxy.ts rewrites those to their vertical.
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.mapasus.com.br' }],
        destination: 'https://mapasus.com.br/:path*',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'hospitais-referencia-web.vercel.app' }],
        destination: 'https://mapasus.com.br/:path*',
        permanent: true,
      },
      // Preserve the single indexed URL that moved under the venomous-animals
      // vertical. (`/` intentionally changed from the venomous search to the hub.)
      {
        source: '/profissionais',
        destination: '/venomous-animals/profissionais',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
