import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts", "server/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts", "server/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/mock-*.ts"],
    },
  },
});
