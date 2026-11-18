import { defineConfig } from "@playwright/test";
import path from "node:path";

export default defineConfig({
  testDir: "../tests",
  testMatch: "ml-sandbox.spec.ts",
  outputDir: "../test-results/ml-sandbox",
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:5186", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 320, height: 900 } } },
  ],
  webServer: [
    {
      command:
        "uv run --no-project --python .venv312 python -m backend.tests.serve_phase3 --port 8774",
      cwd: path.resolve(import.meta.dirname, "../.."),
      env: {
        ALLOWED_ORIGINS: "http://127.0.0.1:5186",
        FRONTEND_URL: "http://127.0.0.1:5186",
      },
      url: "http://127.0.0.1:8774/healthz",
      timeout: 120000,
    },
    {
      command: `${process.platform === "win32" ? "pnpm.cmd" : "pnpm"} dev --host 127.0.0.1 --port 5186 --strictPort`,
      cwd: path.resolve(import.meta.dirname, ".."),
      env: {
        VITE_API_URL: "http://127.0.0.1:8774",
        VITE_SOCKET_URL: "http://127.0.0.1:8774",
      },
      url: "http://127.0.0.1:5186",
      timeout: 120000,
    },
  ],
});
