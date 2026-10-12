import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// ECCD fixtures mock every API call; this batch does not require a backend.
const pnpm = process.platform === "win32" ? "corepack.cmd pnpm" : "pnpm";
export default defineConfig({
  ...base,
  outputDir: "./test-results/eccd",
  testMatch: ["**/eccd-configuration.spec.ts", "**/chairman-parity.spec.ts"],
  grep: /eccd-configuration\.spec\.ts|eccd-questions|dialog Add (Domain|Question)/,
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
