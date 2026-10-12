import { defineConfig } from "@playwright/test";
import base from "./playwright.eccd.config";

export default defineConfig({
  ...base,
  outputDir: "./test-results/teachers",
  testMatch: ["**/teacher-management.spec.ts", "**/chairman-parity.spec.ts"],
  grep: /teacher-management\.spec\.ts|Chairman teachers|dialog (New Teacher|Edit Teacher|Create New Section)|teacher form retains/,
});
