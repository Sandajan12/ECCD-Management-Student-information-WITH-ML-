import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { SessionUser } from "../src/types";

interface ExportState {
  previewError: boolean;
  downloadError: boolean;
  downloadErrorMessage: string;
  previewReads: string[];
  downloads: string[];
}

async function portal(
  page: Page,
  studentIds: number[] = [1, 2],
): Promise<ExportState> {
  const state: ExportState = {
    previewError: false,
    downloadError: false,
    downloadErrorMessage: "Section is not assigned to you.",
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
    if (window !== window.top) return;
    const payload = btoa(JSON.stringify({ exp: Date.now() / 1000 + 3600 }));
    localStorage.setItem("user", JSON.stringify(account));
    localStorage.setItem("token", `test.${payload}.test`);
    localStorage.setItem("ames_draft_2_unrelated", "keep my work");
  }, user);
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
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
      path.startsWith("/api/eccd/export/") ||
      path === "/api/eccd/section/1/export"
    ) {
      state.downloads.push(path + url.search);
      if (state.downloadError) {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ detail: state.downloadErrorMessage }),
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
        json: studentIds.map((id) => ({
          student_id: id,
          first_name: `Student ${id}`,
          last_name: "Test",
          masked_lrn: "Pending",
          section_id: 1,
          school_year: "2026-2027",
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
      await route.fulfill({
        json: {
          sections: ["Test A"],
          schoolYears: ["2026-2027", "2025-2026", "2024-2025"],
          currentSchoolYear: "2026-2027",
        },
      });
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
  const selector = page.getByRole("combobox", { name: "Select Student" });
  if (await selector.evaluate((element) => element.tagName === "SELECT")) {
    await selector.selectOption({ label: student });
  } else {
    await selector.click();
    await page.getByRole("option", { name: student }).click();
  }
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

test("header student navigation respects roster boundaries and stays within the viewport", async ({
  page,
}, testInfo) => {
  const state = await portal(page, [1, 2, 3]);
  await page
    .getByRole("button", { name: "Preview ECCD Card", exact: true })
    .click();
  const header = page.getByRole("dialog").locator("header");
  const previous = header.getByRole("button", { name: "Previous Student" });
  const next = header.getByRole("button", { name: "Next Student" });
  const selector = header.getByRole("combobox", { name: "Select Student" });
  await expect(previous).toBeDisabled();
  await expect(next).toBeDisabled();
  await expect(selector).toHaveValue("");
  await expect(
    page.getByText("This card shows saved records.", { exact: false }),
  ).toHaveCount(0);

  await chooseStudent(page, "Student 1 Test (Pending)");
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  await next.click();
  await expect(selector).toHaveValue("2");
  await expect(previous).toBeEnabled();
  await expect(next).toBeEnabled();
  await expect(
    page
      .frameLocator('iframe[title="Official ECCD Card"]')
      .getByRole("heading"),
  ).toHaveText("Card for Student 2");
  await next.click();
  await expect(selector).toHaveValue("3");
  await expect(next).toBeDisabled();
  await expect(
    page
      .frameLocator('iframe[title="Official ECCD Card"]')
      .getByRole("heading"),
  ).toHaveText("Card for Student 3");
  await previous.click();
  await expect(selector).toHaveValue("2");
  await previous.click();
  await expect(selector).toHaveValue("1");
  await expect(previous).toBeDisabled();
  await expect(
    page
      .frameLocator('iframe[title="Official ECCD Card"]')
      .getByRole("heading"),
  ).toHaveText("Card for Student 1");
  await expectFitsViewport(page);
  const geometry = await header.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const controls = [...element.querySelectorAll("button, select")].map(
      (control) => {
        const rect = control.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
        };
      },
    );
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      controls,
    };
  });
  for (const control of geometry.controls) {
    expect(control.left).toBeGreaterThanOrEqual(geometry.left);
    expect(control.right).toBeLessThanOrEqual(geometry.right);
    expect(control.top).toBeGreaterThanOrEqual(geometry.top);
    expect(control.bottom).toBeLessThanOrEqual(geometry.bottom);
    expect(control.height).toBe(32);
  }
  if (page.viewportSize()!.width >= 640) {
    expect(new Set(geometry.controls.map((control) => control.top)).size).toBe(
      1,
    );
  }
  await page.screenshot({ path: testInfo.outputPath("preview-header.png") });
  await header.getByRole("button", { name: "Close ECCD card preview" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.downloads).toEqual([]);
  expect(
    await page.evaluate(() => localStorage.getItem("ames_draft_2_unrelated")),
  ).toBe("keep my work");
});

test("a single-student roster disables both header navigation buttons", async ({
  page,
}) => {
  await portal(page, [1]);
  await page
    .getByRole("button", { name: "Preview ECCD Card", exact: true })
    .click();
  await chooseStudent(page, "Student 1 Test (Pending)");
  await expect(
    page.getByRole("button", { name: "Previous Student" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Next Student" }),
  ).toBeDisabled();
  await expect(
    page
      .frameLocator('iframe[title="Official ECCD Card"]')
      .getByRole("heading"),
  ).toHaveText("Card for Student 1");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("download selector preserves individual and all-student checklist exports", async ({
  page,
}) => {
  const state = await portal(page);
  for (const [option, path] of [
    [
      "Student 1 Test (Pending)",
      "/api/eccd/export/card-single?school_year=2026-2027&student_id=1",
    ],
    [
      "All Students in Section (ZIP)",
      "/api/eccd/export/cards-zip?school_year=2026-2027&section_id=1",
    ],
  ]) {
    await page.getByRole("button", { name: "Download", exact: true }).click();
    await page
      .getByRole("menuitem", { name: "ECCD Records", exact: true })
      .click();
    await expectFitsViewport(page);
    await expect(
      page.getByRole("combobox", { name: "School Year" }),
    ).toHaveText("2026-2027");
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
  await page.getByRole("menuitem", { name: "Section Summary Record" }).click();
  await expect(page.getByRole("combobox", { name: "School Year" })).toHaveText(
    "2026-2027",
  );
  const download = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Download", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("server-record.xlsx");
  expect(state.downloads).toEqual([
    "/api/eccd/export/section-summary?school_year=2026-2027&section_id=1",
  ]);
  state.downloadError = true;
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await page.getByRole("menuitem", { name: "Section Summary Record" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Download", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Section is not assigned to you." }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("archived years offer only a section ZIP and switching back resets individual selection", async ({
  page,
}, testInfo) => {
  const state = await portal(page);
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "ECCD Records", exact: true })
    .click();
  await chooseStudent(page, "Student 1 Test (Pending)");
  await page.screenshot({ path: testInfo.outputPath("current-year.png") });
  await page.getByRole("combobox", { name: "School Year" }).click();
  await page.getByRole("option", { name: "2025-2026", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Select Student" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Archived Cohort:", { exact: false }),
  ).toBeVisible();
  await expectFitsViewport(page);
  await page.screenshot({ path: testInfo.outputPath("archived-year.png") });
  await page.getByRole("combobox", { name: "School Year" }).click();
  await page.getByRole("option", { name: "2026-2027", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Download", exact: true }),
  ).toBeDisabled();
  await page.getByRole("combobox", { name: "School Year" }).click();
  await page.getByRole("option", { name: "2025-2026", exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Section ZIP", exact: true })
    .click();
  await download;
  expect(state.downloads).toEqual([
    "/api/eccd/export/cards-zip?school_year=2025-2026&section_id=1",
  ]);
  expect(
    await page.evaluate(() => localStorage.getItem("ames_draft_2_unrelated")),
  ).toBe("keep my work");
});

test("historical summary uses the selected cohort and failed exports retain that selection for retry", async ({
  page,
}) => {
  const state = await portal(page);
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await page.getByRole("menuitem", { name: "Section Summary Record" }).click();
  await page.getByRole("combobox", { name: "School Year" }).click();
  await page.getByRole("option", { name: "2024-2025", exact: true }).click();
  await expectFitsViewport(page);
  await expect(
    page.getByRole("combobox", { name: "Select Student" }),
  ).toHaveCount(0);
  state.downloadError = true;
  state.downloadErrorMessage =
    "No assessment records found for this section in School Year 2024-2025.";
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Download", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: state.downloadErrorMessage }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "School Year" })).toHaveText(
    "2024-2025",
  );
  state.downloadError = false;
  const download = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Download", exact: true })
    .click();
  await download;
  expect(state.downloads).toEqual(
    Array(2).fill(
      "/api/eccd/export/section-summary?school_year=2024-2025&section_id=1",
    ),
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("current-year individual choices exclude older, archived and foreign students", async ({
  page,
}) => {
  await portal(page);
  await page.route("**/api/eccd/students", async (route) => {
    await route.fulfill({
      json: [
        {
          student_id: 1,
          first_name: "Current",
          last_name: "Student",
          masked_lrn: "Pending",
          section_id: 1,
          school_year: "2026-2027",
          is_active: true,
        },
        {
          student_id: 2,
          first_name: "Past",
          last_name: "Student",
          masked_lrn: "Pending",
          section_id: 1,
          school_year: "2025-2026",
          is_active: true,
        },
        {
          student_id: 3,
          first_name: "Archived",
          last_name: "Student",
          masked_lrn: "Pending",
          section_id: 1,
          school_year: "2026-2027",
          is_active: false,
        },
        {
          student_id: 4,
          first_name: "Foreign",
          last_name: "Student",
          masked_lrn: "Pending",
          section_id: 2,
          school_year: "2026-2027",
          is_active: true,
        },
      ],
    });
  });
  const roster = page.waitForResponse("**/api/eccd/students");
  await page.reload();
  await roster;
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "ECCD Records", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Select Student" }).click();
  await expect(page.getByRole("option")).toHaveText([
    "All Students in Section (ZIP)",
    "Current Student (Pending)",
  ]);
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
  await page.getByRole("button", { name: "Next Student" }).click();
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Loading ECCD Card...");
  release();
  await expect(
    page
      .frameLocator('iframe[title="Official ECCD Card"]')
      .getByRole("heading", { name: "Latest student card" }),
  ).toBeVisible();
});
