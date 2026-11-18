import {
  mockSession,
  expectNoStoredCredentials,
  sessionFor,
  setRamSession,
} from "./helpers/session";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { Draft } from "../src/utils/drafts";
import type { Assessment, Domain, SessionUser } from "../src/types";
import type { Answer } from "../src/types";
import type { SystemSettings } from "../src/context/SettingsContext";

const modulePath = "/src/utils/drafts.ts";
const teacherKey = "eccd_draft_1_PRE_1_2";
const teacher: SessionUser = {
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

test("retired branding uses the bundled login background", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    await route.fulfill({
      json: {
        system_title: "Test school",
        primary_color: "#2563eb",
        login_background: "https://retired.invalid/background.png",
      },
    });
  });
  await mockSession(page, null);
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Log In", exact: true }),
  ).toBeVisible();
  await expect(page.locator("main > [aria-hidden=true]").first()).toHaveCSS(
    "background-image",
    /background_pic/,
  );
});

test("retired branding preserves old settings drafts and submits only current fields", async ({
  page,
}) => {
  const key = "ames_draft_1_school_settings";
  const settings: SystemSettings = {
    system_title: "Test school",
    system_name: "Server school",
    principal_name: "Principal",
    chairman_name: "Chairman",
    primary_color: "#2563eb",
    logo_url: "",
    current_school_year: "2026-2027",
    school_year_start_month: 8,
    previous_school_year: null,
    last_rollover_timestamp: null,
    canRevertSchoolYear: false,
    daysRemaining: 0,
  };
  await page.addInitScript(
    ({ draftKey, initial }) => {
      if (!localStorage.getItem(draftKey))
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            owner_id: 1,
            revision: "legacy-branding-revision",
            is_pending_sync: false,
            values: {
              ...initial,
              system_name: undefined,
              school_name: "Unsaved school",
              existing_logo_url: "",
              secondary_color: "#abcdef",
              existing_profile_pic_url: "old-profile",
            },
          }),
        );
    },
    {
      draftKey: key,
      initial: settings,
    },
  );
  const submissions: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/settings/update") {
      submissions.push(route.request().postData() || "");
      await route.fulfill({ json: { message: "Saved", settings } });
    } else if (path === "/api/settings")
      await route.fulfill({ json: settings });
    else await route.fulfill({ json: {} });
  });
  await mockSession(page, { ...teacher, id: 1, role: "super-admin" });
  await page.goto("/super-admin/settings");
  const school = page.getByRole("textbox", { name: "System Name:" });
  await expect(school).toHaveValue("Unsaved school");
  await school.fill("Updated offline school");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    }),
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page
      .getByText(
        "Your draft is saved on this device. Reconnect and submit again.",
      )
      .first(),
  ).toBeVisible();
  expect(submissions).toHaveLength(0);
  await page.reload();
  await expect(school).toHaveValue("Updated offline school");
  expect(submissions).toHaveLength(0);
  expect(
    await page.evaluate((draftKey) => localStorage.getItem(draftKey), key),
  ).not.toBeNull();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("System settings saved.", { exact: true }),
  ).toBeVisible();
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toContain("Updated offline school");
  expect(submissions[0]).not.toMatch(
    /school_name|secondary_color|profile_pic|profilePic|login_background/,
  );
  expect(
    await page.evaluate((draftKey) => localStorage.getItem(draftKey), key),
  ).toBeNull();
});

test("teacher confirmations, reverted edits and corrections send intent and display Philippine dates", async ({
  page,
}, testInfo) => {
  const parentDate = "2026-11-04T16:30:00Z";
  const teacherDate = "2026-11-05T16:30:00Z";
  let saved: Answer = "KAYA";
  let corrected = false;
  const submissions: {
    edited_question_ids: number[];
    evaluations: { answer: Answer }[];
  }[] = [];
  const domain = (): Domain => ({
    domain_id: 1,
    domain_name: "Gross Motor",
    questions: [
      {
        question_id: 11,
        domain_id: 1,
        question_text: "Plays safely at home",
        sequence_order: 1,
        is_home_based: true,
        answers: { PRE: saved, MID: null, POST: null },
        evaluator_roles: { PRE: corrected ? "teacher" : "parent" },
        parent_submitted_at: { PRE: parentDate },
        teacher_marked_at: { PRE: corrected ? teacherDate : null },
      },
    ],
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path === "/api/eccd/students")
      json = [
        {
          student_id: 1,
          first_name: "Sample",
          last_name: "Child",
          section_id: 1,
          is_active: true,
        },
      ];
    else if (path === "/api/sections/")
      json = [{ section_id: 1, section_name: "Test A" }];
    else if (path === "/api/teachers/dashboard-filters")
      json = {
        sections: ["Test A"],
        schoolYears: ["2026-2027"],
        currentSchoolYear: "2026-2027",
      };
    else if (path === "/api/teachers/access-controls")
      json = {
        section_id: 1,
        section_name: "Test A",
        allow_eccd_question_management: false,
      };
    else if (path === "/api/eccd/domains-progress") json = [domain()];
    else if (path === "/api/eccd/section/1/period-gates")
      json = {
        section_id: 1,
        required_question_count: 1,
        prerequisites: { PRE: [], MID: [] },
      };
    else if (path.startsWith("/api/eccd/assessment/"))
      json = {
        student_id: 1,
        masked_lrn: "********0001",
        domains: [domain()],
        evalAges: {},
        periodDates: { PRE: "2026-11-04", MID: null, POST: null },
        student_birth_date: "2021-01-01",
      } satisfies Assessment;
    else if (path === "/api/eccd/evaluate") {
      const payload = route
        .request()
        .postDataJSON() as (typeof submissions)[number];
      submissions.push(payload);
      if (
        saved !== payload.evaluations[0].answer &&
        !payload.edited_question_ids.includes(11)
      ) {
        await route.fulfill({
          status: 409,
          json: {
            detail:
              "Saved home answers have changed. Refresh and review before correcting them.",
          },
        });
        return;
      }
      if (saved !== payload.evaluations[0].answer) corrected = true;
      saved = payload.evaluations[0].answer;
    } else if (path === "/api/messages/contacts")
      json = { myId: 2, contacts: [] };
    else if (path === "/api/messages/unread-count") json = { unreadCount: 0 };
    await route.fulfill({ json });
  });
  await mockSession(page, teacher);
  await page.goto(
    "/teacher/eccdassessment?student_id=1&period=PRE&domain_id=1",
  );
  await expect(
    page.getByText("Parent Assessed · Nov 5, 2026", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  const row = page.getByRole("row").filter({ hasText: "Plays safely at home" });
  const save = page.getByRole("button", {
    name: "Save Assessment",
    exact: true,
  });
  await save.click();
  await expect.poll(() => submissions.length).toBe(1);
  expect(submissions[0].edited_question_ids).toEqual([]);
  await expect(save).toBeEnabled();
  await expect(
    page.getByText("Parent Assessed · Nov 5, 2026", { exact: true }),
  ).toBeVisible();
  await row
    .getByRole("button", { name: "DI-KAYA", exact: true })
    .first()
    .click();
  await row.getByRole("button", { name: "KAYA", exact: true }).first().click();
  await save.click();
  await expect.poll(() => submissions.length).toBe(2);
  expect(submissions[1].edited_question_ids).toEqual([]);
  await expect(save).toBeEnabled();
  await row
    .getByRole("button", { name: "DI-KAYA", exact: true })
    .first()
    .click();
  await save.click();
  await expect.poll(() => submissions.length).toBe(3);
  expect(submissions[2].edited_question_ids).toEqual([11]);
  const badge = page.getByText("Teacher Assessed · Nov 6, 2026", {
    exact: true,
  });
  await expect(badge).toBeVisible();
  await expect(save).toBeEnabled();
  await badge.hover();
  await expect(page.getByRole("tooltip")).toContainText(
    "Parent submitted · Nov 5, 2026",
  );
  // Another staff save arrives after this checklist was loaded.
  saved = "KAYA";
  await save.click();
  const conflictAlert = page.getByRole("alert").filter({
    hasText:
      "Saved home answers have changed. Refresh and review before correcting them.",
  });
  await expect(conflictAlert).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), teacherKey),
  ).not.toBeNull();
  // The 409 message appears before the assessment/period refresh finishes.
  await expect(save).toBeEnabled();
  await conflictAlert
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(conflictAlert).toBeHidden();
  await row
    .getByRole("button", { name: "DI-KAYA", exact: true })
    .first()
    .click();
  await save.click();
  await expect.poll(() => submissions.length).toBe(5);
  expect(submissions[4].edited_question_ids).toEqual([11]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await badge.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("teacher-attribution.png"),
    fullPage: true,
  });
  if (testInfo.project.name === "desktop") {
    await page.setViewportSize({ width: 768, height: 1024 });
    await badge.scrollIntoViewIfNeeded();
    await expect(badge).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: testInfo.outputPath("teacher-attribution-tablet.png"),
      fullPage: true,
    });
  }
});

function queued(
  path = "/api/eccd/evaluate",
  method: "post" | "put" = "post",
): Draft<unknown> {
  return {
    owner_id: 2,
    values: { answers: { 11: "KAYA" }, evaluation_date: "2026-10-01" },
    revision: crypto.randomUUID(),
    is_pending_sync: true,
    request: {
      path,
      method,
      data: {
        student_id: 1,
        testing_period: "PRE",
        assessment_date: "2026-10-01",
        evaluations: [
          { question_id: 11, testing_period: "PRE", answer: "KAYA" },
        ],
      },
    },
  };
}

async function replay(page: Page) {
  await page.evaluate(async (path) => {
    window.dispatchEvent(new Event("online"));
    const { syncDrafts } = await import(path);
    await syncDrafts(2);
  }, modulePath);
}

test("shared replay dispatches only teacher ECCD and preserves every other queued record", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route("**/api/**", async (route) => {
    if (route.request().method() !== "GET")
      requests.push(new URL(route.request().url()).pathname);
    await route.fulfill({ json: {} });
  });
  await mockSession(page, null);
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Log In", exact: true }),
  ).toBeVisible();
  await setRamSession(page, sessionFor(teacher));
  const retained = Object.fromEntries(
    [
      "/api/eccd/parent/evaluate",
      "/api/parents/children/link",
      "/api/parents/children/1",
      "/api/messages/send",
      "/api/students/",
      "/api/settings/update",
      "/api/chairman/students/transfer",
      "/api/teachers/import-students",
    ].map((path, index) => [`ames_draft_2_form_${index}`, queued(path)]),
  );
  Object.assign(retained, {
    eccd_draft_1_PRE_1_home_2: queued("/api/eccd/parent/evaluate"),
    eccd_draft_1_PRE_2_2: queued("/api/eccd/evaluate?retry=true"),
    eccd_draft_1_PRE_3_2: queued("/api/eccd/evaluate", "put"),
    eccd_draft_1_PRE_4_2: { ...queued(), owner_id: 99 },
    eccd_draft_99_PRE_1_2: queued(),
    eccd_draft_1_MID_1_2: queued(),
    eccd_draft_1_PRE_1_99: { ...queued(), owner_id: 99 },
    ames_draft_2_wrong_key: queued(),
    eccd_draft_1_PRE_5_2: queued("https://example.com/api/eccd/evaluate"),
  });
  await page.evaluate(
    ({ records, valid, key }) => {
      for (const [name, draft] of Object.entries(records))
        localStorage.setItem(name, JSON.stringify(draft));
      localStorage.setItem(key, JSON.stringify(valid));
    },
    { records: retained, valid: queued(), key: teacherKey },
  );
  await replay(page);
  expect(requests).toEqual(["/api/eccd/evaluate"]);
  for (const [key, draft] of Object.entries(retained)) {
    expect(
      await page.evaluate(
        (name) => JSON.parse(localStorage.getItem(name) || "null"),
        key,
      ),
    ).toEqual(draft);
  }
  expect(
    await page.evaluate((key) => localStorage.getItem(key), teacherKey),
  ).toBeNull();
  await replay(page);
  expect(requests).toHaveLength(1);
});

for (const session of [
  "parent",
  "chairman",
  "other-owner",
  "no-token",
  "offline",
  "legacy-storage-only",
] as const) {
  test(`${session} cannot replay a teacher-shaped queued record`, async ({
    page,
  }) => {
    let submissions = 0;
    await page.route("**/api/**", async (route) => {
      if (route.request().method() === "POST") submissions++;
      await route.fulfill({ json: {} });
    });
    await mockSession(page, null);
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: "Log In", exact: true }),
    ).toBeVisible();
    const draft = queued();
    const user: SessionUser = {
      ...teacher,
      role:
        session === "parent"
          ? "user"
          : session === "chairman"
            ? "super-admin"
            : "admin",
      id: session === "other-owner" ? 99 : 2,
    };
    if (session !== "legacy-storage-only" && session !== "no-token")
      await setRamSession(page, sessionFor(user));
    await page.evaluate(
      ({ account, record, key, mode }) => {
        if (mode === "legacy-storage-only") {
          localStorage.setItem("user", JSON.stringify(account));
          localStorage.setItem("token", "obsolete-storage-token");
        }
        if (mode === "offline")
          Object.defineProperty(navigator, "onLine", {
            configurable: true,
            value: false,
          });
        localStorage.setItem(key, JSON.stringify(record));
      },
      { account: teacher, record: draft, key: teacherKey, mode: session },
    );
    await replay(page);
    expect(submissions).toBe(0);
    expect(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) || "null"),
        teacherKey,
      ),
    ).toEqual(draft);
  });
}

test("teacher replay retains a dropped request and confirms it on the next reconnect", async ({
  page,
}) => {
  let fail = true;
  let submissions = 0;
  await page.route("**/api/**", async (route) => {
    if (route.request().method() === "POST") {
      submissions++;
      if (fail) return route.abort("failed");
    }
    await route.fulfill({ json: {} });
  });
  await mockSession(page, null);
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Log In", exact: true }),
  ).toBeVisible();
  await setRamSession(page, sessionFor(teacher));
  const draft = queued();
  await page.evaluate(
    ({ record, key }) => {
      localStorage.setItem(key, JSON.stringify(record));
    },
    { record: draft, key: teacherKey },
  );
  await replay(page);
  expect(submissions).toBe(1);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      teacherKey,
    ),
  ).toMatchObject({ ...draft });
  fail = false;
  await replay(page);
  expect(submissions).toBe(2);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), teacherKey),
  ).toBeNull();
});

test("a teacher replay confirmation preserves newer edits and stops after an account change", async ({
  page,
}) => {
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let submissions = 0;
  let firstStudent = 0;
  await page.route("**/api/**", async (route) => {
    if (route.request().method() === "POST") {
      submissions++;
      firstStudent = route.request().postDataJSON().student_id;
      await pending;
    }
    await route.fulfill({ json: {} });
  });
  await mockSession(page, null);
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Log In", exact: true }),
  ).toBeVisible();
  await setRamSession(page, sessionFor(teacher));
  await page.evaluate(
    ({ draft, key }) => {
      localStorage.setItem(key, JSON.stringify(draft));
      localStorage.setItem(
        "eccd_draft_2_PRE_1_2",
        JSON.stringify({
          ...draft,
          request: {
            ...draft.request,
            data: {
              ...(draft.request!.data as Record<string, unknown>),
              student_id: 2,
            },
          },
        }),
      );
    },
    { draft: queued(), key: teacherKey },
  );
  const replaying = replay(page);
  await expect.poll(() => submissions).toBe(1);
  const firstKey = `eccd_draft_${firstStudent}_PRE_1_2`;
  await page.evaluate((key) => {
    const draft = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(
      key,
      JSON.stringify({
        ...draft,
        revision: "newer-edit",
        is_pending_sync: false,
      }),
    );
  }, firstKey);
  await setRamSession(page, sessionFor({ ...teacher, id: 99 }));
  release();
  await replaying;
  expect(submissions).toBe(1);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).revision,
      firstKey,
    ),
  ).toBe("newer-edit");
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      `eccd_draft_${firstStudent === 1 ? 2 : 1}_PRE_1_2`,
    ),
  ).not.toBeNull();
});

test("teacher ECCD answers and dates survive offline student switching and reload, then replay", async ({
  page,
}) => {
  const domain: Domain = {
    domain_id: 1,
    domain_name: "Gross Motor",
    questions: [
      {
        question_id: 11,
        domain_id: 1,
        question_text: "Runs safely",
        sequence_order: 1,
        answers: { PRE: null, MID: null, POST: null },
      },
    ],
  };
  const submissions: unknown[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path === "/api/eccd/students")
      json = [1, 2].map((id) => ({
        student_id: id,
        first_name: `Student ${id}`,
        last_name: "Test",
        full_name: `Student ${id} Test`,
        section_id: 1,
        is_active: true,
      }));
    else if (path === "/api/sections/")
      json = [{ section_id: 1, section_name: "Test A" }];
    else if (path === "/api/teachers/dashboard-filters")
      json = {
        sections: ["Test A"],
        schoolYears: ["2026-2027"],
        currentSchoolYear: "2026-2027",
      };
    else if (path === "/api/teachers/access-controls")
      json = {
        section_id: 1,
        section_name: "Test A",
        allow_eccd_question_management: false,
      };
    else if (path === "/api/eccd/domains-progress") json = [domain];
    else if (path === "/api/eccd/section/1/period-gates")
      json = {
        section_id: 1,
        required_question_count: 1,
        prerequisites: { PRE: [], MID: [] },
      };
    else if (path.startsWith("/api/eccd/assessment/"))
      json = {
        student_id: Number(path.split("/").at(-1)),
        masked_lrn: "********0001",
        domains: [domain],
        evalAges: {},
        periodDates: { PRE: null, MID: null, POST: null },
        student_birth_date: "2021-01-01",
      } satisfies Assessment;
    else if (path === "/api/eccd/evaluate")
      submissions.push(route.request().postDataJSON());
    else if (path === "/api/messages/contacts")
      json = { myId: 2, contacts: [] };
    else if (path === "/api/messages/unread-count") json = { unreadCount: 0 };
    await route.fulfill({ json });
  });
  const url = "/teacher/eccdassessment?student_id=1&period=PRE&domain_id=1";
  await mockSession(page, teacher);
  await page.goto(url);
  const answer = page
    .getByRole("row")
    .filter({ hasText: "Runs safely" })
    .getByRole("button", { name: "KAYA", exact: true })
    .first();
  await expect(answer).toBeEnabled();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    window.dispatchEvent(new Event("offline"));
  });
  await expect(page.getByText("Offline", { exact: true })).toBeVisible();
  await answer.click();
  await page
    .getByRole("button", { name: "Save Assessment", exact: true })
    .click();
  const snapshot = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    teacherKey,
  );
  expect(snapshot.is_pending_sync).toBe(true);
  expect(snapshot.values.answers[11]).toBe("KAYA");
  expect(submissions).toHaveLength(0);
  await page.getByRole("button", { name: "Next Student", exact: true }).click();
  await expect(answer).not.toHaveClass(/bg-emerald-600/);
  await page
    .getByRole("button", { name: "Previous Student", exact: true })
    .click();
  await expect(answer).toHaveClass(/bg-emerald-600/);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    }),
  );
  await page.reload();
  await expect(
    page.getByText(
      "Waiting for a connection to restore your session. Your drafts are safe.",
    ),
  ).toBeVisible();
  expect(submissions).toHaveLength(0);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).values,
      teacherKey,
    ),
  ).toEqual(snapshot.values);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    window.dispatchEvent(new Event("online"));
  });
  await expect.poll(() => submissions.length).toBe(1);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), teacherKey))
    .toBeNull();
  await expect(page.getByText("Online", { exact: true })).toBeVisible();
  await expectNoStoredCredentials(page);
  expect(submissions[0]).toMatchObject({
    student_id: 1,
    testing_period: "PRE",
    assessment_date: snapshot.values.evaluation_date,
  });
});
