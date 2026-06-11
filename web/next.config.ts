import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // The repo root also has a package-lock.json (for backend lint deps).
  // Pin Turbopack to this directory so it picks up web/'s lockfile, not the
  // root one — otherwise modules like `tailwindcss` resolve from the wrong tree.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Host-level redirects (www / old vercel.app → mapasus.com.br) are handled
  // natively by Vercel once mapasus.com.br is set as the project's Primary
  // Domain — it 308s every non-primary host to the primary. Doing it here
  // instead would redirect the live vercel.app URL to mapasus.com.br even
  // BEFORE its DNS resolves, taking the site offline. So only the path-level
  // redirect lives here.
  async redirects() {
    return [
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
