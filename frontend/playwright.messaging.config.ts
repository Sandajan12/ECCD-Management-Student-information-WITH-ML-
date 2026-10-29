import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const uv =
  process.platform === "win32"
    ? `"${join(tmpdir(), "ames-uv", "uv.exe")}"`
    : "uv";
export default defineConfig({
  testDir: "./tests",
  testMatch: "messaging.spec.ts",
  outputDir: "./test-results/messaging",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5191",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 375, height: 812 } } },
  ],
  webServer: [
    {
      command: `${uv} --cache-dir .cache/uv run --no-project --python .venv312 python -c "import uvicorn; from backend.tests.serve_phase3 import main; uvicorn.run(main.app, host='127.0.0.1', port=8768, lifespan='off', log_level='warning')"`,
      cwd: join(import.meta.dirname, ".."),
      url: "http://127.0.0.1:8768/",
      env: {
        ENVIRONMENT: "development",
        ENABLE_OTP: "false",
        DATABASE_URL: "postgresql://ames_test@127.0.0.1:55432/ames_test",
        JWT_SECRET: "test-only-jwt-key-for-disposable-unit-tests",
        BACKUP_ENCRYPTION_KEY:
          "MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=",
        BACKUP_IV: "unused-test-fixture",
        LRN_ENCRYPTION_KEY:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        LRN_HMAC_SECRET: "test-only-lrn-hmac-for-disposable-unit-tests",
        ALLOWED_ORIGINS: "http://127.0.0.1:5191",
      },
    },
    {
      command: `${process.platform === "win32" ? "corepack.cmd pnpm" : "pnpm"} dev --host 127.0.0.1 --port 5191 --strictPort`,
      cwd: import.meta.dirname,
      url: "http://127.0.0.1:5191/",
      env: {
        VITE_API_URL: "http://127.0.0.1:8768",
        VITE_SOCKET_URL: "http://127.0.0.1:8768",
      },
    },
  ],
});
