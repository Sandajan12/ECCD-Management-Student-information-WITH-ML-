import { defineConfig } from "@playwright/test";
import path from "node:path";

export default defineConfig({
  testDir: "../tests",
  testMatch: "terms-privacy.spec.ts",
  outputDir: "../test-results/terms-privacy",
  workers: 1,
  timeout: 45000,
  use: { baseURL: "http://127.0.0.1:5188", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "tablet", use: { viewport: { width: 768, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 320, height: 700 } } },
  ],
  webServer: [
    {
      command:
        "uv run --no-project --python .venv312 python -m backend.tests.serve_phase3 --port 8775",
      cwd: path.resolve(import.meta.dirname, "../.."),
      env: {
        ALLOWED_ORIGINS: "http://127.0.0.1:5188",
        FRONTEND_URL: "http://127.0.0.1:5188",
      },
      url: "http://127.0.0.1:8775/healthz",
      timeout: 120000,
    },
    {
      command: "pnpm.cmd dev --host 127.0.0.1 --port 5188 --strictPort",
      cwd: path.resolve(import.meta.dirname, ".."),
      env: {
        VITE_API_URL: "http://127.0.0.1:8775",
        VITE_SOCKET_URL: "http://127.0.0.1:8775",
      },
      url: "http://127.0.0.1:5188",
      timeout: 120000,
    },
  ],
});
