import type { NextConfig } from "next";

// Static export only: no server runtime, API routes, middleware or ISR.
// The service worker is built after `next build` by scripts/build-sw.ts.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
