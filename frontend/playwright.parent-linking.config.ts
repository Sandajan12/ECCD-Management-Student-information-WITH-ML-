import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "parent-linking.spec.ts",
  timeout: 30000,
  workers: 1,
  reporter: "list",
  outputDir: "./test-results/parent-linking",
  use: { baseURL: "http://127.0.0.1:5193", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "pnpm.cmd dev --host 127.0.0.1 --port 5193 --strictPort",
    url: "http://127.0.0.1:5193",
    reuseExistingServer: true,
  },
});
