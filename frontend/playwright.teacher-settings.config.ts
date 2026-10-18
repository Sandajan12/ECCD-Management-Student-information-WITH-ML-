import { defineConfig } from "@playwright/test";
import teacherPortal from "./playwright.teacher-portal.config";

export default defineConfig({
  ...teacherPortal,
  grep: /home-based settings|six granular switches|access HTTP 403/,
  outputDir: "./test-results/teacher-settings",
  reporter: [
    ["list"],
    ["json", { outputFile: "./test-results/teacher-settings-report.json" }],
    [
      "html",
      { outputFolder: "./test-results/teacher-settings-report", open: "never" },
    ],
  ],
});
