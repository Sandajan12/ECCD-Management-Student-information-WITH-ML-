import { defineConfig } from "@playwright/test";

// Run in CI; API calls are mocked and no school database is used.
export default defineConfig({
  testDir: "./tests",
  testMatch: ["parent-sync.spec.ts", "teacher-import.spec.ts"],
  outputDir: "./test-results/parent-sync",
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:5190",
    trace: "retain-on-failure",
    browserName: "chromium",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 320, height: 700 } } },
  ],
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 5190 --strictPort",
    cwd: import.meta.dirname,
    env: {
      VITE_API_URL: "http://127.0.0.1:5190",
      VITE_SOCKET_URL: "http://127.0.0.1:5190",
    },
    url: "http://127.0.0.1:5190",
  },
});
