import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows a production build alongside a running dev server (NEXT_DIST_DIR=.next-build).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  webpack: (config) => {
    // pdf.js references the optional Node "canvas" package; it is never used in the browser.
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

export default nextConfig;
