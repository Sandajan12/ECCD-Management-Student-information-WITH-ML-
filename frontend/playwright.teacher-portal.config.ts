import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "teacher-portal-parity.spec.ts",
  timeout: 45000,
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    ["json", { outputFile: "./test-results/teacher-portal-report.json" }],
    [
      "html",
      { outputFolder: "./test-results/teacher-portal-report", open: "never" },
    ],
  ],
  outputDir: "./test-results/teacher-portal",
  snapshotPathTemplate:
    "{testDir}/../test-results/teacher-reference/{arg}{ext}",
  use: {
    baseURL: "http://localhost:5173",
    browserName: "chromium",
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
    locale: "en-GB",
    timezoneId: "Asia/Singapore",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "pnpm.cmd exec vite --config tests/legacy-visual/vite.config.mjs",
      url: "http://localhost:5187",
      reuseExistingServer: false,
    },
    {
      command: "pnpm.cmd dev --host localhost --port 5173 --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: true,
    },
  ],
});
