import { expect, test } from "@playwright/test";
import type { Page, Locator, TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Answer, Assessment, Period } from "../src/types";

const settings = {
  school_name: "Example School",
  principal_name: "Example Principal",
  system_title: "AMES",
  current_school_year: "2026-2027",
  school_year_start_month: 8,
  primary_color: "#2563eb",
  secondary_color: "#111827",
  logo_url:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23ffffff'/%3E%3Ctext x='50' y='64' font-size='40' text-anchor='middle' fill='%232563eb'%3EA%3C/text%3E%3C/svg%3E",
};
const permissions = {
  allow_parent_view_student_info: true,
  allow_parent_view_eccd_pre: false,
  allow_parent_view_eccd_mid: false,
  allow_parent_view_eccd_post: false,
  allow_parent_edit_student_info: true,
  allow_parent_edit_home_based_eccd: false,
};
const student = {
  student_id: 101,
  masked_lrn: "********1234",
  lrn_number: "********1234",
  first_name: "Avery",
  middle_name: "Lee",
  last_name: "Reyes",
  full_name: "Avery Lee Reyes",
  date_of_birth: "2021-04-01",
  gender: "Male",
  section_id: 1,
  section_name: "Section A",
  school_year: "2026-2027",
  decimal_age: 5.3,
  is_active: true,
  address: "Example Street",
  emergency_contact: "09123456789",
  handedness: "Right",
  num_of_siblings: 0,
  birth_order: "1",
  profile_completeness: 75,
  parent_names: "Jamie Reyes",
  parents: [],
  father_name: "Jamie Reyes",
  father_age: 30,
  father_occ: "Teacher",
  father_educ: "College",
  mother_name: "Alex Reyes",
  mother_age: 29,
  mother_occ: "Teacher",
  mother_educ: "College",
  legal_guardian_name: "",
};
const domains = [
  "Gross Motor Domain",
  "Fine Motor Domain",
  "Self-Help Domain",
].map((name, index) => ({
  domain_id: index + 1,
  domain_name: name,
  pre_progress: 50,
  mid_progress: 25,
  post_progress: 0,
  questions: [1, 2].map((sequence) => ({
    question_id: index * 2 + sequence,
    domain_id: index + 1,
    question_text:
      sequence === 1
        ? "Walks in a straight line."
        : "Moves safely around obstacles.",
    sequence_order: sequence,
    is_home_based: false,
    answers: { PRE: null, MID: null, POST: null },
  })),
}));
interface Fixture {
  empty?: boolean;
  chart?: boolean;
  messages?: boolean;
  archived?: boolean;
}
async function prepare(page: Page, fixture: Fixture = {}) {
  const calls: {
    path: string;
    method: string;
    body: unknown;
    query: string;
  }[] = [];
  let access = { ...permissions };
  let assessmentAccess = {
    section_id: 1,
    pre_test_parent_editable: true,
    mid_test_parent_editable: false,
    post_test_parent_editable: false,
  };
  await page.addInitScript(() => {
    if (!localStorage.getItem("token")) {
      localStorage.setItem(
        "user",
        JSON.stringify({
          id: 7,
          username: "Example Teacher",
          email: "teacher@example.test",
          role: "admin",
          is_first_login: 0,
          section_id: 1,
          section_name: "Section A",
          class_name: "Section A",
          allow_eccd_question_management: false,
        }),
      );
      localStorage.setItem(
        "token",
        `reference.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.reference`,
      );
    }
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/\/$/, "");
    calls.push({
      path,
      method: request.method(),
      query: url.search,
      body:
        request.postData() &&
        !request.headers()["content-type"]?.includes("multipart")
          ? request.postDataJSON()
          : null,
    });
    const roster = fixture.empty ? [] : [student];
    if (request.method() === "PUT" && /me\/access|access-controls/.test(path))
      access = { ...access, ...request.postDataJSON() };
    if (
      request.method() === "PUT" &&
      path === "/api/teacher/settings/parent-assessment-access"
    )
      assessmentAccess = { ...assessmentAccess, ...request.postDataJSON() };
    const data =
      path === "/api/teacher/settings/parent-assessment-access"
        ? assessmentAccess
        : path === "/api/settings"
          ? settings
          : path === "/api/sections"
            ? [
                {
                  section_id: 1,
                  section_name: "Section A",
                  first_name: "Divina C.",
                  last_name: "Carpio",
                  role: "Primary Adviser",
                  status: "Active",
                },
              ]
            : /dashboard-filters/.test(path)
              ? {
                  sections: ["Section A"],
                  domains: domains.map((d) => d.domain_name),
                }
              : /dashboard-stats/.test(path)
                ? {
                    stats: {
                      totalStudents: roster.length,
                      unreadMessages: fixture.messages ? 1 : 0,
                      eccdProgress: fixture.chart
                        ? "22.2%"
                        : fixture.empty
                          ? "0%"
                          : "0.0%",
                      priorityDomain: "None",
                    },
                    messages: fixture.messages
                      ? [
                          {
                            id: 1,
                            read: false,
                            name: "Jamie Reyes",
                            time: "10:30",
                            preview: "How is Avery doing in class?",
                          },
                        ]
                      : [],
                  }
                : /dashboard-pie/.test(path)
                  ? fixture.chart
                    ? [
                        { name: "KAYA", value: 3, color: "#3b82f6" },
                        { name: "DI-KAYA", value: 1, color: "#f59e0b" },
                      ]
                    : []
                  : /access-controls|me\/access/.test(path)
                    ? {
                        ...access,
                        allow_parent_home_based_edit:
                          access.allow_parent_edit_home_based_eccd,
                        parent_can_edit_pre:
                          assessmentAccess.pre_test_parent_editable,
                        parent_can_edit_mid:
                          assessmentAccess.mid_test_parent_editable,
                        parent_can_edit_post:
                          assessmentAccess.post_test_parent_editable,
                        section_id: 1,
                        section_name: "Section A",
                        allow_eccd_question_management: false,
                      }
                    : path === "/api/students/archived"
                      ? fixture.archived
                        ? [
                            {
                              ...student,
                              student_id: 202,
                              first_name: "Jordan",
                              full_name: "Jordan Lee Reyes",
                              is_active: false,
                            },
                          ]
                        : []
                      : path === "/api/students/101"
                        ? page.url().includes(":5187")
                          ? { ...student, num_of_siblings: "0" }
                          : student
                        : path === "/api/students" ||
                            path === "/api/eccd/students" ||
                            path === "/api/students/section/1"
                          ? roster
                          : path === "/api/eccd/domains-progress"
                            ? fixture.empty
                              ? []
                              : domains
                            : path === "/api/eccd/assessment/101"
                              ? {
                                  student_id: 101,
                                  masked_lrn: student.masked_lrn,
                                  domains,
                                  periodDates: {
                                    PRE: null,
                                    MID: null,
                                    POST: null,
                                  },
                                  evalAges: {},
                                  student_birth_date: student.date_of_birth,
                                }
                              : path === "/api/teachers/change-password-request"
                                ? {
                                    email: "teacher@example.test",
                                    challengeToken: "fixture-challenge",
                                    message:
                                      "Verification code sent to your email.",
                                  }
                                : path === "/api/teachers/import-students"
                                  ? {
                                      successCount: 1,
                                      failedCount: 1,
                                      errors: [
                                        {
                                          row: 3,
                                          error: "Invalid date of birth.",
                                        },
                                      ],
                                    }
                                  : path.includes("/api/messages/contacts")
                                    ? { contacts: [] }
                                    : { unreadCount: 0, success: true };
    await route.fulfill({ json: data });
  });
  return calls;
}
async function ready(page: Page) {
  await page.evaluate(async () => {
    await Promise.all(
      [300, 400, 500, 600, 700, 800].map((weight) =>
        document.fonts.load(`${weight} 16px Poppins`),
      ),
    );
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) => img.decode().catch(() => {})),
    );
  });
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    if (
      document.activeElement instanceof HTMLInputElement &&
      document.activeElement.type === "date"
    )
      document.activeElement.blur();
  });
  await page.evaluate(() =>
    document.getAnimations().forEach((animation) => {
      try {
        animation.finish();
      } catch {
        animation.cancel();
      }
    }),
  );
}
async function compare(
  actual: Locator,
  reference: Locator,
  name: string,
  info: TestInfo,
) {
  const measure = async (target: Locator) =>
    target
      .locator(
        "h1,h2,h3,h4,h5,h6,table,thead,tbody,tr,th,td,button,input,select,span",
      )
      .evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            text: element.textContent?.trim().slice(0, 100),
            tag: element.tagName,
            class: element.className,
            x: rect.x,
            y: rect.y,
            w: rect.width,
            h: rect.height,
            font: style.font,
            fontWeight: style.fontWeight,
            color: style.color,
            letterSpacing: style.letterSpacing,
            background: style.backgroundColor,
            outline: style.outline,
            padding: style.padding,
            border: style.border,
            borderTop: style.borderTop,
            borderBottom: style.borderBottom,
            boxShadow: style.boxShadow,
          };
        }),
      );
  const geometry = JSON.stringify(
    { actual: await measure(actual), reference: await measure(reference) },
    null,
    2,
  );
  await writeFile(info.outputPath(name + "-geometry.json"), geometry);
  await info.attach(name + "-geometry", {
    body: geometry,
    contentType: "application/json",
  });
  const path = info.snapshotPath(name + ".png");
  await mkdir(dirname(path), { recursive: true });
  const baseline = await reference.screenshot({ animations: "disabled" });
  await writeFile(path, baseline);
  await info.attach(name + "-legacy", {
    body: baseline,
    contentType: "image/png",
  });
  await expect(actual).toHaveScreenshot(name + ".png", {
    animations: "disabled",
    maxDiffPixels: 0,
    threshold: 0.1,
  });
  await info.attach(name + "-current", {
    body: await actual.screenshot({
      path: info.outputPath(name + "-current.png"),
      animations: "disabled",
    }),
    contentType: "image/png",
  });
}
const titles: Record<string, string> = {
  dashboard: "Educational Overview",
  students: "Manage Students",
  eccdassessment: "ECCD Assessment",
  settings: "Settings",
};
async function openPair(
  page: Page,
  reference: Page,
  screen: string,
  fixture: Fixture = {},
) {
  await reference.setViewportSize(page.viewportSize()!);
  await prepare(page, fixture);
  await prepare(reference, fixture);
  await Promise.all([
    page.goto("/teacher/" + screen),
    reference.goto("http://localhost:5187/teacher/" + screen + "?role=admin"),
  ]);
  for (const target of [page, reference]) {
    await expect(
      target.getByRole("heading", { name: titles[screen], exact: true }),
    ).toBeVisible();
    if (screen === "students" && !fixture.empty)
      await expect(target.locator("tbody")).toContainText(/Reyes, Avery L\./i);
    if (screen === "eccdassessment" && !fixture.empty)
      await expect(
        target.getByText("Gross Motor Domain", { exact: true }),
      ).toBeVisible();
    if (screen === "dashboard")
      await expect(
        target.getByText("Section: Section A", { exact: true }),
      ).toBeVisible();
    await ready(target);
  }
}

for (const width of [320, 768, 1280])
  test(`home-based settings match legacy labels, grouping and card layout at ${width}px`, async ({
    page,
    context,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const reference = await context.newPage();
    const errors: string[] = [];
    for (const target of [page, reference])
      target.on("pageerror", (error) => errors.push(error.message));
    await openPair(page, reference, "settings");
    const controls = [
      ["Home-Based Checklist Edit", "Allow parents to fill out home checklist"],
      [
        "Pre-Test Home-Based Edit",
        "Allow Pre-test home-based question editing",
      ],
      [
        "Mid-Test Home-Based Edit",
        "Allow Mid-test home-based question editing",
      ],
      [
        "Post-Test Home-Based Edit",
        "Allow Post-test home-based question editing",
      ],
    ];
    for (const target of [page, reference]) {
      await expect(target.getByRole("switch")).toHaveCount(9);
      await expect(
        target.getByText("ECCD Assessment Visibility", { exact: true }),
      ).toBeVisible();
      await expect(
        target.getByText("ECCD Assessment Editing", { exact: true }),
      ).toBeVisible();
      await expect(
        target.getByText(
          "Enable Home-Based Checklist Edit, then choose which assessment periods parents can edit. Changes save automatically.",
          { exact: true },
        ),
      ).toBeVisible();
      for (const [label, description] of controls) {
        const control = target.getByRole("switch", {
          name: label,
          exact: true,
        });
        await expect(control).toBeEnabled();
        if (label.startsWith("Pre-Test")) await expect(control).toBeChecked();
        else await expect(control).not.toBeChecked();
        await expect(
          target.getByText(description, { exact: true }),
        ).toBeVisible();
      }
      expect(
        await target.getByRole("switch").evaluateAll((switches) => {
          const papers = switches.map(
            (input) =>
              input.closest(".MuiPaper-outlined")?.parentElement?.parentElement
                ?.parentElement,
          );
          return papers.every((paper) => !!paper && paper === papers[0]);
        }),
      ).toBe(true);
      expect(
        await target.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await ready(target);
    }
    // Compare only the requested editing cards; account settings have their own tests.
    const card = (target: Page, label: string) =>
      target
        .getByRole("switch", { name: label, exact: true })
        .locator(
          "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' MuiPaper-outlined ')][1]",
        );
    for (const [index, [label]] of controls.entries()) {
      await compare(
        card(page, label),
        card(reference, label),
        `home-edit-card-${index}-${width}`,
        info,
      );
    }
    // Check enabled-state master, warning, and success colors after auto-save.
    for (const index of [0, 2, 3]) {
      const label = controls[index][0];
      for (const target of [page, reference]) {
        const toggle = target.getByRole("switch", { name: label, exact: true });
        await toggle.check();
        await expect(toggle).toBeEnabled();
        await expect(toggle).toBeChecked();
        await ready(target);
      }
      await compare(
        card(page, label),
        card(reference, label),
        `home-edit-enabled-${index}-${width}`,
        info,
      );
    }
    await reference.close();
    expect(errors).toEqual([]);
  });

for (const width of [320, 600, 900, 1200, 1280])
  for (const screen of Object.keys(titles)) {
    test(`${screen} visual parity at ${width}px`, async ({
      page,
      context,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const reference = await context.newPage();
      const errors: string[] = [];
      for (const target of [page, reference])
        target.on("pageerror", (e) => errors.push(e.message));
      await openPair(page, reference, screen);
      await compare(
        page.locator("main"),
        reference.locator("main"),
        `${screen}-${width}`,
        info,
      );
      expect(errors).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      if (width < 900)
        await expect(
          page.getByRole("button", { name: "Open navigation" }),
        ).toBeVisible();
      else
        await expect(
          page.getByRole("button", { name: "Open navigation" }),
        ).toBeHidden();
      await reference.close();
    });
  }

for (const width of [320, 600, 900, 1200, 1280])
  for (const modal of [
    "enrollment",
    "profile",
    "archive",
    "import",
    "export",
    "challenge",
    "matrix",
  ]) {
    test(`${modal} visual parity at ${width}px`, async ({
      page,
      context,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const reference = await context.newPage();
      const screen =
        modal === "challenge"
          ? "settings"
          : modal === "export" || modal === "matrix"
            ? "eccdassessment"
            : "students";
      await openPair(page, reference, screen);
      for (const target of [page, reference]) {
        if (modal === "enrollment")
          await target
            .getByRole("button", { name: "Add Student", exact: true })
            .click();
        if (modal === "profile")
          await target.getByTitle("Edit Student", { exact: true }).click();
        if (modal === "archive")
          await target
            .getByRole("button", { name: "Archive All", exact: true })
            .click();
        if (modal === "import")
          await target
            .getByRole("button", { name: "Import Info Sheet", exact: true })
            .click();
        if (modal === "export") {
          await target
            .getByRole("button", { name: "Download Records" })
            .click();
          await target
            .getByRole("menuitem", { name: "Download Single Student" })
            .click();
        }
        if (modal === "challenge") {
          await target
            .getByPlaceholder("Enter current password to save")
            .fill("CurrentPass1");
          await target
            .getByPlaceholder("Enter new password", { exact: true })
            .fill("NewPassword1");
          await target
            .getByPlaceholder("Confirm new password")
            .fill("NewPassword1");
          await target
            .getByRole("button", { name: "Change Password", exact: true })
            .click();
        }
        if (modal === "matrix") {
          await target
            .getByRole("button", { name: "Assess Domain", exact: true })
            .first()
            .click();
          await target.locator("select").first().selectOption("101");
          await expect(target.locator("table")).toBeVisible();
          await target.locator("input[type=date]").fill("2026-10-13");
        }
        if (modal === "profile")
          await expect(target.locator("input[name=first_name]")).toHaveValue(
            "Avery",
          );
        await ready(target);
      }
      await compare(
        modal === "matrix" ? page.locator("main") : page.getByRole("dialog"),
        modal === "matrix"
          ? reference.locator("main")
          : reference.getByRole("dialog"),
        `${modal}-${width}`,
        info,
      );
      await reference.close();
    });
  }

for (const width of [320, 1280]) {
  test(`dashboard populated chart and unread feed at ${width}px`, async ({
    page,
    context,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const reference = await context.newPage();
    await openPair(page, reference, "dashboard", {
      chart: true,
      messages: true,
    });
    for (const target of [page, reference]) {
      await expect(target.locator(".recharts-pie-label-text")).toHaveText([
        "KAYA 75%",
        "DI-KAYA 25%",
      ]);
      await target.waitForTimeout(2100);
      await target.evaluate(() => {
        window.scrollTo(0, 0);
        document.querySelector("main")?.scrollTo(0, 0);
      });
    }
    await compare(
      page.locator("main"),
      reference.locator("main"),
      `chart-feed-${width}`,
      info,
    );
    await page.getByText("View All Messages", { exact: true }).click();
    await expect(page).toHaveURL(/\/teacher\/messages/);
    await reference.close();
  });
  test(`enrollment reload, pending reconnection and integer section at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const calls = await prepare(page);
    await page.goto("/teacher/students");
    await expect(page.locator("tbody")).toContainText("Avery");
    await page
      .getByRole("button", { name: "Add Student", exact: true })
      .click();
    for (const [field, value] of Object.entries({
      first_name: "New",
      middle_name: "Lee",
      last_name: "Student",
      date_of_birth: "2021-02-01",
      lrn_number: "123456789012",
    }))
      await page.locator(`input[name=${field}]`).fill(value);
    await page.getByRole("dialog").getByRole("combobox").click();
    await page.getByRole("option", { name: "Female", exact: true }).click();
    await page.reload();
    await expect(page.locator("tbody")).toContainText("Avery");
    await page
      .getByRole("button", { name: "Add Student", exact: true })
      .click();
    await expect(page.locator("input[name=first_name]")).toHaveValue("New");
    await context.setOffline(true);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Saved locally");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(
              localStorage.getItem("ames_draft_7_teacher_student_new_1") ||
                "null",
            )?.is_pending_sync,
        ),
      )
      .toBe(true);
    await context.setOffline(false);
    await expect
      .poll(
        () =>
          calls.filter(
            (call) => call.path === "/api/students" && call.method === "POST",
          ).length,
      )
      .toBe(1);
    expect(
      calls.find(
        (call) => call.path === "/api/students" && call.method === "POST",
      )?.body,
    ).toMatchObject({
      section_id: 1,
      lrn_number: "123456789012",
      middle_name: "Lee",
    });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(
              localStorage.getItem("ames_draft_7_teacher_student_new_1") ||
                "null",
            )?.values.first_name || "",
        ),
      )
      .toBe("");
  });
  test(`profile ID mapping, masked LRN, zero values and rejected save at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const calls = await prepare(page);
    await page.goto("/teacher/students");
    await expect(page.locator("tbody")).toContainText("Avery");
    await page.getByTitle("Edit Student", { exact: true }).click();
    await expect(page.locator("input[name=first_name]")).toHaveValue("Avery");
    await expect(page.getByRole("dialog")).toContainText("LRN: ********1234");
    await expect(page.locator("input[name=num_of_siblings]")).toHaveValue("0");
    await page.locator("input[name=address]").fill("Edited Address");
    await page.route("**/api/students/101", (route) =>
      route.request().method() === "PUT"
        ? route.fulfill({
            status: 403,
            json: { detail: "Profile editing locked." },
          })
        : route.fallback(),
    );
    await page
      .getByRole("button", { name: "Save Changes", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "Profile editing locked.",
    );
    await page.reload();
    await expect(page.locator("tbody")).toContainText("Avery");
    await page.getByTitle("Edit Student", { exact: true }).click();
    await expect(page.locator("input[name=address]")).toHaveValue(
      "Edited Address",
    );
    expect(
      calls.some((call) => call.path === "/api/students/101"),
    ).toBeTruthy();
  });
  test(`six granular switches retain offline intent and synchronize at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const calls = await prepare(page);
    await page.goto("/teacher/settings");
    await expect(
      page.getByText("Student Profile Viewing", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("switch")).toHaveCount(9);
    const preVisibility = page.getByRole("switch", {
      name: "Pre-Test Scores Visibility",
      exact: true,
    });
    await expect(preVisibility).toBeEnabled();
    // Reload is served locally while browser offline signals drive the save queue.
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "onLine", {
        configurable: true,
        get: () => localStorage.getItem("fixture-offline") !== "true",
      }),
    );
    await page.evaluate(() => {
      localStorage.setItem("fixture-offline", "true");
      Object.defineProperty(navigator, "onLine", {
        configurable: true,
        get: () => localStorage.getItem("fixture-offline") !== "true",
      });
      dispatchEvent(new Event("offline"));
    });
    await preVisibility.check();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(
              localStorage.getItem("ames_draft_7_teacher_access") || "null",
            )?.values.allow_parent_view_eccd_pre,
        ),
      )
      .toBe(true);
    await page.reload();
    await expect(preVisibility).toBeChecked();
    await page.evaluate(() => {
      localStorage.removeItem("fixture-offline");
      dispatchEvent(new Event("online"));
    });
    await expect
      .poll(
        () =>
          calls.filter(
            (call) =>
              call.path === "/api/teachers/me/access" && call.method === "PUT",
          ).length,
      )
      .toBe(1);
    expect(
      Object.keys(
        calls.find(
          (call) =>
            call.path === "/api/teachers/me/access" && call.method === "PUT",
        )!.body as object,
      ).sort(),
    ).toEqual(Object.keys(permissions).sort());
    await expect
      .poll(() =>
        page.evaluate(() =>
          localStorage.getItem("ames_draft_7_teacher_access"),
        ),
      )
      .toBeNull();
  });
  test(`assessment carry-forward, reload, strict dates and offline save at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const calls = await prepare(page);
    const select = async () => {
      await page
        .getByRole("button", { name: "Assess Domain", exact: true })
        .first()
        .click();
      await page.locator("select").first().selectOption("101");
      await expect(page.locator("table")).toBeVisible();
    };
    await page.goto("/teacher/eccdassessment");
    await select();
    await page
      .locator("tbody tr")
      .first()
      .getByRole("button", { name: "KAYA", exact: true })
      .first()
      .click();
    await expect(
      page
        .locator("tbody tr")
        .first()
        .getByRole("button", { name: "KAYA", exact: true })
        .nth(1),
    ).not.toHaveClass(/bg-emerald-100/);
    await page.reload();
    await select();
    await expect(
      page
        .locator("tbody tr")
        .first()
        .getByRole("button", { name: "KAYA", exact: true })
        .first(),
    ).toHaveClass(/bg-emerald-600/);
    await page.locator("input[type=date]").fill("2020-01-01");
    await expect(
      page.getByRole("button", { name: "Save Assessment", exact: true }),
    ).toBeDisabled();
    await page.locator("input[type=date]").fill("2026-10-13");
    await context.setOffline(true);
    await page
      .getByRole("button", { name: "Save Assessment", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("eccd_draft_101_PRE_1_7") || "null")
              ?.is_pending_sync,
        ),
      )
      .toBe(true);
    await context.setOffline(false);
    await expect
      .poll(
        () =>
          calls.filter(
            (call) =>
              call.path === "/api/eccd/evaluate" && call.method === "POST",
          ).length,
      )
      .toBe(1);
    expect(
      calls.find(
        (call) => call.path === "/api/eccd/evaluate" && call.method === "POST",
      )?.body,
    ).toMatchObject({
      student_id: 101,
      testing_period: "PRE",
      assessment_date: "2026-10-13",
      evaluations: [{ question_id: 1, testing_period: "PRE", answer: "KAYA" }],
    });
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("eccd_draft_101_PRE_1_7")),
      )
      .toBeNull();
    expect(
      await page.evaluate(() => localStorage.getItem("eccd_draft_101_MID_1_7")),
    ).toBeNull();
  });
}

for (const screen of ["dashboard", "students", "eccdassessment"])
  test(`${screen} empty state matches reference`, async ({
    page,
    context,
  }, info) => {
    const reference = await context.newPage();
    await openPair(page, reference, screen, { empty: true });
    await compare(
      page.locator("main"),
      reference.locator("main"),
      `empty-${screen}`,
      info,
    );
    await reference.close();
  });

test("workbook partial import feedback matches and file remains recoverable", async ({
  page,
  context,
}, info) => {
  const reference = await context.newPage();
  await openPair(page, reference, "students");
  for (const target of [page, reference]) {
    await target
      .getByRole("button", { name: "Import Info Sheet", exact: true })
      .click();
    await target.locator('input[type=file][accept=".xlsx"]').setInputFiles({
      name: "fixture.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("synthetic workbook; API mocked"),
    });
    await target.getByRole("button", { name: "Import", exact: true }).click();
    await expect(target.getByRole("dialog")).toContainText(
      "Invalid date of birth.",
    );
    await ready(target);
  }
  await compare(
    page.getByRole("dialog"),
    reference.getByRole("dialog"),
    "import-summary",
    info,
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Import Info Sheet", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("fixture.xlsx");
  await reference.close();
});

for (const width of [320, 600, 900, 1200, 1280])
  test(`shell drawer, active and hover states at ${width}px`, async ({
    page,
    context,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const reference = await context.newPage();
    await openPair(page, reference, "dashboard");
    if (width < 900) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await reference.getByRole("button", { name: "open drawer" }).click();
    }
    await ready(page);
    await ready(reference);
    const actual = page
      .getByRole("complementary", { name: "Main navigation" })
      .or(page.locator("aside[role=dialog]"));
    const expected = reference.locator(".MuiDrawer-paper");
    await compare(actual, expected, `drawer-${width}`, info);
    await page
      .getByRole("navigation", { name: "Sidebar", exact: true })
      .getByRole("link", { name: "My Students", exact: true })
      .hover();
    await reference.getByText("My Students", { exact: true }).hover();
    await compare(actual, expected, `drawer-hover-${width}`, info);
    if (width < 900) {
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("dialog", { name: "Main navigation" }),
      ).toBeHidden();
    }
    await reference.close();
  });

test("credential challenge preserves tab draft then replaces session on confirmed success", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/teacher/settings");
  await page
    .getByPlaceholder("Enter current password to save")
    .fill("CurrentPass1");
  await page
    .getByPlaceholder("Enter new password", { exact: true })
    .fill("NewPassword1");
  await page.getByPlaceholder("Confirm new password").fill("NewPassword1");
  await page
    .getByRole("button", { name: "Change Password", exact: true })
    .click();
  await page.getByRole("dialog").getByRole("textbox").fill("123456");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  await expect(
    page.getByPlaceholder("Enter new password", { exact: true }),
  ).toHaveValue("NewPassword1");
  await page
    .getByRole("button", { name: "Change Password", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("textbox")).toHaveValue(
    "123456",
  );
  const replacement = `replacement.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64")}.session`;
  await page.route("**/api/teachers/change-password-verify", (route) =>
    route.fulfill({
      json: {
        success: true,
        requireOtp: false,
        requiresPasswordChange: false,
        token: replacement,
        user: {
          id: 7,
          username: "Example Teacher",
          role: "admin",
          is_first_login: 0,
          section_id: 1,
          section_name: "Section A",
          email: "teacher@example.test",
          allow_eccd_question_management: false,
        },
      },
    }),
  );
  await page
    .getByRole("button", { name: "Verify & Update", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("token")))
    .toBe(replacement);
  await expect(
    page.getByPlaceholder("Enter new password", { exact: true }),
  ).toHaveValue("");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("question navigation honors the refreshed granular permission", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/teacher/dashboard");
  await expect(
    page
      .getByRole("navigation", { name: "Sidebar", exact: true })
      .getByRole("link", { name: "ECCD Questions", exact: true }),
  ).toHaveCount(0);
  await page.goto("/teacher/eccd-questions");
  await expect(page).toHaveURL(/\/teacher\/dashboard/);
  await page.route("**/api/teachers/access-controls", (route) =>
    route.fulfill({
      json: {
        ...permissions,
        section_id: 1,
        section_name: "Section A",
        allow_eccd_question_management: true,
      },
    }),
  );
  await page.evaluate(() => dispatchEvent(new Event("focus")));
  await expect(
    page
      .getByRole("navigation", { name: "Sidebar", exact: true })
      .getByRole("link", { name: "ECCD Questions", exact: true }),
  ).toBeVisible();
});

test("access HTTP 403 retains the exact intended switch revision", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/teacher/settings");
  await page.route("**/api/teachers/me/access", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({
          status: 403,
          json: { detail: "Adviser access locked." },
        })
      : route.fallback(),
  );
  await page.getByRole("switch").nth(5).check();
  await expect(page.getByRole("alert")).toContainText("Adviser access locked.");
  await page.reload();
  await expect(page.getByRole("switch").nth(5)).toBeChecked();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem("ames_draft_7_teacher_access") || "null",
        )?.is_pending_sync,
    ),
  ).toBe(false);
});

async function prepareSavedAssessment(
  page: Page,
  saved: Partial<Record<number, Partial<Record<Period, Answer>>>>,
  configure?: (assessment: Assessment) => void,
) {
  const calls = await prepare(page);
  await page.route("**/api/eccd/domains-progress", (route) =>
    route.fulfill({
      json: domains.map((domain) => ({
        ...domain,
        questions: domain.questions.map((q) => ({ ...q, answers: undefined })),
      })),
    }),
  );
  const assessment: Assessment = {
    student_id: 101,
    masked_lrn: student.masked_lrn,
    student_birth_date: student.date_of_birth,
    domains: domains.map((domain) => ({
      ...domain,
      questions: domain.questions.map((q) => ({
        ...q,
        is_home_based: q.question_id === 2,
        evaluator_roles: Object.fromEntries(
          (["PRE", "MID", "POST"] as Period[]).map((p) => [
            p,
            saved[q.question_id]?.[p] ? "teacher" : null,
          ]),
        ),
        answers: { ...q.answers, ...saved[q.question_id] },
      })),
    })),
    evalAges: {},
    periodDates: {
      PRE: Object.values(saved).some((answers) => answers?.PRE)
        ? "2026-09-01"
        : null,
      MID: Object.values(saved).some((answers) => answers?.MID)
        ? "2026-10-01"
        : null,
      POST: null,
    },
  };
  configure?.(assessment);
  await page.route("**/api/eccd/assessment/101", (route) =>
    route.fulfill({ json: assessment }),
  );
  await page.route("**/api/eccd/evaluate", async (route) => {
    const payload = route.request().postDataJSON() as {
      testing_period: Period;
      assessment_date: string;
      evaluations: {
        question_id: number;
        testing_period: Period;
        answer: Answer;
      }[];
    };
    calls.push({
      path: "/api/eccd/evaluate",
      method: "POST",
      query: "",
      body: payload,
    });
    for (const evaluation of payload.evaluations) {
      expect(evaluation.testing_period).toBe(payload.testing_period);
      const question = assessment.domains
        .flatMap((domain) => domain.questions)
        .find((q) => q.question_id === evaluation.question_id)!;
      question.answers[payload.testing_period] = evaluation.answer;
      question.evaluator_roles = {
        ...question.evaluator_roles,
        [payload.testing_period]: "teacher",
      };
    }
    assessment.periodDates[payload.testing_period] = payload.assessment_date;
    assessment.gradingDates = {
      ...assessment.gradingDates,
      [payload.testing_period]: payload.assessment_date,
    };
    await route.fulfill({ json: { success: true } });
  });
  return calls;
}

async function openAssessment(page: Page) {
  await page.goto("/teacher/eccdassessment");
  await page
    .getByRole("button", { name: "Assess Domain", exact: true })
    .first()
    .click();
  await page.locator("select").first().selectOption("101");
  await expect(page.locator("table")).toBeVisible();
}

function assessmentChoice(
  page: Page,
  row: number,
  period: Period,
  answer: Answer,
) {
  return page
    .locator("tbody tr")
    .nth(row)
    .getByRole("button", { name: answer, exact: true })
    .nth((["PRE", "MID", "POST"] as Period[]).indexOf(period));
}

async function expectUnassessed(page: Page, row: number, period: Period) {
  for (const answer of ["KAYA", "DI-KAYA"] as Answer[])
    await expect(assessmentChoice(page, row, period, answer)).not.toHaveClass(
      /bg-(emerald|rose)-(100|600)/,
    );
}

for (const width of [320, 768, 1280]) {
  test(`saved-only PRE lifecycle confirms virtual carry without submitting future periods at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await prepareSavedAssessment(page, {});
    // Observe actual browser requests independently of the fixture's save handler.
    const writes: unknown[] = [];
    const errors: string[] = [];
    page.on("request", (request) => {
      if (
        new URL(request.url()).pathname === "/api/eccd/evaluate" &&
        request.method() === "POST"
      )
        writes.push(request.postDataJSON());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await openAssessment(page);
    const dock = page.locator("div.sticky.bottom-0");
    const save = page.getByRole("button", {
      name: "Save Assessment",
      exact: true,
    });
    await page.locator('input[type="date"]').fill("2026-09-01");
    await expect(dock).toContainText("Saved: 0 / 2");
    await assessmentChoice(page, 0, "PRE", "KAYA").click();
    await expect(dock).toContainText("1 unsaved change");
    await expect(dock.getByText("Completed", { exact: true })).toHaveCount(0);
    // The audit requires saved-only inheritance, never an unsaved KAYA source.
    for (const period of ["MID", "POST"] as Period[])
      await expectUnassessed(page, 0, period);
    expect(writes).toEqual([]);

    await save.click();
    await expect(dock).toContainText("Saved: 1 / 2");
    await expect(dock).not.toContainText("unsaved change");
    await expect(dock.getByText("Completed", { exact: true })).toHaveCount(0);
    for (const period of ["MID", "POST"] as Period[]) {
      await expect(assessmentChoice(page, 0, period, "KAYA")).toHaveClass(
        /bg-emerald-100/,
      );
      await expect(
        page.locator("thead th").nth(period === "MID" ? 2 : 3),
      ).toContainText("Saved: 0 / 2");
    }
    expect(writes).toEqual([
      {
        student_id: 101,
        testing_period: "PRE",
        assessment_date: "2026-09-01",
        evaluations: [
          { question_id: 1, testing_period: "PRE", answer: "KAYA" },
        ],
      },
    ]);

    // Both downstream cells clear immediately, before another HTTP save.
    await assessmentChoice(page, 0, "PRE", "DI-KAYA").click();
    for (const period of ["MID", "POST"] as Period[])
      await expectUnassessed(page, 0, period);
    await expect(dock).toContainText("Saved: 1 / 2");
    await expect(dock).toContainText("1 unsaved change");
    expect(writes).toHaveLength(1);
    await save.click();
    await expect(dock).not.toContainText("unsaved change");
    for (const period of ["MID", "POST"] as Period[])
      await expectUnassessed(page, 0, period);

    // A fresh unsaved KAYA cannot restart the now DI-KAYA saved source.
    await assessmentChoice(page, 0, "PRE", "KAYA").click();
    await assessmentChoice(page, 1, "PRE", "DI-KAYA").click();
    await expect(dock).toContainText("2 unsaved changes");
    await expect(dock.getByText("Completed", { exact: true })).toHaveCount(0);
    for (const period of ["MID", "POST"] as Period[])
      await expectUnassessed(page, 0, period);
    await save.click();
    await expect(dock).toContainText("Saved: 2 / 2");
    await expect(dock).not.toContainText("unsaved change");
    await expect(dock.getByText("Completed", { exact: true })).toBeVisible();
    for (const period of ["MID", "POST"] as Period[]) {
      await expect(assessmentChoice(page, 0, period, "KAYA")).toHaveClass(
        /bg-emerald-100/,
      );
      await expectUnassessed(page, 1, period);
    }
    expect(writes).toEqual([
      {
        student_id: 101,
        testing_period: "PRE",
        assessment_date: "2026-09-01",
        evaluations: [
          { question_id: 1, testing_period: "PRE", answer: "KAYA" },
        ],
      },
      {
        student_id: 101,
        testing_period: "PRE",
        assessment_date: "2026-09-01",
        evaluations: [
          { question_id: 1, testing_period: "PRE", answer: "DI-KAYA" },
        ],
      },
      {
        student_id: 101,
        testing_period: "PRE",
        assessment_date: "2026-09-01",
        evaluations: [
          { question_id: 1, testing_period: "PRE", answer: "KAYA" },
          { question_id: 2, testing_period: "PRE", answer: "DI-KAYA" },
        ],
      },
    ]);
    expect(
      await page.evaluate(() =>
        ["PRE", "MID", "POST"].map((period) =>
          localStorage.getItem(`eccd_draft_101_${period}_1_7`),
        ),
      ),
    ).toEqual([null, null, null]);
    await page.locator("select").nth(1).selectOption("MID");
    await expect(dock).toContainText("Saved: 0 / 2");
    await expect(dock).not.toContainText("unsaved change");
    await expect(dock.getByText("Completed", { exact: true })).toHaveCount(0);
    expect(writes).toHaveLength(3);
    expect(errors).toEqual([]);
  });

  for (const midAnswer of ["KAYA", "DI-KAYA"] as Answer[])
    test(`saved-only PRE resets preserve independent MID ${midAnswer} and per-question carry at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const calls = await prepareSavedAssessment(page, {
        1: { PRE: "KAYA", MID: midAnswer },
        2: { PRE: "KAYA" },
      });
      await openAssessment(page);
      // Q1's committed MID must not suppress Q2's virtual MID in this domain.
      await expect(assessmentChoice(page, 0, "MID", midAnswer)).toHaveClass(
        midAnswer === "KAYA" ? /bg-emerald-100/ : /bg-rose-100/,
      );
      await expect(assessmentChoice(page, 1, "MID", "KAYA")).toHaveClass(
        /bg-emerald-100/,
      );
      await assessmentChoice(page, 0, "PRE", "DI-KAYA").click();
      await assessmentChoice(page, 1, "PRE", "DI-KAYA").click();
      await expect(assessmentChoice(page, 0, "MID", midAnswer)).toHaveClass(
        midAnswer === "KAYA" ? /bg-emerald-100/ : /bg-rose-100/,
      );
      if (midAnswer === "KAYA")
        await expect(assessmentChoice(page, 0, "POST", "KAYA")).toHaveClass(
          /bg-emerald-100/,
        );
      else await expectUnassessed(page, 0, "POST");
      for (const period of ["MID", "POST"] as Period[])
        await expectUnassessed(page, 1, period);
      const dock = page.locator("div.sticky.bottom-0");
      await expect(dock).toContainText("2 unsaved changes");
      await expect(dock.getByText("Completed", { exact: true })).toHaveCount(0);
      await page
        .getByRole("button", { name: "Save Assessment", exact: true })
        .click();
      await expect(dock.getByText("Completed", { exact: true })).toBeVisible();
      expect(
        calls.filter((call) => call.path === "/api/eccd/evaluate"),
      ).toEqual([
        {
          path: "/api/eccd/evaluate",
          method: "POST",
          query: "",
          body: {
            student_id: 101,
            testing_period: "PRE",
            assessment_date: "2026-09-01",
            evaluations: [
              { question_id: 1, testing_period: "PRE", answer: "DI-KAYA" },
              { question_id: 2, testing_period: "PRE", answer: "DI-KAYA" },
            ],
          },
        },
      ]);
      await page.reload();
      await page
        .getByRole("button", { name: "Assess Domain", exact: true })
        .first()
        .click();
      await page.locator("select").first().selectOption("101");
      await page.locator("select").nth(1).selectOption("MID");
      await expect(assessmentChoice(page, 0, "MID", midAnswer)).toHaveClass(
        midAnswer === "KAYA" ? /bg-emerald-600/ : /bg-rose-600/,
      );
      await expectUnassessed(page, 1, "MID");
      await expect(dock).toContainText("Saved: 1 / 2");
      await expect(dock).not.toContainText("unsaved change");
      await expect(dock.getByText("Completed", { exact: true })).toHaveCount(0);
      expect(
        await page.evaluate(() =>
          ["MID", "POST"].map((period) =>
            localStorage.getItem(`eccd_draft_101_${period}_1_7`),
          ),
        ),
      ).toEqual([null, null]);
    });
}

for (const width of [320, 768, 1280]) {
  test(`checklist provenance, granular progress and teacher confirmation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await prepareSavedAssessment(
      page,
      { 1: { PRE: "KAYA", MID: "DI-KAYA" }, 2: { PRE: "KAYA" } },
      (assessment) => {
        assessment.domains[0].questions[1].evaluator_roles = {
          PRE: "parent",
          MID: null,
          POST: null,
        };
        assessment.gradingDates = {
          PRE: "2026-09-01",
          MID: "2026-10-01",
          POST: null,
        };
      },
    );
    await page.goto("/teacher/eccdassessment");
    const card = page.getByLabel("Gross Motor Domain saved progress");
    await expect(card).toContainText("Saved: 2 / 2");
    await expect(card).toContainText("Completed");
    await page
      .getByRole("button", { name: "Assess Domain", exact: true })
      .first()
      .click();
    await page.locator("select").first().selectOption("101");
    const homeRow = page.locator("tbody tr").nth(1);
    await expect(
      homeRow.getByText("Home-Based", { exact: true }),
    ).toBeVisible();
    await expect(
      homeRow.getByText("Parent Assessed", { exact: true }),
    ).toBeVisible();
    const badgeBounds = await homeRow
      .locator("td")
      .first()
      .evaluate((cell) => {
        const rect = cell.getBoundingClientRect();
        return Array.from(cell.querySelectorAll(":scope > div span")).map(
          (badge) => {
            const box = badge.getBoundingClientRect();
            return box.left >= rect.left && box.right <= rect.right;
          },
        );
      });
    expect(badgeBounds).toEqual([true, true]);
    for (const cell of await homeRow.locator("td").all()) {
      expect(
        await cell.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
    }
    await expect(
      page.locator("tbody tr").first().getByText("Home-Based", { exact: true }),
    ).toHaveCount(0);
    const dock = page.locator("div.sticky.bottom-0");
    await expect(dock).toContainText("Saved: 2 / 2");
    await expect(dock.getByText("Completed", { exact: true })).toBeVisible();
    await assessmentChoice(page, 1, "PRE", "KAYA").click();
    await expect(dock).not.toContainText("unsaved change");
    await expect(dock.getByText("Completed", { exact: true })).toBeVisible();
    await assessmentChoice(page, 1, "PRE", "DI-KAYA").click();
    await expect(dock).toContainText("1 unsaved change");
    await expect(dock.getByText("Completed", { exact: true })).toHaveCount(0);
    await expect(
      homeRow.getByText("Parent Assessed", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Back to Domains", exact: true })
      .click();
    await expect(card).toContainText("Saved: 2 / 2");
    await expect(card).toContainText("1 unsaved change");
    await expect(card.getByText("Completed", { exact: true })).toHaveCount(0);
    await page
      .getByRole("button", { name: "Assess Domain", exact: true })
      .first()
      .click();
    await page.locator("select").first().selectOption("101");
    // Return to the saved answer; no-op drafts must not suppress MID inheritance.
    await assessmentChoice(page, 1, "PRE", "KAYA").click();
    await page.locator("select").nth(1).selectOption("MID");
    await expect(
      homeRow.getByText("Parent Assessed", { exact: true }),
    ).toHaveCount(0);
    await expect(dock).toContainText("Saved: 1 / 2");
    await expect(dock).not.toContainText("unsaved change");
    await expect(dock.getByText("Completed", { exact: true })).toHaveCount(0);
    await expect(page.locator("thead th").nth(2)).toContainText(
      "1 inherited (not saved)",
    );
    await page.locator("select").nth(1).selectOption("PRE");
    await assessmentChoice(page, 1, "PRE", "DI-KAYA").click();
    await page
      .getByRole("button", { name: "Save Assessment", exact: true })
      .click();
    await expect(
      page.getByText("Assessment Saved Successfully!", { exact: true }),
    ).toBeVisible();
    await expect(
      homeRow.getByText("Parent Assessed", { exact: true }),
    ).toHaveCount(0);
    await expect(
      homeRow.getByText("Home-Based", { exact: true }),
    ).toBeVisible();
    await expect(dock.getByText("Completed", { exact: true })).toBeVisible();
    const bounds = await homeRow
      .locator("td")
      .first()
      .evaluate((cell) => {
        const rect = cell.getBoundingClientRect();
        return {
          cellWidth: cell.clientWidth,
          contentWidth: cell.scrollWidth,
          badges: Array.from(cell.querySelectorAll("div span")).map((badge) => {
            const box = badge.getBoundingClientRect();
            return { inside: box.left >= rect.left && box.right <= rect.right };
          }),
        };
      });
    expect(bounds.contentWidth).toBeLessThanOrEqual(bounds.cellWidth);
    expect(bounds.badges.every((badge) => badge.inside)).toBe(true);
    await page
      .getByRole("button", { name: "Back to Domains", exact: true })
      .click();
    await expect(card).toContainText("Saved: 2 / 2");
    await expect(card).not.toContainText("unsaved change");
    await expect(card).toContainText("Completed");
    // A date-only edit retains saved counts but prevents false completion.
    await page
      .getByRole("button", { name: "Assess Domain", exact: true })
      .first()
      .click();
    await page.locator("select").first().selectOption("101");
    await page.locator('input[type="date"]').fill("2026-09-02");
    await expect(dock).toContainText("Saved: 2 / 2");
    await expect(dock).toContainText("Unsaved date change");
    await expect(dock.getByText("Completed", { exact: true })).toHaveCount(0);
    await page
      .getByRole("button", { name: "Back to Domains", exact: true })
      .click();
    await expect(card).toContainText("1 unsaved date change");
    await expect(card.getByText("Completed", { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test(`checklist grading uses parent fallback and excludes unsaved compatibility dates at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await prepareSavedAssessment(page, { 2: { PRE: "KAYA" } }, (assessment) => {
      assessment.periodDates = { PRE: null, MID: null, POST: null };
      assessment.gradingDates = { PRE: "2026-08-01", MID: null, POST: null };
      assessment.evalAges = { 1: { PRE: 9.9, MID: 9.9, POST: 9.9 } };
      assessment.domains[0].questions[1].evaluator_roles = { PRE: "parent" };
    });
    await openAssessment(page);
    await expect(
      page.getByText("Decimal Age: 5.3", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Grading Date: 08/01/2026", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("thead th").nth(1)).toContainText("Saved: 1 / 2");
    await expect(page.locator("thead th").nth(1)).not.toContainText(
      "Testing Date",
    );
    await expect(page.locator("thead th").nth(2)).not.toContainText("Age:");
    await page.locator('input[type="date"]').fill("2026-11-01");
    await expect(
      page.getByText("Decimal Age: 5.3", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("div.sticky.bottom-0")).toContainText(
      "Unsaved date change",
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Assess Domain", exact: true })
      .first()
      .click();
    await page.locator("select").first().selectOption("101");
    await expect(page.locator('input[type="date"]')).toHaveValue("2026-11-01");
    await expect(
      page.getByText("Decimal Age: 5.3", { exact: true }),
    ).toBeVisible();
    await page.locator("select").nth(1).selectOption("MID");
    await expect(page.getByText(/Decimal Age:/)).toHaveCount(0);
    await expect(page.locator("thead th").nth(2)).not.toContainText("Age:");
    await page
      .getByRole("button", { name: "Back to Domains", exact: true })
      .click();
    // Class totals remain in the selected period; virtual MID is not saved work.
    await expect(
      page.getByLabel("Gross Motor Domain saved progress"),
    ).toContainText("Mid-Test · Saved: 0 / 2");
    await expect(
      page.getByLabel("Gross Motor Domain saved progress"),
    ).not.toContainText("unsaved change");
  });
}

for (const width of [320, 1280]) {
  test(`saved-only per-question carry resets and explicit selected-period saves at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const calls = await prepareSavedAssessment(page, {
      1: { PRE: "KAYA", MID: "DI-KAYA" },
      2: { PRE: "KAYA" },
    });
    await openAssessment(page);
    await expect(assessmentChoice(page, 0, "POST", "KAYA")).not.toHaveClass(
      /bg-emerald-100/,
    );
    await expect(assessmentChoice(page, 1, "MID", "KAYA")).toHaveClass(
      /bg-emerald-100/,
    );
    await expect(assessmentChoice(page, 1, "POST", "KAYA")).toHaveClass(
      /bg-emerald-100/,
    );
    await assessmentChoice(page, 1, "PRE", "DI-KAYA").click();
    await expect(assessmentChoice(page, 1, "MID", "KAYA")).not.toHaveClass(
      /bg-emerald-100/,
    );
    await expect(assessmentChoice(page, 1, "POST", "KAYA")).not.toHaveClass(
      /bg-emerald-100/,
    );
    expect(
      await page.evaluate(() =>
        ["MID", "POST"].map((p) =>
          localStorage.getItem(`eccd_draft_101_${p}_1_7`),
        ),
      ),
    ).toEqual([null, null]);
    await page.locator("select").nth(1).selectOption("MID");
    await assessmentChoice(page, 1, "MID", "KAYA").click();
    await expect(assessmentChoice(page, 1, "POST", "KAYA")).not.toHaveClass(
      /bg-emerald-100/,
    );
    await page.locator("input[type=date]").fill("2026-10-14");
    await page
      .getByRole("button", { name: "Save Assessment", exact: true })
      .click();
    await expect(assessmentChoice(page, 1, "POST", "KAYA")).toHaveClass(
      /bg-emerald-100/,
    );
    await expect(
      page.getByRole("button", { name: "Save Assessment", exact: true }),
    ).toBeEnabled();
    await assessmentChoice(page, 1, "MID", "DI-KAYA").click();
    await expect(assessmentChoice(page, 1, "POST", "KAYA")).not.toHaveClass(
      /bg-emerald-100/,
    );
    await page
      .getByRole("button", { name: "Save Assessment", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Save Assessment", exact: true }),
    ).toBeEnabled();
    const saves = calls.filter((call) => call.path === "/api/eccd/evaluate");
    expect(saves).toHaveLength(2);
    for (const save of saves)
      expect(save.body).toMatchObject({ testing_period: "MID" });
    expect(saves[1].body).toMatchObject({
      evaluations: [
        { question_id: 1, testing_period: "MID", answer: "DI-KAYA" },
        { question_id: 2, testing_period: "MID", answer: "DI-KAYA" },
      ],
    });
    expect(
      await page.evaluate(() =>
        localStorage.getItem("eccd_draft_101_POST_1_7"),
      ),
    ).toBeNull();
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("eccd_draft_101_PRE_1_7")!).values
            .answers,
      ),
    ).toEqual({ 2: "DI-KAYA" });
  });

  test(`saved-only date edits and resets preserve explicit later drafts across reload at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const calls = await prepareSavedAssessment(page, {
      1: { PRE: "KAYA" },
      2: { PRE: "KAYA" },
    });
    await openAssessment(page);
    await page.locator("select").nth(1).selectOption("MID");
    await page.locator("input[type=date]").fill("2026-10-14");
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("eccd_draft_101_MID_1_7")!).values
            .answers,
      ),
    ).toEqual({});
    await page.locator("select").nth(1).selectOption("POST");
    await assessmentChoice(page, 1, "POST", "KAYA").click();
    await page.locator("select").nth(1).selectOption("MID");
    await assessmentChoice(page, 1, "MID", "DI-KAYA").click();
    await page.locator("select").nth(1).selectOption("PRE");
    await assessmentChoice(page, 0, "PRE", "DI-KAYA").click();
    await assessmentChoice(page, 1, "PRE", "DI-KAYA").click();
    await expect(assessmentChoice(page, 0, "MID", "KAYA")).not.toHaveClass(
      /bg-emerald-100/,
    );
    await expect(assessmentChoice(page, 0, "POST", "KAYA")).not.toHaveClass(
      /bg-emerald-100/,
    );
    await expect(assessmentChoice(page, 1, "MID", "DI-KAYA")).toHaveClass(
      /bg-rose-100/,
    );
    await expect(assessmentChoice(page, 1, "POST", "KAYA")).toHaveClass(
      /bg-emerald-100/,
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Assess Domain", exact: true })
      .first()
      .click();
    await page.locator("select").first().selectOption("101");
    await expect(assessmentChoice(page, 0, "MID", "KAYA")).not.toHaveClass(
      /bg-emerald-100/,
    );
    await expect(assessmentChoice(page, 0, "POST", "KAYA")).not.toHaveClass(
      /bg-emerald-100/,
    );
    await expect(assessmentChoice(page, 1, "MID", "DI-KAYA")).toHaveClass(
      /bg-rose-100/,
    );
    await expect(assessmentChoice(page, 1, "POST", "KAYA")).toHaveClass(
      /bg-emerald-100/,
    );
    expect(
      await page.evaluate(() =>
        Object.fromEntries(
          ["PRE", "MID", "POST"].map((p) => [
            p,
            JSON.parse(localStorage.getItem(`eccd_draft_101_${p}_1_7`)!).values
              .answers,
          ]),
        ),
      ),
    ).toEqual({
      PRE: { 1: "DI-KAYA", 2: "DI-KAYA" },
      MID: { 2: "DI-KAYA" },
      POST: { 2: "KAYA" },
    });
    expect(calls.some((call) => call.path === "/api/eccd/evaluate")).toBe(
      false,
    );
  });
}

test("delayed assessment confirmation cannot erase a newer draft revision", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/teacher/eccdassessment");
  await page
    .getByRole("button", { name: "Assess Domain", exact: true })
    .first()
    .click();
  await page.locator("select").first().selectOption("101");
  await expect(page.locator("table")).toBeVisible();
  const choose = () =>
    page
      .locator("tbody tr")
      .first()
      .getByRole("button", { name: "KAYA", exact: true })
      .first();
  await choose().click();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let saves = 0;
  await page.route("**/api/eccd/evaluate", async (route) => {
    saves++;
    await gate;
    await route.fulfill({ json: { success: true } });
  });
  await page
    .getByRole("button", { name: "Save Assessment", exact: true })
    .click();
  await expect.poll(() => saves).toBe(1);
  await page
    .locator("tbody tr")
    .first()
    .getByRole("button", { name: "DI-KAYA", exact: true })
    .first()
    .click();
  const revision = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("eccd_draft_101_PRE_1_7") || "null")
        ?.revision,
  );
  release();
  await expect(
    page.getByRole("button", { name: "Save Assessment", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("eccd_draft_101_PRE_1_7") || "null")
          ?.revision,
    ),
  ).toBe(revision);
  await expect(
    page
      .locator("tbody tr")
      .first()
      .getByRole("button", { name: "DI-KAYA", exact: true })
      .first(),
  ).toHaveClass(/bg-rose-600/);
  expect(saves).toBe(1);
});

for (const width of [320, 1280])
  for (const screen of ["dashboard", "eccdassessment"])
    test(`${screen} loading presentation at ${width}px`, async ({
      page,
      context,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const reference = await context.newPage();
      await reference.setViewportSize(page.viewportSize()!);
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      for (const target of [page, reference]) {
        await prepare(target);
        await target.route(
          screen === "dashboard"
            ? "**/api/teachers/dashboard-stats*"
            : "**/api/eccd/domains-progress*",
          async (route) => {
            await gate;
            await route.fallback();
          },
        );
        await target.goto(
          (target === reference ? "http://localhost:5187" : "") +
            "/teacher/" +
            screen +
            "?role=admin",
        );
        await expect(
          target.getByRole("heading", { name: titles[screen], exact: true }),
        ).toBeVisible();
        if (screen === "dashboard")
          await expect(
            target.getByText("Loading...", { exact: true }),
          ).toBeVisible();
        else await expect(target.getByRole("progressbar")).toBeVisible();
        await ready(target);
      }
      try {
        await compare(
          page.locator("main"),
          reference.locator("main"),
          `loading-${screen}-${width}`,
          info,
        );
      } finally {
        release();
        await reference.close();
      }
    });

for (const width of [320, 600, 900, 1200, 1280]) {
  test(`archived roster visual parity at ${width}px`, async ({
    page,
    context,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const reference = await context.newPage();
    await openPair(page, reference, "students", { archived: true });
    for (const target of [page, reference]) {
      await target
        .getByRole("button", { name: "View Archive", exact: true })
        .click();
      await expect(target.getByRole("dialog")).toContainText(/Jordan/i);
      await ready(target);
    }
    await compare(
      page.getByRole("dialog"),
      reference.getByRole("dialog"),
      `archived-roster-${width}`,
      info,
    );
    await reference.close();
  });
  test(`complete account card visual parity at ${width}px`, async ({
    page,
    context,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const reference = await context.newPage();
    await openPair(page, reference, "settings");
    for (const target of [page, reference]) {
      await target
        .locator("main .MuiPaper-root")
        .last()
        .scrollIntoViewIfNeeded();
      await ready(target);
    }
    await compare(
      page.locator("main .MuiPaper-root").last(),
      reference.locator("main .MuiPaper-root").last(),
      `account-card-${width}`,
      info,
    );
    await reference.close();
  });
}

for (const width of [320, 1280])
  test(`selected answers and PRE MID POST presentation at ${width}px`, async ({
    page,
    context,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const reference = await context.newPage();
    await openPair(page, reference, "eccdassessment");
    for (const target of [page, reference]) {
      await target
        .getByRole("button", { name: "Assess Domain", exact: true })
        .first()
        .click();
      await target.locator("select").first().selectOption("101");
      await expect(target.locator("table")).toBeVisible();
    }
    for (const [index, period] of ["PRE", "MID", "POST"].entries()) {
      for (const target of [page, reference]) {
        await target.locator("select").nth(1).selectOption(period);
        await target.locator("input[type=date]").fill(`2026-10-${13 + index}`);
        await target
          .locator("tbody tr")
          .first()
          .getByRole("button", {
            name: index === 1 ? "DI-KAYA" : "KAYA",
            exact: true,
          })
          .nth(index)
          .click();
        await ready(target);
      }
      await compare(
        page.locator("main"),
        reference.locator("main"),
        `selected-${period}-${width}`,
        info,
      );
    }
    await reference.close();
  });

test("assessment pressed control and back-arrow hover match the reference", async ({
  page,
  context,
}, info) => {
  const reference = await context.newPage();
  await openPair(page, reference, "eccdassessment");
  for (const target of [page, reference]) {
    await target
      .getByRole("button", { name: "Assess Domain", exact: true })
      .first()
      .click();
    await target.locator("select").first().selectOption("101");
    await expect(target.locator("table")).toBeVisible();
    await target.locator("input[type=date]").fill("2026-10-13");
    await ready(target);
    const bounds = await target
      .locator("tbody tr")
      .first()
      .getByRole("button", { name: "KAYA", exact: true })
      .first()
      .boundingBox();
    await target.mouse.move(
      bounds!.x + bounds!.width / 2,
      bounds!.y + bounds!.height / 2,
    );
    await target.mouse.down();
  }
  await compare(
    page.locator("main"),
    reference.locator("main"),
    "matrix-pressed",
    info,
  );
  for (const target of [page, reference]) {
    await target.mouse.up();
    await target
      .getByRole("button", { name: "Back to Domains", exact: true })
      .hover();
  }
  await compare(
    page.locator("main"),
    reference.locator("main"),
    "matrix-back-hover",
    info,
  );
  await reference.close();
});

test("saved period bounds reject equal dates and protect later saved evaluations", async ({
  page,
}) => {
  const calls = await prepare(page);
  await page.route("**/api/eccd/assessment/101", (route) =>
    route.fulfill({
      json: {
        student_id: 101,
        masked_lrn: student.masked_lrn,
        domains: domains.map((domain) => ({
          ...domain,
          questions: domain.questions.map((question) => ({
            ...question,
            answers: { PRE: "DI-KAYA", MID: "DI-KAYA", POST: "DI-KAYA" },
          })),
        })),
        periodDates: {
          PRE: "2026-09-01",
          MID: "2026-10-01",
          POST: "2026-11-01",
        },
        evalAges: { 1: { PRE: 5.4, MID: 5.5, POST: 5.6 } },
        student_birth_date: student.date_of_birth,
      },
    }),
  );
  await page.goto("/teacher/eccdassessment");
  await page
    .getByRole("button", { name: "Assess Domain", exact: true })
    .first()
    .click();
  await page.locator("select").first().selectOption("101");
  await expect(page.locator("table")).toBeVisible();
  await page
    .locator("tbody tr")
    .first()
    .getByRole("button", { name: "KAYA", exact: true })
    .first()
    .click();
  await expect(
    page
      .locator("tbody tr")
      .first()
      .getByRole("button", { name: "DI-KAYA", exact: true })
      .nth(2),
  ).toHaveClass(/bg-rose-100/);
  await page.locator("select").nth(1).selectOption("MID");
  await expect(page.locator("input[type=date]")).toHaveAttribute(
    "min",
    "2026-09-02",
  );
  await expect(page.locator("input[type=date]")).toHaveAttribute(
    "max",
    "2026-10-31",
  );
  await page.locator("input[type=date]").fill("2026-09-01");
  await expect(
    page.getByRole("button", { name: "Save Assessment", exact: true }),
  ).toBeDisabled();
  expect(calls.some((call) => call.path === "/api/eccd/evaluate")).toBe(false);
  await page.locator("input[type=date]").fill("2026-10-02");
  await expect(
    page.getByRole("button", { name: "Save Assessment", exact: true }),
  ).toBeEnabled();
});

test("chart controls send selected section, domain and period; roster search narrows locally", async ({
  page,
}) => {
  const calls = await prepare(page, { chart: true });
  await page.goto("/teacher/dashboard");
  await page.getByRole("combobox", { name: "Domain", exact: true }).click();
  await page
    .getByRole("option", { name: "Fine Motor Domain", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Testing Period", exact: true })
    .click();
  await page.getByRole("option", { name: "Post-Test", exact: true }).click();
  await expect
    .poll(() =>
      calls.some(
        (call) =>
          call.path === "/api/teachers/dashboard-pie" &&
          new URLSearchParams(call.query).get("domain") ===
            "Fine Motor Domain" &&
          new URLSearchParams(call.query).get("period") === "POST" &&
          new URLSearchParams(call.query).get("section") === "Section A",
      ),
    )
    .toBeTruthy();
  await page.goto("/teacher/students");
  await expect(page.locator("tbody")).toContainText(/Avery/i);
  await page.getByPlaceholder("Search Students").fill("missing");
  await expect(page.locator("tbody")).not.toContainText(/Avery/i);
  await page.getByPlaceholder("Search Students").fill("Avery");
  await expect(page.locator("tbody")).toContainText(/Avery/i);
});

test("single and bulk exports honor integer routes and server filenames", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/teacher/eccdassessment");
  const paths: string[] = [];
  await page.route("**/api/teachers/download**", (route) => {
    paths.push(new URL(route.request().url()).pathname);
    return route.fulfill({
      body: Buffer.from("synthetic export"),
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": 'attachment; filename="server-checklist.xlsx"',
        "access-control-expose-headers": "Content-Disposition",
      },
    });
  });
  await page
    .getByRole("button", { name: "Download Records", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Download Single Student", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Select Student", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Avery Reyes (********1234)", exact: true })
    .click();
  const single = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  expect((await single).suggestedFilename()).toBe("server-checklist.xlsx");
  await expect(
    page.getByRole("button", { name: "Download Records", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Download Records", exact: true })
    .click();
  const bulk = page.waitForEvent("download");
  await page
    .getByRole("menuitem", { name: "Download All Students (ZIP)", exact: true })
    .click();
  await bulk;
  expect(paths).toEqual([
    "/api/teachers/download/101",
    "/api/teachers/download-all",
  ]);
});

test("archive cancellation avoids writes and restore keeps integer student identity", async ({
  page,
}) => {
  const calls = await prepare(page, { archived: true });
  await page.goto("/teacher/students");
  await page.getByRole("button", { name: "Archive All", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(calls.some((call) => call.path === "/api/students/archive-all")).toBe(
    false,
  );
  await page.getByRole("button", { name: "View Archive", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(/Jordan/i);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTitle("Restore Student", { exact: true }).click();
  await expect
    .poll(
      () =>
        calls.filter(
          (call) =>
            call.path === "/api/students/202/unarchive" &&
            call.method === "PUT",
        ).length,
    )
    .toBe(1);
});
