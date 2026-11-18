import { defineConfig } from "@playwright/test";
import path from "node:path";

export default defineConfig({
  testDir: "../tests",
  testMatch: "parent-ml.spec.ts",
  outputDir: "../test-results/parent-ml",
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:5183", trace: "retain-on-failure" },
  projects: [{ name: "desktop" }, { name: "mobile" }],
  webServer: [
    {
      command: "uv run --no-project --python .venv312 python -m backend.tests.serve_phase3 --port 8771",
      cwd: path.resolve(import.meta.dirname, "../.."),
      env: { ALLOWED_ORIGINS: "http://127.0.0.1:5183", FRONTEND_URL: "http://127.0.0.1:5183" },
      url: "http://127.0.0.1:8771/healthz",
      timeout: 120000,
    },
    {
      command: "pnpm.cmd dev --host 127.0.0.1 --port 5183 --strictPort",
      cwd: path.resolve(import.meta.dirname, ".."),
      env: { VITE_API_URL: "http://127.0.0.1:8771", VITE_SOCKET_URL: "http://127.0.0.1:8771" },
      url: "http://127.0.0.1:5183",
      timeout: 120000,
    },
  ],
});
