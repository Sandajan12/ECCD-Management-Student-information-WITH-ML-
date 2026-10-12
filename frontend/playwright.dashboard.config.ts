import { defineConfig } from "@playwright/test";
import base from "./playwright.eccd.config";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
export default defineConfig({
  ...base,
  outputDir: "./test-results/dashboard",
  testMatch: ["**/dashboard-parity.spec.ts"],
  grep: undefined,
  webServer: [
    {
      command: `${pnpm} exec vite --config tests/legacy-visual/vite.config.mjs`,
      url: "http://localhost:5187/",
      reuseExistingServer: true,
    },
    {
      command: `${pnpm} dev --host localhost`,
      url: "http://localhost:5173/",
      reuseExistingServer: true,
    },
  ],
});
