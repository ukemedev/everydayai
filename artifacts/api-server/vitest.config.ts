import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts", "src/**/*.test.ts"],
    setupFiles: ["./src/tests/setup.ts"],
    coverage: {
      reporter: ["text", "json"],
    },
  },
});
