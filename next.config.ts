import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the little "N" dev badge in the corner (nicer for demos).
  devIndicators: false,
  // Cache Components is off on purpose: every page reads live data from
  // Supabase (ticket counts, sales cutoffs), so plain request-time rendering
  // is simpler and easier to reason about.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    serverActions: {
      // Event images are uploaded through a Server Action (max 5 MB + overhead).
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
