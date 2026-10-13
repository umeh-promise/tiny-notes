import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [react()],
  test: {
    restoreMocks: true,
    clearMocks: true,
    allowOnly: !process.env.CI,
    projects: [
      {
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["{src,app}/**/*.test.{ts,tsx}"],
          exclude: ["**/*.integration.test.ts"],
          setupFiles: ["./tests/setup/unit.ts"],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          pool: "forks",
          include: ["{src,scripts}/**/*.integration.test.ts"],
          setupFiles: ["./tests/setup/integration.ts"],
        },
      },
    ],
  },
});
