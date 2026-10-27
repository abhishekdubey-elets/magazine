import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Unit and integration tests. Browser-only modules are stubbed: Next's Google
 * font loader (page fonts) and the `server-only` marker. Text measurement
 * falls back to the text engine's SSR estimate, so fitting is deterministic.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "next/font/google": path.resolve(__dirname, "tests/stubs/next-font-google.ts"),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: "forks",
    fileParallelism: false,
  },
});
