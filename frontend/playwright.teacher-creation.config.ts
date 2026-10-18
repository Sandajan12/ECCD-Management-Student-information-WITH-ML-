import { defineConfig } from "@playwright/test";
import base from "./playwright.parent-assessment-access.config";

// Reuse the disposable PostgreSQL API, never the configured school's schema.
export default defineConfig({
  ...base,
  testMatch: ["teacher-creation.spec.ts", "teacher-management.spec.ts"],
  // The legacy screenshot comparison requires its separate visual harness.
  grepInvert: /switch matches the legacy/,
  outputDir: "./test-results/teacher-creation",
});
