import { expect, test, type Download, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { SessionResponse } from "../src/types";
import { expectNoStoredCredentials, setRamSession } from "./helpers/session";

const backend = "http://127.0.0.1:8776";
const year = "2026-2027";
const student = {
  student_id: 1,
  first_name: "Saved",
  last_name: "Student",
  masked_lrn: "Pending",
  section_id: 1,
  section_name: "Diamond",
  school_year: year,
  is_active: true,
  parents: [],
};
const section = { section_id: 1, section_name: "Diamond" };

async function portal(page: Page, userId: 1 | 2) {
  // Mock unrelated roster/dashboard data, never export responses or JWT validation.
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/auth/") || path.includes("export")) {
      await route.continue();
      return;
    }
    let data: object = {};
    if (["/api/chairman/students", "/api/eccd/students"].includes(path))
      data = [student];
    else if (["/api/chairman/sections", "/api/sections/"].includes(path))
      data = [section];
    else if (path === "/api/teachers/dashboard-filters")
      data = {
        sections: ["Diamond"],
        schoolYears: [year],
        currentSchoolYear: year,
      };
    else if (path === "/api/teachers/access-controls")
      data = {
        section_id: 1,
        section_name: "Diamond",
        allow_eccd_question_management: false,
      };
    else if (path === "/api/teachers/active")
      data = [
        {
          teacher_id: 1,
          user_id: 1,
          first_name: "Test",
          last_name: "Teacher",
          email: "teacher@example.com",
          section_id: 1,
          section_name: "Diamond",
          allow_eccd_question_management: false,
        },
      ];
    else if (path === "/api/analytics/filters")
      data = {
        sectionOptions: [section],
        domains: [],
        schoolYears: [year],
        currentSchoolYear: year,
      };
    else if (path === "/api/settings") data = { current_school_year: year };
    else if (
      path.includes("domains-progress") ||
      path.startsWith("/api/teachers/")
    )
      data = [];
    else if (path === "/api/messages/contacts")
      data = { myId: userId, contacts: [] };
    else if (path === "/api/messages/unread-count") data = { unreadCount: 0 };
    await route.fulfill({ json: data });
  });
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Log In", exact: true }),
  ).toBeVisible();
  const response = await page
    .context()
    .request.post(`${backend}/__test/session/${userId}`);
  expect(response.status()).toBe(200);
  const session = (await response.json()) as SessionResponse;
  await setRamSession(page, session);
  await expect(page).toHaveURL(
    userId === 2 ? /\/super-admin\/dashboard$/ : /\/teacher\/dashboard$/,
  );
  const cookie = (await page.context().cookies()).find(
    (item) => item.name === "ames_refresh_token",
  );
  expect(cookie).toMatchObject({
    httpOnly: true,
    sameSite: "Strict",
    path: "/api/auth",
  });
  await expectNoStoredCredentials(page);
  return { session, cookie };
}

async function navigate(page: Page, path: string) {
  await page
    .locator(`a[href="${path}"]`)
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

async function downloaded(
  download: Download,
  format: "pdf" | "xlsx",
  landscape = true,
) {
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));
  const file = await download.path();
  expect(file).not.toBeNull();
  const bytes = await readFile(file!);
  expect(bytes.length).toBeGreaterThan(100);
  if (format === "pdf") {
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const text = bytes.toString("latin1");
    expect(text.trimEnd()).toMatch(/%%EOF$/);
    const media = [...text.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];
    expect(media.length).toBeGreaterThan(0);
    for (const box of media)
      expect(Number(box[1]) > Number(box[2])).toBe(landscape);
    return [...text.matchAll(/\/Type \/Page\b/g)].length;
  }
  expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 3, 4]));
  for (const member of [
    "[Content_Types].xml",
    "xl/workbook.xml",
    "xl/worksheets/sheet1.xml",
  ]) {
    expect(bytes.includes(Buffer.from(member))).toBe(true);
  }
  return 0;
}

async function capture(
  page: Page,
  path: string,
  click: () => Promise<void>,
  format: "pdf" | "xlsx",
  token: string,
  landscape = true,
) {
  const response = page.waitForResponse((item) => {
    const url = new URL(item.url());
    return (
      url.pathname === path &&
      (url.searchParams.get("format") === "pdf") === (format === "pdf")
    );
  });
  const event = page.waitForEvent("download");
  await click();
  const result = await response;
  expect(result.status()).toBe(200);
  expect(result.headers()["content-type"]).toContain(
    format === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  expect(await result.request().headerValue("authorization")).toBe(
    `Bearer ${token}`,
  );
  const url = new URL(result.url());
  if (format === "xlsx") expect(url.searchParams.has("format")).toBe(false);
  return { pages: await downloaded(await event, format, landscape), url };
}

async function sessionIntact(
  page: Page,
  original: Awaited<ReturnType<typeof portal>>,
) {
  const state = await page.evaluate(async () => {
    const apiPath = "/src/services/api.ts";
    const {
      default: API,
      getAccessToken,
      getSessionUser,
    } = (await import(apiPath)) as typeof import("../src/services/api");
    const verified = await API.get<{ id: number; role: string }>(
      "/__test/session",
    );
    return {
      token: getAccessToken(),
      user: getSessionUser(),
      verified: verified.data,
    };
  });
  expect(state.token).toBe(original.session.access_token);
  expect(state.user).toEqual(original.session.user);
  expect(state.verified).toMatchObject({
    id: original.session.user.id,
    role: original.session.user.role,
  });
  expect(
    (await page.context().cookies()).find(
      (item) => item.name === "ames_refresh_token",
    ),
  ).toEqual(original.cookie);
  await expectNoStoredCredentials(page);
  expect(
    await page.evaluate(() => document.cookie.includes("ames_refresh_token")),
  ).toBe(false);
  await expect(page).not.toHaveURL(/\/login/);
}

test("Chairman Student Records and ECCD section summary offer PDF and preserve Excel", async ({
  page,
}, info) => {
  const original = await portal(page, 2);
  await navigate(page, "/super-admin/students");
  for (const format of ["pdf", "xlsx"] as const) {
    await page
      .getByRole("button", { name: "Download ECCD Records", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    const selector = dialog.getByRole("combobox", {
      name: "Download file format",
    });
    await expect(selector).toBeVisible();
    await selector.click();
    await expect(page.getByRole("option")).toHaveText([
      "Excel (.xlsx)",
      "PDF (.pdf)",
    ]);
    await page
      .getByRole("option", {
        name: format === "pdf" ? "PDF (.pdf)" : "Excel (.xlsx)",
        exact: true,
      })
      .click();
    await dialog.getByRole("combobox", { name: "Download section" }).click();
    await page.getByRole("option", { name: "Diamond", exact: true }).click();
    const result = await capture(
      page,
      "/api/chairman/export-eccd",
      () =>
        dialog.getByRole("button", { name: "Download", exact: true }).click(),
      format,
      original.session.access_token,
    );
    expect(result.url.searchParams.get("section")).toBe("Diamond");
    expect(result.url.searchParams.has("school_year")).toBe(false);
    if (format === "pdf") {
      info.annotations.push({
        type: "summary PDF pages",
        description: String(result.pages),
      });
      expect.soft(result.pages).toBe(3);
    }
    await expect(dialog).toHaveCount(0);
  }
  await sessionIntact(page, original);
});

test("Chairman Teacher Management Sections summary downloads PDF and Excel", async ({
  page,
}) => {
  const original = await portal(page, 2);
  await navigate(page, "/super-admin/teachers");
  await page
    .getByRole("button", { name: "Manage Access", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Manage Sections", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Sections & Primary Advisers",
    exact: true,
  });
  const selector = dialog.getByRole("combobox", {
    name: "Summary export file format",
  });
  await expect(selector).toBeVisible();
  for (const format of ["pdf", "xlsx"] as const) {
    await selector.click();
    await page
      .getByRole("option", {
        name: format === "pdf" ? "PDF (.pdf)" : "Excel (.xlsx)",
        exact: true,
      })
      .click();
    const result = await capture(
      page,
      "/api/chairman/sections/1/export-summary",
      () =>
        dialog
          .getByRole("button", { name: "Export summary", exact: true })
          .click(),
      format,
      original.session.access_token,
    );
    expect(result.url.searchParams.get("schoolYear")).toBe("All");
    if (format === "pdf")
      console.log(
        `Full-content section summary: ${result.pages} landscape pages`,
      );
  }
  await sessionIntact(page, original);
});

test("Teacher two-page checklists, bulk ZIP and three-page summary preserve Excel and the RAM session", async ({
  page,
}) => {
  test.setTimeout(90000);
  const original = await portal(page, 1);
  await navigate(page, "/teacher/eccdassessment");
  for (const kind of ["individual", "summary", "bulk"] as const) {
    const summary = kind === "summary";
    const bulk = kind === "bulk";
    for (const format of ["pdf", "xlsx"] as const) {
      await page.getByRole("button", { name: "Download", exact: true }).click();
      await page
        .getByRole("menuitem", {
          name: summary ? "Section Summary Record" : "ECCD Records",
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog");
      const selector = dialog.getByRole("combobox", { name: "File Format" });
      await expect(selector).toHaveText("Excel (.xlsx)");
      await selector.click();
      await page
        .getByRole("option", {
          name: format === "pdf" ? "PDF (.pdf)" : "Excel (.xlsx)",
          exact: true,
        })
        .click();
      if (!summary) {
        await dialog.getByRole("combobox", { name: "Select Student" }).click();
        await page
          .getByRole("option", {
            name: bulk ? "All Students in Section (ZIP)" : "Saved Student (Pending)",
            exact: true,
          })
          .click();
      }
      if (bulk) {
        const response = page.waitForResponse((item) => {
          const url = new URL(item.url());
          return url.pathname === "/api/eccd/export/cards-zip" &&
            (url.searchParams.get("format") === "pdf") === (format === "pdf");
        });
        const event = page.waitForEvent("download");
        await dialog.getByRole("button", { name: "Download", exact: true }).click();
        const result = await response;
        expect(result.status()).toBe(200);
        expect(result.headers()["content-type"]).toContain("application/zip");
        expect(await result.request().headerValue("authorization")).toBe(`Bearer ${original.session.access_token}`);
        const url = new URL(result.url());
        expect(url.searchParams.get("section_id")).toBe("1");
        expect(url.searchParams.get("school_year")).toBe(year);
        if (format === "xlsx") expect(url.searchParams.has("format")).toBe(false);
        const download = await event;
        expect(await download.failure()).toBeNull();
        expect(download.suggestedFilename()).toMatch(/\.zip$/);
        const file = await download.path();
        expect(file).not.toBeNull();
        const archive = await readFile(file!);
        const members: string[] = [];
        // The existing backend ZIP writer stores each member without compression.
        let offset = 0;
        while (archive.readUInt32LE(offset) === 0x04034b50) {
          expect(archive.readUInt16LE(offset + 6)).toBe(0);
          expect(archive.readUInt16LE(offset + 8)).toBe(0);
          const size = archive.readUInt32LE(offset + 18);
          const nameLength = archive.readUInt16LE(offset + 26);
          const extraLength = archive.readUInt16LE(offset + 28);
          const name = archive.subarray(offset + 30, offset + 30 + nameLength).toString();
          const start = offset + 30 + nameLength + extraLength;
          const bytes = archive.subarray(start, start + size);
          expect(bytes.length).toBeGreaterThan(100);
          members.push(name);
          expect(name).toMatch(new RegExp(`\\.${format}$`));
          if (format === "pdf") {
            expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
            const text = bytes.toString("latin1");
            expect(text.trimEnd()).toMatch(/%%EOF$/);
            expect([...text.matchAll(/\/Type \/Page\b/g)]).toHaveLength(2);
          } else {
            expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 3, 4]));
            expect(bytes.includes(Buffer.from("xl/workbook.xml"))).toBe(true);
          }
          offset = start + size;
        }
        expect(members).toEqual([`STUDENT_${year}.${format}`, `STUDENT_${year}_3.${format}`]);
        await expect(dialog).toHaveCount(0);
        await sessionIntact(page, original);
        continue;
      }
      const result = await capture(
        page,
        `/api/eccd/export/${summary ? "section-summary" : "card-single"}`,
        () =>
          dialog.getByRole("button", { name: "Download", exact: true }).click(),
        format,
        original.session.access_token,
        true,
      );
      expect(result.url.searchParams.get("school_year")).toBe(year);
      expect(
        result.url.searchParams.get(summary ? "section_id" : "student_id"),
      ).toBe("1");
      if (format === "pdf") expect(result.pages).toBe(summary ? 3 : 2);
      await expect(dialog).toHaveCount(0);
      await sessionIntact(page, original);
    }
  }
});
