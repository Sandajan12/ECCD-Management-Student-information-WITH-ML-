import { defineConfig } from "@playwright/test";
import parentAccess from "./playwright.parent-assessment-access.config";

export default defineConfig({
  ...parentAccess,
  testMatch: "eccd-marks.spec.ts",
  timeout: 120000,
  outputDir: "./test-results/eccd-marks",
});
