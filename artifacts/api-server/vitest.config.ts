import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts", "src/**/*.test.ts"],
    setupFiles: ["./src/tests/setup.ts"],
    coverage: {
      reporter: ["text", "json"],
    },
    server: {
      deps: {
        // Force Vite to bundle @zxcvbn-ts/* through its ESM pipeline.
        // Without this, Node loads the CJS versions whose decompress.cjs
        // exports { default: fn } instead of fn — crashing language-en/common.
        inline: [/@zxcvbn-ts\//],
      },
    },
  },
});
