import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "ml-insights.spec.ts",
  outputDir: "./test-results/ml-insights",
  use: { baseURL: "http://localhost:5173" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev --host localhost --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: true,
  },
});
