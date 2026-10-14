import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "parent-portal-parity.spec.ts",
  timeout: 45000,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "./test-results/parent-portal-report.json" }],
    [
      "html",
      { outputFolder: "./test-results/parent-portal-report", open: "never" },
    ],
  ],
  outputDir: "./test-results/parent-portal",
  snapshotPathTemplate: "{testDir}/../test-results/parent-reference/{arg}{ext}",
  use: {
    baseURL: "http://localhost:5179",
    browserName: "chromium",
    viewport: { width: 1200, height: 900 },
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
      command: "pnpm.cmd dev --host localhost --port 5179 --strictPort",
      url: "http://localhost:5179",
      reuseExistingServer: false,
    },
  ],
});
