import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // Emits .next/standalone with a self-contained server.js and only the
  // node_modules actually reached at runtime. Keeps the production image
  // small and means the container never needs a package install.
  output: 'standalone',
  // The passport page is the read-heavy surface: one row, rendered the same
  // way for every scan. Caching is what makes a million pieces cost about
  // what a thousand do, so the response headers matter more than the server.
  poweredByHeader: false,
};

export default nextConfig;
