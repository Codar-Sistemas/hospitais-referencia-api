import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // The repo root also has a package-lock.json (for backend lint deps).
  // Pin Turbopack to this directory so it picks up web/'s lockfile, not the
  // root one — otherwise modules like `tailwindcss` resolve from the wrong tree.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Preserve the single indexed URL that moved under the venomous-animals
  // vertical. (`/` intentionally changed from the venomous search to the hub.)
  async redirects() {
    return [
      {
        source: '/profissionais',
        destination: '/venomous-animals/profissionais',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
