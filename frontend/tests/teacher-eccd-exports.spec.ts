import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { SessionUser } from "../src/types";

interface ExportState {
  previewError: boolean;
  downloadError: boolean;
  previewReads: string[];
  downloads: string[];
}

async function portal(page: Page): Promise<ExportState> {
  const state: ExportState = {
    previewError: false,
    downloadError: false,
    previewReads: [],
    downloads: [],
  };
  const user: SessionUser = {
    id: 2,
    first_name: "Test",
    last_name: "Teacher",
    full_name: "Test Teacher",
    email: "teacher@example.com",
    role: "admin",
    is_first_login: 0,
    section_id: 1,
    section_name: "Test A",
    allow_eccd_question_management: false,
  };
  await page.addInitScript((account) => {
    const payload = btoa(JSON.stringify({ exp: Date.now() / 1000 + 3600 }));
    localStorage.setItem("user", JSON.stringify(account));
    localStorage.setItem("token", `test.${payload}.test`);
    localStorage.setItem("ames_draft_2_unrelated", "keep my work");
  }, user);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/eccd/card-preview/")) {
      state.previewReads.push(path);
      if (state.previewError) {
        await route.fulfill({
          status: 403,
          json: { detail: "Student is not assigned to your section." },
        });
      } else {
        const studentId = path.split("/").at(-1);
        await route.fulfill({
          json: {
            student_id: Number(studentId),
            html: `<!doctype html><html><body><h1>Card for Student ${studentId}</h1><table><tr><td>Gross Motor</td><td>PRE: 5</td><td>MID: 6</td><td>POST: 7</td></tr><tr><td>Interpretation</td><td>Average</td></tr></table></body></html>`,
          },
        });
      }
    } else if (
      path.includes("/download") ||
      path === "/api/eccd/section/1/export"
    ) {
      state.downloads.push(path);
      if (state.downloadError) {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Section is not assigned to you." }),
        });
      } else {
        await route.fulfill({
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          headers: {
            "content-disposition": 'attachment; filename="server-record.xlsx"',
          },
          body: "synthetic workbook download",
        });
      }
    } else if (path === "/api/eccd/students") {
      await route.fulfill({
        json: [1, 2].map((id) => ({
          student_id: id,
          first_name: `Student ${id}`,
          last_name: "Test",
          masked_lrn: "Pending",
          section_id: 1,
          is_active: true,
        })),
      });
    } else if (path === "/api/eccd/domains-progress") {
      await route.fulfill({ json: [] });
    } else if (path === "/api/sections/") {
      await route.fulfill({
        json: [{ section_id: 1, section_name: "Test A" }],
      });
    } else if (path === "/api/teachers/dashboard-filters") {
      await route.fulfill({ json: { sections: ["Test A"] } });
    } else if (path === "/api/messages/contacts") {
      await route.fulfill({ json: { myId: 2, contacts: [] } });
    } else if (path === "/api/messages/unread-count") {
      await route.fulfill({ json: { unreadCount: 0 } });
    } else await route.fulfill({ json: {} });
  });
  await page.goto("/teacher/eccdassessment");
  await expect(
    page.getByRole("button", { name: "Preview ECCD Card", exact: true }),
  ).toBeEnabled();
  return state;
}

async function chooseStudent(page: Page, student: string) {
  await page.getByRole("combobox", { name: "Select Student" }).click();
  await page.getByRole("option", { name: student }).click();
}

async function expectFitsViewport(page: Page) {
  const dialog = page.getByRole("dialog");
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
}

test("preview selects students, opens inline, and closes without downloading or clearing drafts", async ({
  page,
}) => {
  const state = await portal(page);
  await page
    .getByRole("button", { name: "Preview ECCD Card", exact: true })
    .click();
  await expect(
    page.getByText("Select a student to preview their ECCD Card."),
  ).toBeVisible();
  await chooseStudent(page, "Student 1 Test (Pending)");
  await expect(
    page
      .frameLocator('iframe[title="Official ECCD Card"]')
      .getByRole("heading", { name: "Card for Student 1" }),
  ).toBeVisible();
  await expectFitsViewport(page);
  await chooseStudent(page, "Student 2 Test (Pending)");
  await expect(
    page
      .frameLocator('iframe[title="Official ECCD Card"]')
      .getByRole("heading", { name: "Card for Student 2" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.downloads).toEqual([]);
  expect(state.previewReads).toEqual([
    "/api/eccd/card-preview/1",
    "/api/eccd/card-preview/2",
  ]);
  expect(
    await page.evaluate(() => localStorage.getItem("ames_draft_2_unrelated")),
  ).toBe("keep my work");
});

test("preview exposes access errors and retry recovers", async ({ page }) => {
  const state = await portal(page);
  state.previewError = true;
  await page
    .getByRole("button", { name: "Preview ECCD Card", exact: true })
    .click();
  await chooseStudent(page, "Student 1 Test (Pending)");
  await expect(page.getByRole("alert")).toContainText(
    "Student is not assigned to your section.",
  );
  await expect(page.locator("iframe")).toHaveCount(0);
  state.previewError = false;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(
    page
      .frameLocator('iframe[title="Official ECCD Card"]')
      .getByText("Card for Student 1"),
  ).toBeVisible();
});

test("download selector preserves individual and all-student checklist exports", async ({
  page,
}) => {
  const state = await portal(page);
  for (const [option, path] of [
    ["Student 1 Test (Pending)", "/api/teachers/download/1"],
    ["All Students (ZIP)", "/api/teachers/download-all"],
  ]) {
    await page.getByRole("button", { name: "Download", exact: true }).click();
    await page
      .getByRole("menuitem", { name: "ECCD Records", exact: true })
      .click();
    await expectFitsViewport(page);
    await expect(
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Download", exact: true }),
    ).toBeDisabled();
    await chooseStudent(page, option);
    const download = page.waitForEvent("download");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Download", exact: true })
      .click();
    expect((await download).suggestedFilename()).toBe("server-record.xlsx");
    await expect.poll(() => state.downloads.at(-1)).toBe(path);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});

test("section summary calls only the teacher's section route and reports rejected downloads", async ({
  page,
}) => {
  const state = await portal(page);
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Section Summary Record" }).click();
  expect((await download).suggestedFilename()).toBe("server-record.xlsx");
  expect(state.downloads).toEqual(["/api/eccd/section/1/export"]);
  state.downloadError = true;
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await page.getByRole("menuitem", { name: "Section Summary Record" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Section is not assigned to you." }),
  ).toBeVisible();
});

test("changing students hides previous results while the next preview is pending", async ({
  page,
}) => {
  await portal(page);
  let release: () => void = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/eccd/card-preview/2", async (route) => {
    await blocked;
    await route.fulfill({
      json: { student_id: 2, html: "<h1>Latest student card</h1>" },
    });
  });
  await page
    .getByRole("button", { name: "Preview ECCD Card", exact: true })
    .click();
  await chooseStudent(page, "Student 1 Test (Pending)");
  await expect(page.locator("iframe")).toHaveCount(1);
  await chooseStudent(page, "Student 2 Test (Pending)");
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Loading ECCD Card...");
  release();
  await expect(
    page
      .frameLocator('iframe[title="Official ECCD Card"]')
      .getByRole("heading", { name: "Latest student card" }),
  ).toBeVisible();
});
