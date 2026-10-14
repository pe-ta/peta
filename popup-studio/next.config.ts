import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Classic rendering model for the MVP (no Cache Components yet).
  serverExternalPackages: ["@resvg/resvg-js", "postgres"],
  outputFileTracingIncludes: {
    "/*": ["./node_modules/@fontsource/noto-sans-jp/files/*-japanese-*-normal.woff"],
  },
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
