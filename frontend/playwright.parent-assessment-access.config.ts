import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "parent-assessment-access.spec.ts",
  timeout: 60000,
  workers: 1,
  reporter: "list",
  outputDir: "./test-results/parent-assessment-access",
  use: { baseURL: "http://127.0.0.1:5194", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    {
      command:
        "uv run --no-project --python .venv312 python -m backend.tests.serve_phase3 --port 8769",
      cwd: "..",
      env: { ALLOWED_ORIGINS: "http://127.0.0.1:5194" },
      url: "http://127.0.0.1:8769/healthz",
      timeout: 180000,
      reuseExistingServer: false,
    },
    {
      command: "pnpm.cmd dev --host 127.0.0.1 --port 5194 --strictPort",
      env: {
        VITE_API_URL: "http://127.0.0.1:8769",
        VITE_SOCKET_URL: "http://127.0.0.1:8769",
      },
      url: "http://127.0.0.1:5194",
      timeout: 120000,
      reuseExistingServer: false,
    },
  ],
});
