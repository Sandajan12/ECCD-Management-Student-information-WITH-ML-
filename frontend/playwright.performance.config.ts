import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "performance.spec.ts",
  outputDir: "./test-results/performance",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5190" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 320, height: 900 } } },
  ],
  webServer: {
    command: `${process.platform === "win32" ? "pnpm.cmd" : "pnpm"} preview --host 127.0.0.1 --port 5190 --strictPort`,
    url: "http://127.0.0.1:5190",
    timeout: 60000,
  },
});
