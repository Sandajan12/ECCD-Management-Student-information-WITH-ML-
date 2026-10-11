import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  snapshotPathTemplate:
    "{testDir}/../test-results/legacy-baselines/{projectName}/{arg}{ext}",
  use: { baseURL: "http://localhost:5173", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    {
      command: "pnpm exec vite --config tests/legacy-visual/vite.config.mjs",
      url: "http://localhost:5187/",
      reuseExistingServer: true,
    },
    {
      command: "pnpm dev --host localhost",
      url: "http://localhost:5173",
      reuseExistingServer: true,
    },
    {
      command:
        "uv run --no-project --python 3.12 python -m backend.tests.serve_phase3",
      cwd: "..",
      url: "http://127.0.0.1:8767/",
      reuseExistingServer: true,
    },
  ],
});
