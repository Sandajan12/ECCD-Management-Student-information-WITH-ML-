import { defineConfig } from "@playwright/test";
import path from "node:path";

export default defineConfig({
  testDir: "../tests",
  testMatch: [
    "parent-assessment.spec.ts",
    "teacher-eccd-assessment.spec.ts",
    "auth-download.spec.ts",
  ],
  outputDir: "../test-results/parent-assessment",
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:5192",
    trace: "retain-on-failure",
    browserName: "chromium",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "mobile", use: { viewport: { width: 320, height: 700 } } },
  ],
  webServer: {
    command: `${process.platform === "win32" ? "pnpm.cmd" : "pnpm"} dev --host 127.0.0.1 --port 5192 --strictPort`,
    cwd: path.resolve(import.meta.dirname, ".."),
    env: {
      VITE_API_URL: "http://127.0.0.1:5192",
      VITE_SOCKET_URL: "http://127.0.0.1:5192",
    },
    url: "http://127.0.0.1:5192",
    reuseExistingServer: !process.env.CI,
  },
});
