import { test, expect } from "@playwright/test";
import type { Page, Locator, TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

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
  allow_parent_view_eccd_pre: true,
  allow_parent_view_eccd_mid: false,
  allow_parent_view_eccd_post: false,
  allow_parent_edit_student_info: true,
  allow_parent_edit_home_based_eccd: true,
};
const student = {
  student_id: 101,
  masked_lrn: "********1234",
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
  num_of_siblings: 1,
  birth_order: "1",
  profile_completeness: 75,
  parent_names: "Jamie Reyes",
  parents: [],
  teacher_fname: "Divina C.",
  teacher_lname: "Carpio",
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
const periods = ["PRE", "MID", "POST"] as const;
const domains = [
  "Gross Motor",
  "Fine Motor",
  "Self-Help",
  "Receptive Language",
  "Expressive Language",
  "Cognitive",
  "Socio-Emotional",
].map((domain_name, index) => ({
  domain_id: index + 1,
  domain_name,
  pre_progress: 50,
  mid_progress: null,
  post_progress: null,
  questions: [
    {
      question_id: index + 1,
      domain_id: index + 1,
      domain_name,
      question_text: "Performs this developmental skill independently at home.",
      sequence_order: 1,
      is_home_based: true,
      answers: { PRE: "DI-KAYA", MID: null, POST: null },
    },
  ],
}));
const contacts = [
  {
    id: 4,
    name: "Teacher Divina C. Carpio",
    latest_message_time: "2026-10-01T02:30:00Z",
  },
  { id: 5, name: "Teacher Alex Santos", latest_message_time: null },
];
const messages = [
  {
    message_id: 1,
    teacher_id: 4,
    parent_id: 9,
    sender_role: "teacher",
    body: "Avery is making good progress in class.",
    created_at: "2026-10-01T02:30:00Z",
    is_read: false,
  },
  {
    message_id: 2,
    teacher_id: 4,
    parent_id: 9,
    sender_role: "parent",
    body: "Thank you! We will practise at home.",
    created_at: "2026-10-01T02:31:00Z",
    is_read: true,
  },
];
interface Fixture {
  locked?: boolean;
  hidden?: boolean;
  empty?: boolean;
  mastered?: boolean;
  multiple?: boolean;
  notEvaluated?: boolean;
}
interface Call {
  path: string;
  method: string;
  body: unknown;
  authorization?: string;
}
const runtimeErrors = new WeakMap<Page, string[]>();
test.afterEach(async ({ context }) => {
  for (const page of context.pages())
    expect(runtimeErrors.get(page) || []).toEqual([]);
});
async function prepare(page: Page, fixture: Fixture = {}) {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  const calls: Call[] = [];
  const access = {
    ...permissions,
    allow_parent_view_student_info: !fixture.hidden,
    allow_parent_edit_student_info: !fixture.locked,
    allow_parent_edit_home_based_eccd: !fixture.locked,
  };
  await page.addInitScript(() => {
    if (!localStorage.getItem("token")) {
      localStorage.setItem(
        "user",
        JSON.stringify({
          id: 7,
          username: "Jamie Reyes",
          email: "parent@example.test",
          role: "user",
          is_first_login: 0,
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
    const legacy = page.url().includes(":5187");
    calls.push({
      path,
      method: request.method(),
      body: request.postData() ? request.postDataJSON() : null,
      authorization: request.headers()["authorization"],
    });
    const child = {
      ...student,
      ...access,
      ...(legacy
        ? {
            allow_parent_home_based_edit:
              access.allow_parent_edit_home_based_eccd,
          }
        : {}),
    };
    const summary = Object.fromEntries(
      periods.map((period) => {
        const released = period === "PRE";
        return [
          period,
          {
            period,
            isReleased: released,
            is_published: released,
            isEvaluated: released && !fixture.notEvaluated,
            assessmentDate: released ? "2026-09-01" : null,
            decimalAge: released ? 5.4 : null,
            standardScore: released ? 100 : null,
            interpretation: released ? "Average Development" : null,
            sumOfScaledScores: released ? 70 : null,
            rawScores: released ? { GM: 1 } : null,
            scaledScores: released ? { GM: 10 } : null,
          },
        ];
      }),
    );
    const data =
      path === "/api/settings"
        ? settings
        : path === "/api/students/my-child"
          ? fixture.empty
            ? []
            : fixture.multiple
              ? [
                  child,
                  {
                    ...child,
                    student_id: 202,
                    first_name: "Jordan",
                    full_name: "Jordan Lee Reyes",
                    masked_lrn: "********5678",
                  },
                ]
              : [child]
          : /^\/api\/students\/\d+$/.test(path)
            ? {
                ...child,
                ...(path.endsWith("/202")
                  ? {
                      student_id: 202,
                      first_name: "Jordan",
                      full_name: "Jordan Lee Reyes",
                      masked_lrn: "********5678",
                    }
                  : {}),
              }
            : path.includes("dashboard-stats")
              ? {
                  currentPhase: "Pre-Test",
                  latestPhase: "PRE",
                  excelsIn: "Gross Motor",
                  needsSupportIn: "Fine Motor",
                  assessmentMastered: !!fixture.mastered,
                  totalKaya: 7,
                  totalDiKaya: 7,
                  is_published: true,
                }
              : path.includes("domains-progress")
                ? domains
                : path.includes("/parent/assessment/")
                  ? {
                      student_id: Number(path.split("/").at(-1)),
                      masked_lrn: student.masked_lrn,
                      student_birth_date: student.date_of_birth,
                      permissions: {
                        ...access,
                        ...(legacy
                          ? {
                              allow_home_based_edit:
                                access.allow_parent_edit_home_based_eccd,
                            }
                          : {}),
                      },
                      can_edit_home_based:
                        access.allow_parent_edit_home_based_eccd,
                      domains,
                      evalAges: {},
                      periodDates: { PRE: "2026-09-01", MID: null, POST: null },
                      summary,
                      matrix: domains.map((d, i) => ({
                        domain_id: d.domain_id,
                        domain_name: d.domain_name,
                        domain_code: ["GM", "FM", "SH", "RL", "EL", "C", "SE"][
                          i
                        ],
                        scores: { PRE: 10, MID: null, POST: null },
                      })),
                      homeBasedChecklist: domains.flatMap((d) => d.questions),
                    }
                  : path.endsWith("/contacts")
                    ? { myId: 9, contacts: fixture.empty ? [] : contacts }
                    : path.endsWith("/history")
                      ? legacy
                        ? messages.map((m) => ({
                            ...m,
                            message_body: m.body,
                            sent_at: m.created_at,
                          }))
                        : messages
                      : path.endsWith("/unread-count") ||
                          path.endsWith("/unread")
                        ? { unreadCount: 2 }
                        : path.endsWith("/send")
                          ? {
                              ...messages[1],
                              message_id: 3,
                              body: request.postDataJSON().body,
                            }
                          : { success: true };
    await route.fulfill({
      json: data,
      status: path.endsWith("/send") ? 201 : 200,
    });
  });
  return calls;
}
async function settle(page: Page) {
  await page.evaluate(async () => {
    await Promise.all(
      [300, 400, 500, 600, 700, 800].map((w) =>
        document.fonts.load(`${w} 16px Poppins`),
      ),
    );
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) => img.decode().catch(() => {})),
    );
  });
  await page.mouse.move(0, 0);
  await page.evaluate(() =>
    document.getAnimations().forEach((animation) => {
      try {
        animation.finish();
      } catch {
        animation.cancel();
      }
    }),
  );
  // Compare the same scroll position; legacy chat scrollIntoView also scrolls the page.
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelector("main")?.scrollTo(0, 0);
  });
}
async function compare(
  actual: Locator,
  reference: Locator,
  name: string,
  info: TestInfo,
) {
  const measure = (target: Locator) =>
    target
      .locator("h1,h2,h3,h4,h5,h6,table,th,td,button,input,select")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const r = element.getBoundingClientRect();
          const s = getComputedStyle(element);
          return {
            text: element.textContent?.trim().slice(0, 80),
            tag: element.tagName,
            x: r.x,
            y: r.y,
            w: r.width,
            h: r.height,
            font: s.font,
            color: s.color,
            background: s.backgroundColor,
            padding: s.padding,
            radius: s.borderRadius,
          };
        }),
      );
  await writeFile(
    info.outputPath(name + "-geometry.json"),
    JSON.stringify(
      { actual: await measure(actual), reference: await measure(reference) },
      null,
      2,
    ),
  );
  const baseline = await reference.screenshot({ animations: "disabled" });
  const path = info.snapshotPath(name + ".png");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, baseline);
  await info.attach(name + "-legacy", {
    body: baseline,
    contentType: "image/png",
  });
  await info.attach(name + "-current", {
    body: await actual.screenshot({
      animations: "disabled",
      path: info.outputPath(name + "-current.png"),
    }),
    contentType: "image/png",
  });
  await expect(actual).toHaveScreenshot(name + ".png", {
    animations: "disabled",
    maxDiffPixels: 0,
    threshold: 0.1,
  });
}
async function pair(
  page: Page,
  reference: Page,
  screen: string,
  fixture: Fixture = {},
) {
  await reference.setViewportSize(page.viewportSize()!);
  const calls = await prepare(page, fixture);
  await prepare(reference, fixture);
  await Promise.all([
    page.goto("/parent/" + screen),
    reference.goto("http://localhost:5187/parent/" + screen + "?role=user"),
  ]);
  if (screen === "dashboard")
    await Promise.all([
      expect(page.getByText("Domain Progress Overview")).toBeVisible(),
      expect(reference.getByText("Domain Progress Overview")).toBeVisible(),
    ]);
  if (screen === "childinformation")
    await Promise.all([
      expect(
        page.getByText(
          fixture.hidden ? "Access Restricted" : "Family Background & Details",
        ),
      ).toBeVisible(),
      expect(
        reference.getByText(
          fixture.hidden ? "Access Restricted" : "Family Background & Details",
        ),
      ).toBeVisible(),
    ]);
  if (screen === "eccdassessment")
    await Promise.all([
      expect(
        page.getByText("DepEd Official ECCD Summary Matrix"),
      ).toBeVisible(),
      expect(
        reference.getByText("DepEd Official ECCD Summary Matrix"),
      ).toBeVisible(),
    ]);
  if (screen === "messages")
    await Promise.all([
      expect(page.getByText("Conversations")).toBeVisible(),
      expect(reference.getByText("Conversations")).toBeVisible(),
    ]);
  await settle(page);
  await settle(reference);
  return calls;
}
for (const width of [320, 600, 900, 1200]) {
  for (const screen of [
    "dashboard",
    "childinformation",
    "eccdassessment",
    "messages",
  ])
    test(`${screen} ${width}`, async ({ page, context }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const reference = await context.newPage();
      await pair(page, reference, screen);
      if (width < 900) {
        const navStyles = (target: Locator) =>
          target.locator("span").evaluateAll((elements) =>
            elements.map((e) => {
              const s = getComputedStyle(e),
                r = e.getBoundingClientRect();
              return {
                text: e.textContent,
                font: s.font,
                transform: s.transform,
                translate: s.translate,
                background: s.backgroundColor,
                color: s.color,
                x: r.x,
                y: r.y,
                w: r.width,
                h: r.height,
              };
            }),
          );
        await writeFile(
          info.outputPath("nav-geometry.json"),
          JSON.stringify(
            {
              actual: await navStyles(
                page.getByRole("navigation", {
                  name: "Parent bottom navigation",
                }),
              ),
              reference: await navStyles(reference.locator("nav").last()),
            },
            null,
            2,
          ),
        );
      }
      await compare(
        page.locator("main"),
        reference.locator("main"),
        `${screen}-${width}`,
        info,
      );
      if (screen === "messages" && width < 900) {
        await page.getByText(contacts[0].name, { exact: true }).click();
        await reference.getByText(contacts[0].name, { exact: true }).click();
        await settle(page);
        await settle(reference);
        await expect(page.getByText(messages[0].body)).toBeVisible();
        await expect(reference.getByText(messages[0].body)).toBeVisible();
        await compare(
          page.locator("main"),
          reference.locator("main"),
          `chat-${width}`,
          info,
        );
      }
      if (screen === "eccdassessment") {
        await compare(
          page.locator(".parent-portal > div"),
          reference.locator("main > div"),
          `summary-full-${width}`,
          info,
        );
        await page
          .getByRole("button", { name: /Home-Based Checklist/ })
          .click();
        await reference
          .getByRole("button", { name: /Home-Based Checklist/ })
          .click();
        await settle(page);
        await settle(reference);
        await compare(
          page.locator("main"),
          reference.locator("main"),
          `checklist-${width}`,
          info,
        );
        await compare(
          page.locator(".parent-portal > div"),
          reference.locator("main > div"),
          `checklist-full-${width}`,
          info,
        );
      }
      await expect(
        page.getByRole("navigation", { name: "Parent bottom navigation" }),
      )[width < 900 ? "toBeVisible" : "toBeHidden"]();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
}

for (const width of [320, 600, 900, 1200]) {
  for (const state of [
    "locked",
    "hidden",
    "mastered",
    "multiple",
    "notEvaluated",
    "checklistLocked",
    "dialog",
    "emptyChat",
    "shell",
  ])
    test(`${state} ${width}`, async ({ page, context }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const reference = await context.newPage();
      const screen =
        state === "locked" || state === "hidden"
          ? "childinformation"
          : state === "checklistLocked" || state === "notEvaluated"
            ? "eccdassessment"
            : state === "emptyChat"
              ? "messages"
              : "dashboard";
      await pair(page, reference, screen, {
        locked: state === "locked" || state === "checklistLocked",
        hidden: state === "hidden",
        mastered: state === "mastered",
        multiple: state === "multiple",
        notEvaluated: state === "notEvaluated",
        empty: state === "emptyChat",
      });
      if (state === "checklistLocked") {
        await page
          .getByRole("button", { name: /Home-Based Checklist/ })
          .click();
        await reference
          .getByRole("button", { name: /Home-Based Checklist/ })
          .click();
        await settle(page);
        await settle(reference);
        await expect(
          page.getByText("Submission Closed / Read-Only"),
        ).toBeVisible();
        for (const button of await page
          .getByRole("button", { name: "KAYA", exact: true })
          .all())
          await expect(button).toBeDisabled();
      }
      if (state === "locked")
        for (const input of await page.locator("input[name]").all())
          expect(await input.getAttribute("readonly")).not.toBeNull();
      if (state === "dialog") {
        await page.getByRole("button", { name: "SYNC", exact: true }).click();
        await reference
          .getByRole("button", { name: "SYNC", exact: true })
          .click();
        await settle(page);
        await settle(reference);
        await compare(
          page.getByRole("dialog"),
          reference.getByRole("dialog"),
          `connect-dialog-${width}`,
          info,
        );
        return;
      }
      if (state === "multiple") {
        await page.getByRole("combobox").click();
        await reference.getByRole("combobox").click();
        await settle(page);
        await settle(reference);
        await compare(
          page.getByRole("listbox"),
          reference.getByRole("listbox"),
          `child-menu-${width}`,
          info,
        );
        await page.getByRole("option", { name: /Jordan/ }).click();
        await reference.getByRole("option", { name: /Jordan/ }).click();
        await expect(
          page.getByRole("heading", { name: "Jordan Reyes" }),
        ).toBeVisible();
        await expect(
          reference.getByRole("heading", { name: "Jordan Reyes" }),
        ).toBeVisible();
        await expect(page.getByText(messages[0].body)).toBeVisible();
        await expect(reference.getByText(messages[0].body)).toBeVisible();
        await settle(page);
        await settle(reference);
      }
      if (state === "shell") {
        if (width < 900) {
          await page.getByRole("button", { name: "Open navigation" }).click();
          await reference.getByRole("button", { name: "open drawer" }).click();
        }
        await settle(page);
        await settle(reference);
        await compare(
          page.locator('aside[aria-label="Main navigation"]'),
          reference.locator(".MuiDrawer-paper"),
          `drawer-${width}`,
          info,
        );
        return;
      }
      await compare(
        page.locator("main"),
        reference.locator("main"),
        `${state}-${width}`,
        info,
      );
      if (screen === "eccdassessment")
        await compare(
          page.locator(".parent-portal > div"),
          reference.locator("main > div"),
          `${state}-full-${width}`,
          info,
        );
    });
}

test("aliases, integer child selection and ID-based profile hydration", async ({
  page,
}) => {
  const calls = await prepare(page, { multiple: true });
  await page.goto("/parent/overview");
  await expect(page).toHaveURL(/\/parent\/dashboard$/);
  await page.goto("/parents/childinformation");
  await expect(page.getByText("Family Background & Details")).toBeVisible();
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "Jordan Reyes" }).click();
  await expect(page.locator(".MuiTextField-root input").first()).toHaveValue(
    "Jordan",
  );
  expect(calls.some((c) => c.path === "/api/students/202")).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("ames_child_7"))).toBe(
    "202",
  );
  expect(
    calls
      .filter((c) => !c.path.includes("/settings"))
      .every((c) => c.authorization?.startsWith("Bearer reference.")),
  ).toBe(true);
  expect(calls.every((c) => !c.path.includes("********"))).toBe(true);
});
test("unread count refreshes after three seconds and read events", async ({
  page,
}) => {
  await page.clock.install();
  const calls = await prepare(page);
  await page.goto("/parent/dashboard");
  await expect(page.getByText("Domain Progress Overview")).toBeVisible();
  const before = calls.filter((c) => c.path.endsWith("/unread-count")).length;
  await page.clock.runFor(3100);
  await expect
    .poll(() => calls.filter((c) => c.path.endsWith("/unread-count")).length)
    .toBeGreaterThan(before);
  const polled = calls.filter((c) => c.path.endsWith("/unread-count")).length;
  await page.evaluate(() =>
    window.dispatchEvent(new Event("ames-messages-read")),
  );
  await expect
    .poll(() => calls.filter((c) => c.path.endsWith("/unread-count")).length)
    .toBeGreaterThan(polled);
});
test("home observations survive reload, remain scoped, queue offline and synchronize", async ({
  page,
}) => {
  const calls = await prepare(page);
  await page.goto("/parent/eccdassessment");
  await page.getByRole("button", { name: /Home-Based Checklist/ }).click();
  await page.getByRole("button", { name: "KAYA", exact: true }).first().click();
  const key = "eccd_draft_101_PRE_1_home_7";
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), key))
    .not.toBeNull();
  await page.reload();
  await page.getByRole("button", { name: /Home-Based Checklist/ }).click();
  await expect(
    page.getByRole("button", { name: "KAYA", exact: true }).first(),
  ).toHaveClass(/bg-emerald-600/);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    window.dispatchEvent(new Event("offline"));
    localStorage.setItem("unrelated-draft", "keep");
  });
  await page
    .getByRole("button", { name: "Save Assessment", exact: true })
    .first()
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key) || "null")?.is_pending_sync,
        key,
      ),
    )
    .toBe(true);
  expect(
    calls.filter((c) => c.path === "/api/eccd/parent/evaluate"),
  ).toHaveLength(0);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => true,
    });
    window.dispatchEvent(new Event("online"));
  });
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), key))
    .toBeNull();
  expect(
    calls
      .filter((c) => c.path === "/api/eccd/parent/evaluate")
      .every((c) => (c.body as { student_id: number }).student_id === 101),
  ).toBe(true);
  expect(
    await page.evaluate(() => localStorage.getItem("unrelated-draft")),
  ).toBe("keep");
});
test("profile edits and message composer retain drafts until confirmed save", async ({
  page,
}) => {
  const calls = await prepare(page);
  await page.goto("/parent/childinformation");
  await expect(page.getByText("Family Background & Details")).toBeVisible();
  await page.locator('input[name="address"]').fill("Updated Example Street");
  await page.reload();
  await expect(page.locator('input[name="address"]')).toHaveValue(
    "Updated Example Street",
  );
  await page
    .getByRole("button", { name: "Save Changes", exact: true })
    .first()
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("ames_draft_7_parent_profile_101"),
      ),
    )
    .toBeNull();
  expect(
    calls.some(
      (c) => c.method === "PUT" && c.path === "/api/parents/children/101",
    ),
  ).toBe(true);
  await page.goto("/parent/messages");
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("A durable message");
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true }),
  ).toHaveValue("A durable message");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByText("A durable message", { exact: true }),
  ).toBeVisible();
});

test("unpublished scores stay masked and closed home controls cannot submit", async ({
  page,
}) => {
  const calls = await prepare(page, { locked: true });
  await page.route("**/api/eccd/parent/assessment/101", (route) =>
    route.fulfill({
      json: {
        student_id: 101,
        masked_lrn: student.masked_lrn,
        domains,
        evalAges: {},
        periodDates: { PRE: null, MID: null, POST: null },
        permissions: {
          ...permissions,
          allow_parent_edit_home_based_eccd: false,
        },
        can_edit_home_based: false,
        summary: Object.fromEntries(
          periods.map((period) => [
            period,
            {
              period,
              isReleased: true,
              is_published: false,
              isEvaluated: true,
              standardScore: 6789,
              decimalAge: 6789,
              assessmentDate: "2026-09-01",
              sumOfScaledScores: 6789,
              interpretation: "PRIVATE INTERPRETATION",
            },
          ]),
        ),
        matrix: domains.map((d) => ({
          ...d,
          domain_code: "GM",
          scores: { PRE: 6789, MID: 6789, POST: 6789 },
        })),
        homeBasedChecklist: domains.flatMap((d) => d.questions),
      },
    }),
  );
  await page.goto("/parent/eccdassessment");
  await expect(page.getByText("Results Pending Adviser Release")).toHaveCount(
    3,
  );
  await expect(page.locator("main")).not.toContainText("6789");
  await expect(page.locator("main")).not.toContainText(
    "PRIVATE INTERPRETATION",
  );
  await page.getByRole("button", { name: /Home-Based Checklist/ }).click();
  await expect(
    page.getByRole("button", { name: "Save Assessment", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator("button.bg-emerald-600,button.bg-rose-600"),
  ).toHaveCount(0);
  expect(calls.some((c) => c.path === "/api/eccd/parent/evaluate")).toBe(false);
});
test("server rejection preserves assessment observations for review", async ({
  page,
}) => {
  await prepare(page);
  await page.route("**/api/eccd/parent/evaluate", (route) =>
    route.fulfill({
      status: 403,
      json: {
        detail:
          "Home-based ECCD checklist submission is currently locked by the class adviser.",
      },
    }),
  );
  await page.goto("/parent/eccdassessment");
  await page.getByRole("button", { name: /Home-Based Checklist/ }).click();
  await page
    .getByRole("button", { name: "DI-KAYA", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Save Assessment", exact: true })
    .first()
    .click();
  const draft = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("eccd_draft_101_PRE_1_home_7") || "null"),
  );
  expect(draft.values.answers["1"]).toBe("DI-KAYA");
  expect(draft.is_pending_sync).toBe(false);
  await expect(
    page
      .getByText(
        "Home-based ECCD checklist submission is currently locked by the class adviser.",
      )
      .first(),
  ).toBeVisible();
});
test("an in-flight profile save cannot erase a newer revision", async ({
  page,
}) => {
  await prepare(page);
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let saving = false;
  await page.route("**/api/parents/children/101", async (route) => {
    saving = true;
    await pending;
    await route.fulfill({ status: 200, json: { success: true } });
  });
  await page.goto("/parent/childinformation");
  const address = page.locator('input[name="address"]');
  await expect(address).toBeVisible();
  await address.fill("First revision");
  await page
    .getByRole("button", { name: "Save Changes", exact: true })
    .first()
    .click();
  await expect.poll(() => saving).toBe(true);
  await address.fill("Newer revision");
  release();
  await expect(
    page.getByRole("button", { name: "Save Changes", exact: true }).first(),
  ).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("ames_draft_7_parent_profile_101") || "null",
          )?.values.address,
      ),
    )
    .toBe("Newer revision");
  await page.reload();
  await expect(address).toHaveValue("Newer revision");
});
