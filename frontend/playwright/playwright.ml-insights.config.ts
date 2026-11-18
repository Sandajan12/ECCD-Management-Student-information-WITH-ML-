import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

export default defineConfig({
  testDir: "../tests",
  testMatch: "ml-insights.spec.ts",
  outputDir: "../test-results/ml-insights",
  use: { baseURL: "http://localhost:5173" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    cwd: path.resolve(import.meta.dirname, ".."),
    command: "pnpm dev --host localhost --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: true,
  },
});
