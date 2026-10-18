import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "teacher-portal-parity.spec.ts",
  grep: /saved-only|assessment carry-forward|delayed assessment confirmation|saved period bounds|checklist provenance|checklist grading/,
  timeout: 45000,
  workers: 1,
  reporter: "list",
  outputDir: "./test-results/eccd-drafts",
  use: {
    baseURL: "http://localhost:5173",
    browserName: "chromium",
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm.cmd dev --host localhost --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: true,
  },
});
