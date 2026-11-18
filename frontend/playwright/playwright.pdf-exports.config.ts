import { defineConfig } from "@playwright/test";
import path from "node:path";

export default defineConfig({
  testDir: "../tests",
  testMatch: "pdf-exports.spec.ts",
  outputDir: "../test-results/pdf-exports",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:5195",
    browserName: "chromium",
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "uv run --no-project --python .venv312 python -m backend.tests.serve_pdf_exports",
      cwd: path.resolve(import.meta.dirname, "../.."),
      env: {
        ENV: "development",
        DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
        JWT_SECRET: "pdf-export-disposable-test-secret-only",
        ALLOWED_ORIGINS: "http://127.0.0.1:5195",
      },
      url: "http://127.0.0.1:8776/healthz",
      timeout: 60000,
    },
    {
      command: `${process.platform === "win32" ? "pnpm.cmd" : "pnpm"} dev --host 127.0.0.1 --port 5195 --strictPort`,
      cwd: path.resolve(import.meta.dirname, ".."),
      env: {
        VITE_API_URL: "http://127.0.0.1:8776",
        VITE_SOCKET_URL: "http://127.0.0.1:8776",
      },
      url: "http://127.0.0.1:5195",
      timeout: 60000,
    },
  ],
});
