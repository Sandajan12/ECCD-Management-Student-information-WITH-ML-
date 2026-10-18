import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "teacher-management.spec.ts",
  grep: /adviser takeover|unassigned section saves/,
  timeout: 45000,
  workers: 1,
  reporter: "list",
  outputDir: "./test-results/adviser-takeover",
  use: {
    baseURL: "http://localhost:5173",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm.cmd dev --host localhost --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: true,
  },
});
