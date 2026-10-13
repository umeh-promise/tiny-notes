import { defineConfig, devices } from "@playwright/test";
import { testServers } from "./tests/e2e/support/environment";

const servers = testServers();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  failOnFlakyTests: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: servers.length,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.APP_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: "**/mobile.spec.ts" },
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, testIgnore: "**/mobile.spec.ts" },
    { name: "webkit", use: { ...devices["Desktop Safari"] }, testIgnore: "**/mobile.spec.ts" },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] }, testMatch: "**/mobile.spec.ts" },
    { name: "mobile-safari", use: { ...devices["iPhone 13"] }, testMatch: "**/mobile.spec.ts" },
  ],
  webServer: servers.map((server) => ({
    command: `bun run start --hostname 127.0.0.1 --port ${server.port}`,
    url: server.baseURL,
    env: { DB_PATH: server.dbPath, APP_URL: server.baseURL, TINYNOTES_E2E_DIR: server.directory },
    reuseExistingServer: false,
    timeout: 60_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
  })),
});
