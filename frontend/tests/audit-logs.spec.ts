import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { SessionResponse } from "../src/types";
import { readFile } from "node:fs/promises";

const backend = "http://127.0.0.1:8773";
const errors: string[] = [];
async function filterRole(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Role filter" }).click();
  await page.getByRole("option", { name, exact: true }).click();
}
async function filterAction(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Action filter" }).click();
  await page.getByRole("option", { name, exact: true }).click();
}
test.beforeEach(async ({ page, request }) => {
  errors.length = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  expect((await request.post(`${backend}/__test/reset`)).ok()).toBeTruthy();
  const login = await request.post(`${backend}/api/auth/login`, {
    data: { username: "chairman", password: "Example123" },
  });
  expect(login.ok()).toBeTruthy();
  const session = (await login.json()) as SessionResponse;
  await page.goto("/login");
  await page.evaluate((value) => {
    localStorage.setItem("user", JSON.stringify(value.user));
    localStorage.setItem("token", value.token);
  }, session);
});
test.afterEach(() => expect(errors).toEqual([]));

test("real Teacher Accounts handover resolves names and supports combined actor and search filters", async ({
  page,
  request,
}, info) => {
  for (const [username, address] of [
    ["adviser", "Teacher audit update"],
    ["parent", "Parent audit update"],
  ]) {
    const login = await request.post(`${backend}/api/auth/login`, {
      data: { username, password: "Example123" },
    });
    const session = (await login.json()) as SessionResponse;
    const saved = await request.put(`${backend}/api/students/1`, {
      headers: { Authorization: `Bearer ${session.token}` },
      data: { address },
    });
    expect(saved.ok()).toBeTruthy();
  }
  await page.goto("/super-admin/teachers");
  await page.getByRole("button", { name: "Add New Teacher" }).click();
  await page.getByLabel("First Name", { exact: true }).fill("Incoming");
  await page.getByLabel("Last Name (optional)").fill("Adviser");
  await page.getByLabel("Email", { exact: true }).fill("incoming@example.com");
  await page.getByLabel("Password", { exact: true }).fill("temporary");
  await page.getByRole("combobox", { name: "Class Name / Section" }).click();
  await page.getByRole("option", { name: "Test A", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Confirm Section Handover" })
    .getByRole("button", { name: "Confirm Handover" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "New Teacher", exact: true }),
  ).toHaveCount(0);
  await page.goto("/super-admin/audit");
  const table = page.getByRole("table", { name: "System audit logs" });
  await expect(table.getByRole("columnheader")).toHaveText([
    "Timestamp",
    "Actor",
    "Action",
    "Summary",
    "Details",
  ]);
  expect(
    await table.locator("thead tr").evaluate((row: HTMLTableRowElement) => {
      const first = row.cells[0];
      const range = document.createRange();
      range.selectNodeContents(first);
      return (
        range.getBoundingClientRect().right <
        row.cells[1].getBoundingClientRect().left +
          Number.parseFloat(getComputedStyle(row.cells[1]).paddingLeft)
      );
    }),
  ).toBeTruthy();
  const handover = table
    .getByRole("row")
    .filter({ hasText: "Section Reassignment" });
  await expect(handover).toContainText(
    'Assigned Teacher "Incoming Adviser" to Section "Test A"',
  );
  await expect(handover).not.toContainText("SECTION_HANDOVER_REASSIGNMENT");
  await expect(
    handover.getByText("Section Reassignment", { exact: true }),
  ).toHaveCSS("background-color", "oklch(0.962 0.018 272.314)");
  await expect(handover.locator("time")).toContainText("•");
  await handover.getByRole("button", { name: /View/ }).click();
  const dialog = page.getByRole("dialog", { name: "Audit Action Details" });
  await expect(dialog.locator("strong")).toHaveText([
    "Incoming Adviser",
    "Test A",
  ]);
  await expect(
    dialog.getByText("Section Reassignment", { exact: true }),
  ).toBeVisible();
  await dialog.screenshot({ path: info.outputPath("details.png") });
  await page.keyboard.press("Escape");
  const search = page.getByRole("textbox", { name: "Search audit log" });
  for (const query of [
    "Test A",
    "Incoming Adviser",
    "section reassignment",
    "SECTION_HANDOVER_REASSIGNMENT",
    "chairman@example.com",
  ]) {
    await search.fill(query);
    await expect(handover).toHaveCount(1);
  }
  await search.fill("");
  await filterRole(page, "Teachers");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table.locator("tbody")).toContainText("Test Adviser");
  await filterRole(page, "Parents");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table.locator("tbody")).toContainText("Test Parent");
  await search.fill("Incoming Adviser");
  await expect(table).toContainText("No audit logs found");
  await filterRole(page, "Super Admin");
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await filterRole(page, "All Actors");
  await search.fill("");
  await expect(table.locator("tbody tr")).toHaveCount(4);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page
    .getByRole("region", { name: "Audit log table" })
    .evaluate((region) => {
      region.scrollLeft = 0;
    });
  await page.screenshot({
    path: info.outputPath("audit-table.png"),
    fullPage: true,
  });
});

test("badge dictionary, fallback, safe name highlighting and historical payloads", async ({
  page,
}) => {
  const actions = [
    "TEACHER_ARCHIVED",
    "TEACHER_CREATED",
    "TEACHER_RESTORED",
    "PARENT_ASSESSMENT_SUBMITTED",
    "CUSTOM_ACTION_NAME",
  ];
  await page.route("**/api/analytics/logs", (route) =>
    route.fulfill({
      json: actions.map((action, index) => ({
        log_id: index + 1,
        action_type: action,
        teacher_name: "Historical Actor",
        role: "Chairman",
        timestamp: "2026-10-23T13:55:00Z",
        details:
          'Updated Student "Ana (A.+)" in Section "<img src=x onerror=alert(1)>".',
        metadata: { studentName: "Ana (A.+)" },
      })),
    }),
  );
  await page.goto("/super-admin/audit");
  const table = page.getByRole("table", { name: "System audit logs" });
  await expect(table.getByText("Teacher Account", { exact: true })).toHaveCount(
    2,
  );
  await expect(table.getByText("Teacher Archived", { exact: true })).toHaveCSS(
    "background-color",
    "oklch(0.987 0.022 95.277)",
  );
  await expect(
    table.getByText("Assessment Submitted", { exact: true }),
  ).toHaveCSS("background-color", "oklch(0.97 0.014 254.604)");
  await expect(
    table.getByText("Custom Action Name", { exact: true }),
  ).toBeVisible();
  await table.getByRole("button", { name: /View Custom Action Name/ }).click();
  const dialog = page.getByRole("dialog", { name: "Audit Action Details" });
  await expect(dialog.locator("strong")).toHaveText([
    "Ana (A.+)",
    "<img src=x onerror=alert(1)>",
  ]);
  await expect(dialog.locator("img")).toHaveCount(0);
  await expect(dialog.getByText("Super Admin", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("two-line summaries, compact actors, combined action filters, pagination and filtered CSV export", async ({
  page,
}, info) => {
  const studentActions = [
    "Added New Student",
    "Updated Student Info",
    "Archived Student",
    "Student Restored",
    "Deleted Student",
    "TRANSFER_STUDENTS",
    "STUDENT_EVALUATION_SAVED",
    "Mass Archived Students",
    "Approved Parent Link",
    "Rejected Parent Link",
    "Unlinked Parent",
  ];
  const logs = Array.from({ length: 15 }, (_, index) => ({
    id: index + 1,
    action: studentActions[index % studentActions.length],
    actor_name: index === 0 ? '=HYPERLINK("example")' : "Teacher Example",
    actor_email: "teacher@example.com",
    role: "admin",
    timestamp: "2026-10-23T13:55:00Z",
    details: `Updated Student "Learner ${String(index + 1).padStart(2, "0")}", preserving enrollment records, evaluations and family information.\nThe full audit summary remains available in the details dialog and exported file.`,
  }));
  const otherActions = [
    ["PARENT_ASSESSMENT_SUBMITTED", "user"],
    ["UPDATE_SYSTEM_SETTINGS", "super-admin"],
    ["BACKUP_EXPORT", "super-admin"],
    ["REVERT_SCHOOL_YEAR", "super-admin"],
    ["PARENT_ASSESSMENT_ACCESS", "admin"],
    ["TEACHER_CREATED", "super-admin"],
    ["TEACHER_ARCHIVED", "super-admin"],
    ["UPDATE_TEACHER_PERMISSION", "super-admin"],
    ["SECTION_HANDOVER_REASSIGNMENT", "super-admin"],
    ["SECTION_HANDOVER_REASSIGNMENT", "super-admin"],
    ["CUSTOM_ACTION_NAME", "super-admin"],
  ];
  logs.push(
    ...otherActions.map(([action, role], index) => ({
      id: index + 16,
      action,
      role,
      actor_name: role === "user" ? "Parent Example" : "Super Admin Example",
      actor_email:
        role === "user" ? "parent@example.com" : "chairman@example.com",
      timestamp: "2026-10-23T13:55:00Z",
      details: `Recorded ${action}.`,
    })),
  );
  await page.route("**/api/analytics/logs", (route) =>
    route.fulfill({ json: logs }),
  );
  await page.goto("/super-admin/audit");
  const table = page.getByRole("table", { name: "System audit logs" });
  const footer = page.getByRole("navigation", { name: "Audit log pagination" });
  const search = page.getByRole("textbox", { name: "Search audit log" });
  const downloadButton = page.getByRole("button", { name: "Export CSV" });
  await expect(table.locator("tbody tr")).toHaveCount(10);
  await expect(footer).toContainText("Showing 1 to 10 of 26 logs");
  await expect(footer.getByRole("button", { name: "Previous" })).toBeDisabled();
  await expect(footer).toContainText("Page 1 of 3");

  const layout = await table
    .locator("tbody tr")
    .first()
    .evaluate((row) => {
      const summary = row.cells[3].querySelector("p")!;
      const actor = row.cells[1].firstElementChild!;
      const name = actor.children[0].getBoundingClientRect();
      const role = actor.children[1].getBoundingClientRect();
      const style = getComputedStyle(summary);
      return {
        summaryWidth: summary.clientWidth,
        summaryHeight: summary.clientHeight,
        lineHeight: Number.parseFloat(style.lineHeight),
        lineClamp: style.webkitLineClamp,
        inlineRole:
          Math.abs(name.top + name.height / 2 - role.top - role.height / 2) < 1,
        rowHeight: row.getBoundingClientRect().height,
      };
    });
  expect(layout.summaryWidth).toBeGreaterThanOrEqual(320);
  expect(layout.lineClamp).toBe("2");
  expect(Math.abs(layout.summaryHeight - layout.lineHeight * 2)).toBeLessThan(
    1,
  );
  expect(layout.inlineRole).toBeTruthy();
  expect(layout.rowHeight).toBeLessThan(110);
  const view = table
    .locator("tbody tr")
    .first()
    .getByRole("button", { name: /View/ });
  await expect(view.locator("svg")).toBeVisible();
  await expect(view).toHaveCSS("border-top-style", "solid");
  await expect(view).toHaveCSS("background-color", "rgb(255, 255, 255)");

  await footer.getByRole("button", { name: "Next" }).click();
  await expect(footer).toContainText("Showing 11 to 20 of 26 logs");
  await footer.getByRole("button", { name: "Next" }).click();
  await expect(footer).toContainText("Showing 21 to 26 of 26 logs");
  await expect(table.locator("tbody tr")).toHaveCount(6);
  await expect(footer.getByRole("button", { name: "Next" })).toBeDisabled();
  await footer.getByRole("button", { name: "Previous" }).click();
  await expect(footer).toContainText("Page 2 of 3");
  await search.fill("CUSTOM_ACTION_NAME");
  await expect(footer).toContainText("Showing 1 to 1 of 1 logs");
  await expect(footer).toContainText("Page 1 of 1");
  await search.fill("");

  for (const [category, total] of [
    ["Section Reassignments", 2],
    ["Teacher Management", 3],
    ["System Settings", 4],
    ["Student Records", 16],
  ] as const) {
    await filterAction(page, category);
    await expect(footer).toContainText(`of ${total} logs`);
  }
  await footer.getByRole("button", { name: "Next" }).click();
  await expect(footer).toContainText("Showing 11 to 16 of 16 logs");
  await filterRole(page, "Teachers");
  await expect(footer).toContainText("Showing 1 to 10 of 15 logs");
  await footer.getByRole("button", { name: "Next" }).click();
  await expect(footer).toContainText("Showing 11 to 15 of 15 logs");

  const downloadEvent = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(
    /^audit-logs-\d{4}-\d{2}-\d{2}\.csv$/,
  );
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain(
    '"Timestamp","Actor","Email","Role","Action","Summary"',
  );
  expect(csv).toContain('"\'=HYPERLINK(""example"")"');
  expect(csv).toContain('Updated Student ""Learner 01"", preserving');
  expect(csv).toContain("information.\nThe full audit summary");
  expect(csv).toContain("Learner 15");
  expect(csv.match(/"teacher@example.com"/g)).toHaveLength(15);
  expect(csv).not.toContain("parent@example.com");
  expect(csv).not.toContain("BACKUP_EXPORT");

  await search.fill("Learner 02");
  await expect(footer).toContainText("Showing 1 to 1 of 1 logs");
  const singleEvent = page.waitForEvent("download");
  await downloadButton.click();
  const singleCsv = await readFile((await (await singleEvent).path())!, "utf8");
  expect(singleCsv).toContain("Learner 02");
  expect(singleCsv).not.toContain("Learner 01");
  await filterRole(page, "Parents");
  await expect(footer).toContainText("Showing 0 to 0 of 0 logs");
  await expect(downloadButton).toBeDisabled();
  await expect(footer.getByRole("button", { name: "Previous" })).toBeDisabled();
  await expect(footer.getByRole("button", { name: "Next" })).toBeDisabled();
  await search.fill("");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table.locator("tbody")).toContainText("Assessment Submitted");
  await filterRole(page, "All Actors");
  await filterAction(page, "All Actions");
  if (info.project.name === "desktop") {
    const region = page.getByRole("region", { name: "Audit log table" });
    expect(
      await region.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBeTruthy();
  }
  await page
    .getByRole("region", { name: "Audit log table" })
    .evaluate((region) => {
      region.scrollLeft = 0;
    });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: info.outputPath("audit-controls-and-pagination.png"),
    fullPage: true,
  });
});
