import { defineConfig } from "@playwright/test";
import base from "./playwright.dashboard.config";
export default defineConfig({
  ...base,
  outputDir: "./test-results/records",
  testMatch: ["**/records-parity.spec.ts", "**/chairman-parity.spec.ts"],
  grep: /records-parity|Chairman students|Chairman audit|dialog (Student Record Details|Download ECCD Records|Audit Action Details)/,
});
