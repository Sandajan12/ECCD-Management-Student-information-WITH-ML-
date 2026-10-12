import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { calculateDecimalAge, calculateRosterAge, getSchoolYearBaseline } from "../src/utils/dateUtils";

const sections = [
  { section_id: 1, section_name: "Section A", first_name: "Example", last_name: "Teacher" },
  { section_id: 2, section_name: "Section B", first_name: null, last_name: null },
  { section_id: 3, section_name: "Empty Section", first_name: null, last_name: null },
];
const students = [1, 2, 3].map(id => ({
  student_id: id, masked_lrn: `********123${id}`, lrn: `********123${id}`,
  lrn_last4: `123${id}`, first_name: "Example", last_name: `Student ${id}`, middle_name: null,
  full_name: `Example Student ${id}`, section_id: id === 1 ? 1 : 2,
  section_name: id === 1 ? "Section A" : "Section B", class_name: id === 1 ? "Section A" : "Section B",
  school_year: id === 1 ? "2025-2026" : "2026-2027", is_active: true,
  date_of_birth: "2020-01-01", decimal_age: 999, gender: "Male", parents: [],
}));
const logs = [
  { log_id: 1, teacher_name: "Example Teacher", action_type: "Student Transfer", details: "secret details needle", timestamp: "2026-08-01T09:30:00Z" },
  { id: 2, performed_by: "School Administrator", action: "Export Records", details: null, timestamp: null },
];
async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("user", JSON.stringify({id: 1, username: "Example", role: "super-admin", is_first_login: 0}));
    localStorage.setItem("token", `reference.${btoa(JSON.stringify({exp: Math.floor(Date.now()/1000)+3600}))}.reference`);
  });
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({json: path === "/api/settings" ? {
      system_title: "AMES", school_name: "Example School", primary_color: "#2563eb", secondary_color: "#111827",
      current_school_year: "2026-2027", school_year_start_month: 8,
    } : path === "/api/chairman/students" ? students
      : path === "/api/chairman/sections" ? sections
      : path === "/api/analytics/logs" || path === "/api/logs" ? logs
      : path.startsWith("/api/students/") ? students.find(s => s.student_id === Number(path.split("/").at(-1))) : []});
  });
}
async function choice(page: Page, label: string, name: string) {
  await page.getByRole("combobox", {name: label, exact: true}).click();
  await page.getByRole("option", {name, exact: true}).click();
}
test("records-parity roster filters and selection retain legacy semantics", async ({page}) => {
  await prepare(page); await page.goto("/super-admin/students");
  await expect(page.getByRole("row")).toHaveCount(4);
  await page.getByRole("checkbox", {name: "Select Example Student 1"}).check();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await choice(page, "Section", "Section B");
  await expect(page.getByRole("button", {name: "Transfer Selected (1)"})).toBeEnabled();
  await page.getByRole("checkbox", {name: "Select all visible students"}).check();
  await expect(page.getByRole("button", {name: "Transfer Selected (2)"})).toBeEnabled();
  await choice(page, "School year", "2025-2026");
  await expect(page.getByText("No student records found.")).toBeVisible();
  await expect(page.getByRole("button", {name: "Transfer Selected (2)"})).toBeEnabled();
  await choice(page, "Section", "All Sections");
  await choice(page, "School year", "All School Years");
  await page.getByRole("combobox", {name: "Section", exact: true}).click();
  await expect(page.getByRole("option", {name: "Empty Section"})).toHaveCount(0);
});
test("records-parity export ignores roster year and uses encoded section with server filename", async ({page}) => {
  await prepare(page);
  const requests: string[] = [];
  await page.route("**/api/chairman/export-eccd?**", async route => {
    requests.push(route.request().url());
    await route.fulfill({body: "synthetic workbook", contentType: "application/octet-stream", headers: {"Content-Disposition": 'attachment; filename="SERVER_RECORDS.xlsx"', "Access-Control-Expose-Headers": "Content-Disposition"}});
  });
  await page.goto("/super-admin/students");
  await choice(page, "School year", "2025-2026");
  await page.getByRole("button", {name: "Download ECCD Records"}).click();
  await choice(page, "Download section", "Section B");
  const download = page.waitForEvent("download");
  await page.getByRole("button", {name: "Download", exact: true}).click();
  expect((await download).suggestedFilename()).toBe("SERVER_RECORDS.xlsx");
  expect(requests).toHaveLength(1);
  expect([...new URL(requests[0]).searchParams]).toEqual([["section", "Section B"]]);
  await expect(page.getByRole("alert")).toHaveText("Successfully downloaded SERVER_RECORDS.xlsx");
  await expect(page.getByRole("alert")).toHaveCount(0, {timeout: 6000});
});
test("records-parity all-section fallback filename and error feedback preserve export choice", async ({page}) => {
  await prepare(page); let fail = true;
  await page.route("**/api/chairman/export-eccd?**", route => fail
    ? route.fulfill({status: 500, json: {message: "Export failed"}})
    : route.fulfill({body: "synthetic zip", contentType: "application/zip"}));
  await page.goto("/super-admin/students");
  await page.getByRole("button", {name: "Download ECCD Records"}).click();
  await page.getByRole("button", {name: "Download", exact: true}).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", {name: "Close notification"}).click();
  fail = false;
  const download = page.waitForEvent("download");
  await page.getByRole("button", {name: "Download", exact: true}).click();
  const year = new Date().getFullYear();
  expect((await download).suggestedFilename()).toBe(`ALL_SECTIONS_${year}-${year+1}.zip`);
});
test("records-parity transfer locks once and preserves rejected scoped draft across reload", async ({page}) => {
  await prepare(page); const payloads: unknown[] = []; let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => {release = resolve;});
  await page.route("**/api/chairman/students/transfer", async route => {
    payloads.push(route.request().postDataJSON()); await gate;
    await route.fulfill({status: 403, json: {detail: "Transfer rejected"}});
  });
  await page.goto("/super-admin/students");
  await page.getByRole("checkbox", {name: "Select Example Student 1"}).check();
  await page.getByRole("button", {name: "Transfer Selected (1)"}).click();
  await choice(page, "Destination Section", "Section B (No Adviser)");
  await page.getByRole("button", {name: "Confirm Transfer"}).evaluate(button => {if (button instanceof HTMLButtonElement) {button.click();button.click();}});
  await expect.poll(() => payloads.length).toBe(1);
  await expect(page.getByRole("button", {name: "Transferring..."})).toBeDisabled();
  await expect(page.getByRole("combobox", {name: "Destination Section"})).toBeDisabled();
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toBeVisible();
  release?.(); await expect(page.getByRole("alert")).toContainText("Transfer rejected");
  expect(payloads).toEqual([{student_ids: [1], new_section_id: 2}]);
  await page.reload();
  await page.getByRole("checkbox", {name: "Select Example Student 1"}).check();
  await page.getByRole("button", {name: "Transfer Selected (1)"}).click();
  await expect(page.getByRole("combobox", {name: "Destination Section"})).toHaveText("Section B (No Adviser)");
});
test("records-parity transfer confirmation evicts only confirmed draft and refreshes roster", async ({page}) => {
  await prepare(page);
  await page.route("**/api/chairman/students/transfer", route => route.fulfill({json: {message: "Transferred", transferred_count: 1}}));
  await page.goto("/super-admin/students");
  await page.evaluate(() => localStorage.setItem("unrelated_draft", "keep"));
  await page.getByRole("checkbox", {name: "Select Example Student 1"}).check();
  await page.getByRole("button", {name: "Transfer Selected (1)"}).click();
  await choice(page, "Destination Section", "Section B (No Adviser)");
  await page.getByRole("button", {name: "Confirm Transfer"}).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", {name: "Transfer Selected", exact: true})).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem("ames_draft_1_student_transfer_1"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("unrelated_draft"))).toBe("keep");
  await expect(page.getByRole("alert")).toHaveText("Students transferred successfully!");
});
test("records-parity audit maps both contracts and searches only name or action", async ({page}) => {
  await prepare(page); await page.goto("/super-admin/audit");
  await expect(page.getByRole("row")).toHaveCount(3);
  const search = page.getByRole("textbox", {name: "Search audit log"});
  for (const term of ["secret details needle", "2026", "Teacher Student"]) {
    await search.fill(term); await expect(page.getByText("No audit logs found matching your search.")).toBeVisible();
  }
  await search.fill("tRaNsFeR"); await expect(page.getByRole("row")).toHaveCount(2);
  await page.getByRole("row").nth(1).click();
  await expect(page.getByRole("dialog")).toContainText("secret details needle");
  await page.getByRole("button", {name: "Close", exact: true}).click();
  await search.fill("administrator"); await expect(page.getByRole("row")).toContainText(["Timestamp", "Export Records"]);
});
test("records-parity transfer dialog matches original JSX", async ({page, context}, info) => {
  const reference = await context.newPage();
  await prepare(page); await prepare(reference);
  await Promise.all([page.goto("/super-admin/students"), reference.goto("http://localhost:5187/chairman/students?role=super-admin")]);
  await page.getByRole("checkbox", {name: "Select Example Student 1"}).check();
  await reference.getByRole("checkbox").nth(1).check();
  for (const target of [page, reference]) {
    await target.getByRole("button", {name: "Transfer Selected (1)"}).click();
    await expect(target.getByRole("dialog")).toBeVisible();
    await target.mouse.move(0, 0);
    await target.evaluate(async () => {
      await document.fonts.ready;
      await Promise.allSettled(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished));
    });
  }
  const baseline = info.snapshotPath("transfer-dialog.png");
  await mkdir(dirname(baseline), {recursive: true});
  await writeFile(baseline, await reference.getByRole("dialog").screenshot());
  await expect(page.getByRole("dialog")).toHaveScreenshot("transfer-dialog.png", {maxDiffPixels: 0, threshold: .1, scale: "device"});
  await reference.close();
});
test("records-parity age helpers match legacy month fractions and school baseline", () => {
  expect(getSchoolYearBaseline("2026-2027", 13).getMonth()).toBe(7);
  expect(calculateRosterAge("2020-01-01", "2026-2027", 8)).toBe("6.6 yrs");
  expect(calculateRosterAge("2020-01-02", "2026-2027", 8)).toBe("6.5 yrs");
  expect(calculateRosterAge("invalid", "2026-2027")).toBe("N/A");
  expect(calculateRosterAge(null, "2026-2027")).toBe("N/A");
  expect(calculateDecimalAge("2020-01-01", "2026-2027")).toBe(6.6);
  expect(calculateDecimalAge("2020-01-01", "invalid")).toBe("");
});
test("records-parity layouts contain tables and dialogs across responsive boundaries", async ({page}) => {
  test.setTimeout(90000);
  await prepare(page);
  for (const width of [320,390,599,600,899,900,1200,1280]) {
    await page.setViewportSize({width,height:900});
    for (const path of ["students", "audit"]) {
      await page.goto(`/super-admin/${path}`);
      await expect(page.getByRole("row").nth(1)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole("row").nth(1).click();
      const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox(); expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0)+(box?.width ?? 0)).toBeLessThanOrEqual(width);
      await page.keyboard.press("Escape");
    }
  }
});
