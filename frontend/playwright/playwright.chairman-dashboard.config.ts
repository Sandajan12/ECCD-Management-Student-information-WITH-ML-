import { defineConfig } from "@playwright/test";
import path from "node:path";

export default defineConfig({
  testDir: "../tests",
  testMatch: "chairman-dashboard.spec.ts",
  outputDir: "../test-results/chairman-dashboard",
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:5193",
    trace: "retain-on-failure",
    reducedMotion: "reduce",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "laptop", use: { viewport: { width: 1024, height: 900 } } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "small-tablet", use: { viewport: { width: 640, height: 960 } } },
    { name: "mobile", use: { viewport: { width: 320, height: 700 } } },
  ],
  webServer: {
    command: "pnpm.cmd dev --host 127.0.0.1 --port 5193 --strictPort",
    cwd: path.resolve(import.meta.dirname, ".."),
    env: {
      VITE_API_URL: "http://127.0.0.1:5193",
      VITE_SOCKET_URL: "http://127.0.0.1:5193",
    },
    url: "http://127.0.0.1:5193",
    reuseExistingServer: !process.env.CI,
  },
});
