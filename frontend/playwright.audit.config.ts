import { defineConfig } from "@playwright/test";
import path from "node:path";

export default defineConfig({
  testDir: "./tests",
  testMatch: "audit-logs.spec.ts",
  outputDir: "./test-results/audit-logs",
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:5185", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "tablet", use: { viewport: { width: 768, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 320, height: 900 } } },
  ],
  webServer: [
    {
      command:
        "uv run --no-project --python .venv312 python -m backend.tests.serve_phase3 --port 8773",
      cwd: path.resolve(import.meta.dirname, ".."),
      env: {
        ALLOWED_ORIGINS: "http://127.0.0.1:5185",
        FRONTEND_URL: "http://127.0.0.1:5185",
      },
      url: "http://127.0.0.1:8773/healthz",
      timeout: 120000,
    },
    {
      command: "pnpm.cmd dev --host 127.0.0.1 --port 5185 --strictPort",
      cwd: import.meta.dirname,
      env: {
        VITE_API_URL: "http://127.0.0.1:8773",
        VITE_SOCKET_URL: "http://127.0.0.1:8773",
      },
      url: "http://127.0.0.1:5185",
      timeout: 120000,
    },
  ],
});
