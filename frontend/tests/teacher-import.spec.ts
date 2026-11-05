import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { SectionMismatchResponse, SessionUser } from "../src/types";

const fileKey = "ames_file_2_teacher_import";
const otherDraftKey = "ames_draft_2_unrelated_student";
interface ImportRequest {
  overwrite: boolean;
  sectionId: string;
  filename: string;
}
interface PortalState {
  requests: ImportRequest[];
  rosterReads: number;
  mode: "success" | "network" | "error" | "partial";
  initialError: boolean;
  fileSection: string;
  sectionId: number;
  waitForOverwrite?: Promise<void>;
}

async function storedWorkbook(page: Page) {
  return page.evaluate(async (key) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ames-form-files", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<{
        name: string;
        fields?: Record<string, string>;
        pending?: boolean;
        error?: string;
      } | null>((resolve, reject) => {
        const request = db.transaction("files").objectStore("files").get(key);
        request.onsuccess = () => {
          const record = request.result as
            | {
                file: File;
                request?: { fields: Record<string, string> };
                is_pending_sync?: boolean;
                error?: string;
              }
            | undefined;
          resolve(
            record
              ? {
                  name: record.file.name,
                  fields: record.request?.fields,
                  pending: record.is_pending_sync,
                  error: record.error,
                }
              : null,
          );
        };
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }, fileKey);
}

async function portal(page: Page) {
  const state: PortalState = {
    requests: [],
    rosterReads: 0,
    mode: "success",
    initialError: false,
    fileSection: "File Class",
    sectionId: 1,
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
  await page.addInitScript(
    ({ account, draftKey }) => {
      const payload = btoa(JSON.stringify({ exp: Date.now() / 1000 + 3600 }));
      localStorage.setItem("user", JSON.stringify(account));
      localStorage.setItem("token", `test.${payload}.test`);
      localStorage.setItem(draftKey, "unrelated unsaved input");
    },
    { account: user, draftKey: otherDraftKey },
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const sectionName = state.sectionId === 1 ? "Test A" : "Test B";
    if (path === "/api/teachers/import-students") {
      const body = route.request().postDataBuffer()?.toString("utf8") || "";
      const overwrite = /name="overwrite_section"\r?\n\r?\ntrue/.test(body);
      state.requests.push({
        overwrite,
        sectionId:
          /name="section_id"\r?\n\r?\n([^\r\n]+)/.exec(body)?.[1] || "",
        filename: /filename="([^"]+)"/.exec(body)?.[1] || "",
      });
      if (state.initialError || (overwrite && state.mode === "error")) {
        await route.fulfill({
          status: 400,
          json: { detail: "Invalid PRETEST DATE." },
        });
      } else if (!overwrite) {
        const mismatch: SectionMismatchResponse = {
          detail: "The file section does not match your assigned section.",
          code: "SECTION_MISMATCH",
          file_section: state.fileSection,
          assigned_section: sectionName,
        };
        await route.fulfill({ status: 409, json: mismatch });
      } else {
        if (state.waitForOverwrite) await state.waitForOverwrite;
        if (state.mode === "network") await route.abort("failed");
        else
          await route.fulfill({
            json: {
              successCount: 1,
              failedCount: state.mode === "partial" ? 1 : 0,
              errors:
                state.mode === "partial"
                  ? [{ row: 4, error: "Invalid student name." }]
                  : [],
            },
          });
      }
    } else if (path === "/api/students/") {
      state.rosterReads++;
      await route.fulfill({ json: [] });
    } else if (path === "/api/students/archived")
      await route.fulfill({ json: [] });
    else if (path === "/api/sections/")
      await route.fulfill({
        json: [
          { section_id: 1, section_name: "Test A" },
          { section_id: 2, section_name: "Test B" },
        ],
      });
    else if (path === "/api/teachers/dashboard-filters")
      await route.fulfill({ json: { sections: [sectionName] } });
    else if (path === "/api/teachers/active")
      await route.fulfill({
        json: [{ user_id: 2, first_name: "Test", last_name: "Teacher" }],
      });
    else if (path === "/api/messages/contacts")
      await route.fulfill({ json: { myId: 2, contacts: [] } });
    else if (path === "/api/messages/unread-count")
      await route.fulfill({ json: { unreadCount: 0 } });
    else await route.fulfill({ json: {} });
  });
  await page.goto("/teacher/students");
  await expect(
    page.getByRole("button", { name: "Import Info Sheet", exact: true }),
  ).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            JSON.parse(
              localStorage.getItem("ames_teacher_sections_2") || "[]",
            ) as { section_id: number }[]
          ).length,
      ),
    )
    .toBe(1);
  return state;
}

async function openImport(page: Page, filename = "students.xlsx") {
  await page
    .getByRole("button", { name: "Import Info Sheet", exact: true })
    .click();
  await page.locator('input[type="file"][accept=".xlsx"]').setInputFiles({
    name: filename,
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("mocked workbook; parser covered by backend tests"),
  });
  await page.getByRole("button", { name: "Import", exact: true }).click();
}
const confirmation = (page: Page) =>
  page.getByRole("dialog", { name: "Section Mismatch Detected" });

test("cancel and reload retain the workbook without authorizing overwrite", async ({
  page,
}) => {
  const state = await portal(page);
  await openImport(page);
  await expect(confirmation(page)).toContainText("File Class");
  await expect(confirmation(page)).toContainText("Test A");
  await confirmation(page)
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(confirmation(page)).toBeHidden();
  await expect(page.getByText("students.xlsx", { exact: true })).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Import Info Sheet", exact: true })
    .click();
  await expect(page.getByText("students.xlsx", { exact: true })).toBeVisible();
  expect(state.requests).toEqual([
    { overwrite: false, sectionId: "1", filename: "students.xlsx" },
  ]);
  expect(await storedWorkbook(page)).toMatchObject({
    name: "students.xlsx",
    pending: false,
  });
});

test("confirmed import locks controls, reports success, clears only its file and refreshes students", async ({
  page,
}) => {
  const state = await portal(page);
  await openImport(page);
  let release!: () => void;
  state.waitForOverwrite = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reads = state.rosterReads;
  await confirmation(page)
    .getByRole("button", { name: "Overwrite & Import" })
    .click();
  try {
    await expect(
      confirmation(page).getByRole("button", { name: "Overwrite & Import" }),
    ).toBeDisabled();
    await expect(
      confirmation(page).getByRole("button", { name: "Cancel" }),
    ).toBeDisabled();
    await expect(
      confirmation(page).getByRole("progressbar", {
        name: "Importing records",
      }),
    ).toBeVisible();
    await expect(
      page.locator('input[type="file"][accept=".xlsx"]'),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(confirmation(page)).toBeVisible();
  } finally {
    release();
  }
  await expect(confirmation(page)).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Import Info Sheet", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Import Summary" }),
  ).toBeVisible();
  await expect(
    page.getByText("Successfully imported 1 student into Test A."),
  ).toBeVisible();
  await expect.poll(() => state.rosterReads).toBeGreaterThan(reads);
  await expect.poll(() => storedWorkbook(page)).toBeNull();
  expect(state.requests).toEqual([
    { overwrite: false, sectionId: "1", filename: "students.xlsx" },
    { overwrite: true, sectionId: "1", filename: "students.xlsx" },
  ]);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), otherDraftKey),
  ).toBe("unrelated unsaved input");
});

test("unknown section names still require explicit confirmation", async ({
  page,
}) => {
  const state = await portal(page);
  state.fileSection = "Not identified";
  await openImport(page);
  await expect(confirmation(page)).toContainText("Not identified");
  expect(state.requests.every((request) => !request.overwrite)).toBeTruthy();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("validation failures remain visible and keep the workbook", async ({
  page,
}) => {
  const state = await portal(page);
  state.initialError = true;
  await openImport(page);
  await expect(
    page.getByText("Invalid PRETEST DATE.", { exact: true }),
  ).toBeVisible();
  await expect(confirmation(page)).toBeHidden();
  state.initialError = false;
  await page.getByRole("button", { name: "Import", exact: true }).click();
  state.mode = "error";
  await confirmation(page)
    .getByRole("button", { name: "Overwrite & Import" })
    .click();
  await expect(
    confirmation(page).getByText("Invalid PRETEST DATE.", { exact: true }),
  ).toBeVisible();
  expect(await storedWorkbook(page)).toMatchObject({
    name: "students.xlsx",
    pending: false,
  });
});

test("partial imports show row errors and retain the workbook for correction", async ({
  page,
}) => {
  const state = await portal(page);
  state.mode = "partial";
  await openImport(page);
  await confirmation(page)
    .getByRole("button", { name: "Overwrite & Import" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Import Summary" }),
  ).toBeVisible();
  await expect(
    page.getByText("Invalid student name.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Successfully imported 1 student into Test A."),
  ).toBeHidden();
  expect(await storedWorkbook(page)).toMatchObject({
    name: "students.xlsx",
    pending: false,
  });
});

test("offline import retains its workbook through reload and reconnect until manual confirmation", async ({
  page,
}) => {
  const state = await portal(page);
  state.mode = "network";
  await openImport(page);
  await confirmation(page)
    .getByRole("button", { name: "Overwrite & Import" })
    .click();
  await expect(
    page.getByRole("alert").filter({
      hasText:
        "Your draft is saved on this device. Reconnect and submit again.",
    }),
  ).toBeVisible();
  expect(await storedWorkbook(page)).toMatchObject({
    name: "students.xlsx",
    pending: true,
    fields: { section_id: "1", overwrite_section: "true" },
  });
  await page.reload();
  await expect
    .poll(async () => (await storedWorkbook(page))?.name)
    .toBe("students.xlsx");
  const submissions = state.requests.length;
  state.mode = "success";
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  expect(await storedWorkbook(page)).not.toBeNull();
  expect(state.requests).toHaveLength(submissions);
  await page
    .getByRole("button", { name: "Import Info Sheet", exact: true })
    .click();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await confirmation(page)
    .getByRole("button", { name: "Overwrite & Import" })
    .click();
  await expect.poll(() => storedWorkbook(page)).toBeNull();
  expect(
    state.requests
      .filter((request) => request.overwrite)
      .every(
        (request) =>
          request.overwrite &&
          request.sectionId === "1" &&
          request.filename === "students.xlsx",
      ),
  ).toBeTruthy();
});

test("a replacement workbook starts without the previous overwrite choice", async ({
  page,
}) => {
  const state = await portal(page);
  await openImport(page);
  await confirmation(page)
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.locator('input[type="file"][accept=".xlsx"]').setInputFiles({
    name: "replacement.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("replacement fixture"),
  });
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(confirmation(page)).toBeVisible();
  expect(state.requests.at(-1)).toEqual({
    overwrite: false,
    sectionId: "1",
    filename: "replacement.xlsx",
  });
});

test("a reassigned target invalidates the old confirmation", async ({
  page,
}) => {
  const state = await portal(page);
  await openImport(page);
  await expect(confirmation(page)).toBeVisible();
  state.sectionId = 2;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(confirmation(page)).toBeHidden();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(confirmation(page)).toContainText("Test B");
  expect(state.requests.at(-1)).toEqual({
    overwrite: false,
    sectionId: "2",
    filename: "students.xlsx",
  });
});
