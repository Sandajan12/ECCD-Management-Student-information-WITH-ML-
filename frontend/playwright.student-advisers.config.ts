import { defineConfig } from "@playwright/test";
import base from "./playwright.parent-assessment-access.config";

export default defineConfig({
  ...base,
  testMatch: "student-advisers.spec.ts",
  outputDir: "./test-results/student-advisers",
});
