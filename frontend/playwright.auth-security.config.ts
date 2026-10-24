import { defineConfig } from "@playwright/test";
import path from "node:path";

const windows = process.platform === "win32";
export default defineConfig({
  testDir: "./tests",
  testMatch: ["auth-security.spec.ts", "terms-privacy.spec.ts"],
  outputDir: "./test-results/auth-security",
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:5188" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 320, height: 700 } } },
  ],
  webServer: [
    {
      command: `uv run --no-project --python ${windows ? ".venv312" : "3.12"} python -m backend.tests.serve_auth_security --port 8775`,
      cwd: path.resolve(import.meta.dirname, ".."),
      env: {
        ENVIRONMENT: "development",
        ENV: "development",
        ALLOWED_ORIGINS: "http://127.0.0.1:5188",
        FRONTEND_URL: "http://127.0.0.1:5188",
      },
      url: "http://127.0.0.1:8775/healthz",
      timeout: 120000,
    },
    {
      command: `${windows ? "pnpm.cmd" : "pnpm"} dev --host 127.0.0.1 --port 5188 --strictPort`,
      cwd: import.meta.dirname,
      env: {
        VITE_API_URL: "http://127.0.0.1:8775",
        VITE_SOCKET_URL: "http://127.0.0.1:8775",
      },
      url: "http://127.0.0.1:5188",
      timeout: 120000,
    },
  ],
});
