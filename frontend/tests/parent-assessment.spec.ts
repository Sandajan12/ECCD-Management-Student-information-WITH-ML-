import { expect, test, type Page } from "@playwright/test";
import {
  mockSession,
  expectNoStoredCredentials,
  setRamSession,
  sessionFor,
} from "./helpers/session";
import type {
  Answer,
  Assessment,
  Permissions,
  Period,
  SessionUser,
  Student,
} from "../src/types";

interface HomeSubmission {
  photo_ids?: Record<number, string>;
  student_id: number;
  testing_period: Period;
  evaluations: {
    question_id: number;
    testing_period: Period;
    answer: Answer;
  }[];
}

interface PortalState {
  reviewFlow: boolean;
  declined: Set<string>;
  pending: Map<string, Answer>;
  marks: boolean;
  editing: boolean;
  preOpen: boolean;
  failSave: boolean;
  denyRead: boolean;
  saveResponse: Promise<void> | null;
  submissions: HomeSubmission[];
  saved: Map<string, Answer>;
  laterOpen: boolean;
}

const draftKey = "eccd_draft_3_PRE_1_home_7";

test("teacher checklist locks teacher PRE and MID sources while allowing parent-source overrides", async ({
  page,
}) => {
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
  const questions = [
    {
      question_id: 1,
      domain_id: 1,
      question_text: "Teacher PRE source",
      sequence_order: 1,
      is_home_based: false,
      answers: { PRE: "KAYA", MID: null, POST: null },
      carry_forward: { PRE: null, MID: "locked", POST: "locked" },
    },
    {
      question_id: 2,
      domain_id: 1,
      question_text: "Parent PRE source",
      sequence_order: 2,
      is_home_based: true,
      answers: { PRE: "KAYA", MID: null, POST: null },
      carry_forward: { PRE: null, MID: "editable", POST: "editable" },
    },
    {
      question_id: 3,
      domain_id: 1,
      question_text: "Teacher MID source",
      sequence_order: 3,
      is_home_based: true,
      answers: { PRE: "DI-KAYA", MID: "KAYA", POST: null },
      carry_forward: { PRE: null, MID: null, POST: "locked" },
    },
  ];
  const domain = { domain_id: 1, domain_name: "Gross Motor", questions };
  const submissions: {
    evaluations: { question_id: number; answer: Answer }[];
  }[] = [];
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
    else if (path === "/api/eccd/domains-progress") json = [domain];
    else if (path === "/api/eccd/section/1/period-gates")
      json = {
        section_id: 1,
        required_question_count: 3,
        prerequisites: { PRE: [], MID: [] },
      };
    else if (path.startsWith("/api/eccd/assessment/"))
      json = {
        student_id: 1,
        domains: [domain],
        evalAges: {},
        periodDates: { PRE: "2026-08-01", MID: "2026-09-01", POST: null },
        student_birth_date: "2021-01-01",
      };
    else if (path === "/api/eccd/evaluate")
      submissions.push(route.request().postDataJSON());
    else if (path === "/api/messages/contacts")
      json = { myId: 2, contacts: [] };
    else if (path === "/api/messages/unread-count") json = { unreadCount: 0 };
    await route.fulfill({ json });
  });
  await mockSession(page, user);
  await page.goto(
    "/teacher/eccdassessment?student_id=1&period=POST&domain_id=1",
  );
  const row = (name: string) => page.getByRole("row").filter({ hasText: name });
  for (const name of ["Teacher PRE source", "Teacher MID source"]) {
    await expect(
      row(name).getByRole("button", { name: "DI-KAYA", exact: true }).last(),
    ).toBeDisabled();
    await expect(row(name).getByText("draft-not save").last()).toBeVisible();
    const label = row(name).getByText("draft-not save").last();
    expect(
      await label.evaluate((element) => getComputedStyle(element).whiteSpace),
    ).toBe("nowrap");
    expect(
      await label.evaluate(
        (element) =>
          element.getBoundingClientRect().right <=
          element.closest("td")!.getBoundingClientRect().right,
      ),
    ).toBe(true);
  }
  await expect(
    row("Parent PRE source")
      .getByRole("button", { name: "DI-KAYA", exact: true })
      .last(),
  ).toBeEnabled();
  await row("Parent PRE source")
    .getByRole("button", { name: "DI-KAYA", exact: true })
    .last()
    .click();
  expect(submissions).toHaveLength(0);
  await page
    .getByRole("button", { name: "Save Assessment", exact: true })
    .click();
  await expect.poll(() => submissions.length).toBe(1);
  expect(submissions[0].evaluations).toEqual([
    { question_id: 1, testing_period: "POST", answer: "KAYA" },
    { question_id: 2, testing_period: "POST", answer: "DI-KAYA" },
    { question_id: 3, testing_period: "POST", answer: "KAYA" },
  ]);
  await expectNoStoredCredentials(page);
});

test("teacher section prerequisites redirect to remaining students and block stale saves", async ({
  page,
}) => {
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
  let preIncomplete = true;
  let midIncomplete = true;
  let stale = false;
  let failGates = false;
  const submissions: HomeSubmission[] = [];
  const incomplete = [
    {
      student_id: 2,
      full_name: "Amy Middle Learner",
      masked_lrn: "********1234",
      saved_count: 1,
      missing_testing_date: true,
    },
    {
      student_id: 3,
      full_name: "Ben Remaining Learner",
      masked_lrn: "Pending",
      saved_count: 0,
      missing_testing_date: false,
    },
  ];
  const questions = [1, 2].map((id) => ({
    question_id: id,
    domain_id: 1,
    question_text: `Indicator ${id}`,
    sequence_order: id,
    is_home_based: false,
    answers: { PRE: "DI-KAYA", MID: "DI-KAYA", POST: null },
  }));
  const domain = { domain_id: 1, domain_name: "Gross Motor", questions };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path === "/api/eccd/students")
      json = [
        {
          student_id: 1,
          first_name: "Already",
          last_name: "Assessed",
          section_id: 1,
          is_active: true,
        },
        ...incomplete.map((s) => ({
          ...s,
          first_name: s.full_name,
          section_id: 1,
          is_active: true,
        })),
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
    else if (path === "/api/eccd/domains-progress") json = [domain];
    else if (path === "/api/eccd/section/1/period-gates") {
      if (failGates) {
        await route.fulfill({
          status: 503,
          json: { detail: "Section completion unavailable" },
        });
        return;
      }
      json = {
        section_id: 1,
        required_question_count: 2,
        prerequisites: {
          PRE: preIncomplete ? incomplete : [],
          MID: midIncomplete ? [incomplete[0]] : [],
        },
      };
    } else if (path.startsWith("/api/eccd/assessment/"))
      json = {
        student_id: Number(path.split("/").pop()),
        domains: [domain],
        evalAges: {},
        periodDates: { PRE: "2026-08-01", MID: "2026-09-01", POST: null },
        student_birth_date: "2021-01-01",
      };
    else if (path === "/api/eccd/evaluate") {
      const payload: HomeSubmission = route.request().postDataJSON();
      submissions.push(payload);
      if (stale) {
        preIncomplete = true;
        await route.fulfill({
          status: 409,
          json: {
            detail: "Complete Pre-Test (PRE) for 2 remaining active students.",
          },
        });
        return;
      }
      if (payload.testing_period === "PRE") preIncomplete = false;
      if (payload.testing_period === "MID") midIncomplete = false;
    } else if (path === "/api/messages/contacts")
      json = { myId: 2, contacts: [] };
    else if (path === "/api/messages/unread-count") json = { unreadCount: 0 };
    await route.fulfill({ json });
  });
  await mockSession(page, user);
  await page.goto(
    "/teacher/eccdassessment?student_id=1&period=POST&domain_id=1",
  );
  const dialog = page.getByRole("dialog");
  const period = page.getByLabel("Period", { exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Finish Pre-Test first")).toBeVisible();
  await expect(dialog.getByText(/2 remaining active/)).toBeVisible();
  await expect(
    dialog.getByText("Amy Middle Learner", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText("********1234", { exact: true })).toBeVisible();
  await expect(
    dialog.getByText(/Saved: 1 \/ 2.*Missing testing date/),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Assess Student" }),
  ).toHaveCount(2);
  await expect(period).toHaveValue("PRE");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await period.selectOption("MID");
  await expect(dialog).toBeVisible();
  await expect(period).toHaveValue("PRE");
  await dialog.getByRole("button", { name: "Assess Student" }).first().click();
  await expect(
    page.getByRole("combobox", { name: "Student", exact: true }),
  ).toHaveValue(/Amy Middle Learner/);
  await page
    .getByRole("button", { name: "Save Assessment", exact: true })
    .click();
  await expect(period.locator("option[value=MID]")).not.toHaveText(/Locked/);
  await period.selectOption("POST");
  await expect(dialog.getByText("Finish Mid-Test first")).toBeVisible();
  await dialog.getByRole("button", { name: "Assess Student" }).click();
  await expect(period).toHaveValue("MID");
  await page
    .getByRole("button", { name: "Save Assessment", exact: true })
    .click();
  await expect(period.locator("option[value=POST]")).not.toHaveText(/Locked/);
  await period.selectOption("POST");
  await expect(period).toHaveValue("POST");
  await page
    .getByRole("row")
    .filter({ hasText: "Indicator 1" })
    .getByRole("button", { name: "DI-KAYA", exact: true })
    .last()
    .click();
  stale = true;
  await page
    .getByRole("button", { name: "Save Assessment", exact: true })
    .click();
  await expect(dialog.getByText("Finish Pre-Test first")).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save Assessment", exact: true }),
  ).toBeDisabled();
  expect(submissions.map((s) => s.testing_period)).toEqual([
    "PRE",
    "MID",
    "POST",
  ]);
  expect(
    await page.evaluate(() => localStorage.getItem("eccd_draft_2_POST_1_2")),
  ).toContain("DI-KAYA");
  failGates = true;
  // A visible wake refresh observes the existing 60-second cooldown.
  await page.clock.setFixedTime(new Date(Date.now() + 61000));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByText("Section completion unavailable", { exact: true }),
  ).toBeVisible();
  await period.selectOption("MID");
  await expect(dialog.getByText("Checking section assessments")).toBeVisible();
  await expect(period).toHaveValue("POST");
  failGates = false;
  await dialog.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(dialog.getByText("Finish Pre-Test first")).toBeVisible();
  await dialog.getByRole("button", { name: "Assess Student" }).first().click();
  await expect(period).toHaveValue("PRE");
  expect(
    await page.evaluate(() => localStorage.getItem("eccd_draft_2_POST_1_2")),
  ).toContain("DI-KAYA");
  await expectNoStoredCredentials(page);
});

async function portal(
  page: Page,
  path = "/parent/dashboard",
  marks = false,
  expandHome = true,
) {
  const state: PortalState = {
    reviewFlow: false,
    declined: new Set(),
    pending: new Map(),
    marks,
    editing: true,
    preOpen: true,
    failSave: false,
    denyRead: false,
    saveResponse: null,
    submissions: [],
    saved: new Map([["3_PRE_12", "KAYA"]]),
    laterOpen: false,
  };
  const user: SessionUser = {
    id: 7,
    first_name: "Sample",
    last_name: "Parent",
    full_name: "Sample Parent",
    email: "sample@example.com",
    role: "user",
    is_first_login: 0,
    section_id: null,
    section_name: null,
    allow_eccd_question_management: false,
  };
  await page.addInitScript(() => {
    localStorage.setItem("ames_draft_7_unrelated", "keep my work");
  });

  const permissions = (): Permissions => ({
    allow_parent_view_student_info: true,
    allow_parent_view_eccd_pre: false,
    allow_parent_view_eccd_mid: false,
    allow_parent_view_eccd_post: false,
    allow_parent_view_eccd_marks: state.marks,
    allow_parent_predictions: false,
    allow_parent_edit_student_info: true,
    allow_parent_edit_home_based_eccd: state.editing,
  });
  const child = (id: number): Student => ({
    student_id: id,
    masked_lrn: "********5555",
    first_name: id === 3 ? "Sample" : "Sibling",
    middle_name: null,
    last_name: "Child",
    full_name: id === 3 ? "Sample Child" : "Sibling Child",
    date_of_birth: null,
    gender: null,
    section_id: 1,
    section_name: "Sample Class",
    school_year: "2026-2027",
    decimal_age: null,
    is_active: true,
    address: null,
    emergency_contact: null,
    handedness: null,
    num_of_siblings: null,
    birth_order: null,
    profile_completeness: 0,
    parent_names: null,
    parents: [],
    ...permissions(),
  });
  const assessment = (id: number): Assessment => {
    const domains = [
      {
        domain_id: 1,
        domain_name: "Gross Motor",
        questions: [
          {
            question_id: 11,
            question_text: "Plays safely at home",
            is_home_based: true,
          },
          {
            question_id: 12,
            question_text: "Walks in class",
            is_home_based: false,
          },
        ],
      },
      {
        domain_id: 2,
        domain_name: "Fine Motor",
        questions: [
          {
            question_id: 21,
            question_text: "Draws at home",
            is_home_based: true,
          },
        ],
      },
    ].map((domain) => ({
      ...domain,
      questions: domain.questions.map((question, index) => ({
        ...question,
        domain_id: domain.domain_id,
        sequence_order: index + 1,
        answers: {
          PRE:
            state.marks ||
            (state.editing && state.preOpen && question.is_home_based)
              ? state.saved.get(`${id}_PRE_${question.question_id}`) || null
              : null,
          MID: state.saved.get(`${id}_MID_${question.question_id}`) || null,
          POST: state.saved.get(`${id}_POST_${question.question_id}`) || null,
        },
        evaluator_roles: {
          PRE: question.is_home_based
            ? ("parent" as const)
            : ("teacher" as const),
        },
        parent_locked: {
          PRE:
            state.saved.has(`${id}_PRE_${question.question_id}`) ||
            (state.pending.has(`${id}_PRE_${question.question_id}`) &&
              !state.declined.has(`${id}_PRE_${question.question_id}`)),
          MID:
            state.saved.has(`${id}_MID_${question.question_id}`) ||
            (state.pending.has(`${id}_MID_${question.question_id}`) &&
              !state.declined.has(`${id}_MID_${question.question_id}`)),
          POST:
            state.saved.has(`${id}_POST_${question.question_id}`) ||
            (state.pending.has(`${id}_POST_${question.question_id}`) &&
              !state.declined.has(`${id}_POST_${question.question_id}`)),
        },
        home_observations: Object.fromEntries(
          (["PRE", "MID", "POST"] as const).map((p) => [
            p,
            state.pending.has(`${id}_${p}_${question.question_id}`)
              ? {
                  status: state.declined.has(
                    `${id}_${p}_${question.question_id}`,
                  )
                    ? ("declined" as const)
                    : ("pending" as const),
                  answer: state.pending.get(
                    `${id}_${p}_${question.question_id}`,
                  )!,
                  submitted_at: "2026-11-16T12:00:00+08:00",
                }
              : null,
          ]),
        ),
        photo_eligible: Object.fromEntries(
          (["PRE", "MID", "POST"] as const).map((p) => [
            p,
            question.is_home_based &&
              !state.saved.has(`${id}_${p}_${question.question_id}`) &&
              !state.pending.has(`${id}_${p}_${question.question_id}`) &&
              !(
                p !== "PRE" &&
                state.saved.get(`${id}_PRE_${question.question_id}`) === "KAYA"
              ) &&
              !(
                p === "POST" &&
                state.saved.get(`${id}_MID_${question.question_id}`) === "KAYA"
              ),
          ]),
        ),
        carry_forward: {
          PRE: null,
          MID:
            state.saved.get(`${id}_PRE_${question.question_id}`) === "KAYA"
              ? ("locked" as const)
              : null,
          POST:
            state.saved.get(`${id}_MID_${question.question_id}`) === "DI-KAYA"
              ? null
              : state.saved.get(`${id}_PRE_${question.question_id}`) ===
                    "KAYA" ||
                  state.saved.get(`${id}_MID_${question.question_id}`) ===
                    "KAYA"
                ? ("locked" as const)
                : null,
        },
      })),
    }));
    return {
      student_id: id,
      masked_lrn: "********5555",
      student_birth_date: null,
      domains,
      evalAges: {},
      periodDates: { PRE: null, MID: null, POST: null },
      permissions: permissions(),
      allow_parent_view_eccd_marks: state.marks,
      can_edit_home_based: state.editing,
      parent_assessment_access: {
        pre_test_parent_editable: state.preOpen,
        mid_test_parent_editable: state.laterOpen,
        post_test_parent_editable: state.laterOpen,
      },
      matrix: [],
      homeBasedChecklist: domains.flatMap((domain) =>
        domain.questions.filter((question) => question.is_home_based),
      ),
    };
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/students/my-child")
      await route.fulfill({ json: [child(3), child(4)] });
    else if (path.startsWith("/api/eccd/parent/assessment/")) {
      if (state.denyRead)
        await route.fulfill({
          status: 403,
          json: { detail: "Assessment access unavailable." },
        });
      else
        await route.fulfill({
          json: assessment(Number(path.split("/").at(-1))),
        });
    } else if (path.startsWith("/api/eccd/parent/home-photos/")) {
      await route.fulfill({ json: { photo_id: "a".repeat(32) } });
    } else if (path === "/api/eccd/parent/evaluate") {
      const payload = route.request().postDataJSON() as HomeSubmission;
      if (state.failSave) {
        await route.abort("failed");
        return;
      }
      if (!state.editing || !state.preOpen) {
        await route.fulfill({
          status: 403,
          json: { detail: "Editing is currently locked by the Class Adviser." },
        });
        return;
      }
      if (
        payload.evaluations.some((row) => {
          const saved = state.saved.get(
            `${payload.student_id}_${row.testing_period}_${row.question_id}`,
          );
          return saved && saved !== row.answer;
        })
      ) {
        await route.fulfill({
          status: 409,
          json: {
            detail:
              "Submitted answers cannot be changed. Refresh to view the saved answers.",
          },
        });
        return;
      }
      state.submissions.push(payload);
      for (const row of payload.evaluations) {
        state.declined.delete(
          `${payload.student_id}_${row.testing_period}_${row.question_id}`,
        );
        (state.reviewFlow ? state.pending : state.saved).set(
          `${payload.student_id}_${row.testing_period}_${row.question_id}`,
          row.answer,
        );
      }
      await state.saveResponse;
      await route.fulfill({
        json: { message: "Saved", testing_period: payload.testing_period },
      });
    } else if (path === "/api/messages/contacts")
      await route.fulfill({ json: { myId: 7, contacts: [] } });
    else if (path === "/api/messages/unread-count")
      await route.fulfill({ json: { unreadCount: 0 } });
    else if (path.includes("domains-progress"))
      await route.fulfill({ json: [] });
    else await route.fulfill({ json: {} });
  });
  await mockSession(page, user);
  await page.goto(path);
  if (path === "/parent/dashboard" && expandHome) await openHome(page);
  return state;
}

async function openHome(page: Page) {
  const toggle = page.locator("#home-assessment-toggle");
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) === "false")
    await toggle.click();
}

test("Overview home card starts collapsed and only its header toggles it; domains hide independently", async ({
  page,
}) => {
  const state = await portal(page, "/parent/dashboard", false, false);
  state.reviewFlow = true;
  const toggle = page.locator("#home-assessment-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(
    homeAnswer(page, "Plays safely at home", "KAYA"),
  ).not.toBeVisible();
  await expect(page.getByText("Home Checklist", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Submit Observations", exact: true }),
  ).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const submit = page.getByRole("button", {
    name: "Submit Observations",
    exact: true,
  });
  await expect(submit).toBeVisible();
  const nav = page.getByRole("navigation", {
    name: "Parent bottom navigation",
  });
  const barBox = await page.getByLabel("Home observation submission").boundingBox();
  expect(barBox!.x).toBeGreaterThanOrEqual(0);
  expect(barBox!.x + barBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (await nav.isVisible()) {
    const navBox = await nav.boundingBox();
    expect(barBox!.y + barBox!.height).toBeLessThan(navBox!.y);
  } else {
    const sidebar = await page.getByRole("complementary", {name: "Main navigation"}).boundingBox();
    expect(barBox!.x).toBeGreaterThan(sidebar!.x + sidebar!.width);
  }
  const domain = page.locator("#home-domain-1");
  await expect(page.locator("#home-assessment-content")).toHaveCount(1);
  await expect(page.locator("#home-domain-content-1")).toHaveCount(1);
  await expect(domain).toContainText("1 remaining");
  await domain.click();
  await expect(domain).toHaveAttribute("aria-expanded", "false");
  await expect(
    homeAnswer(page, "Plays safely at home", "KAYA"),
  ).not.toBeVisible();
  await expect(homeAnswer(page, "Draws at home", "KAYA")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await domain.click();
  await homeAnswer(page, "Plays safely at home", "KAYA").click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(submit).toHaveCount(0);
  await toggle.press("Enter");
  await expect(
    homeAnswer(page, "Plays safely at home", "KAYA"),
  ).toHaveAttribute("aria-pressed", "true");
  await submitHome(page);
  await expect(homeAnswer(page, "Plays safely at home", "KAYA")).toHaveCount(0);
  await expect(domain).toHaveCount(0);
  await expect(homeAnswer(page, "Draws at home", "DI-KAYA")).toBeEnabled();
  await homeAnswer(page, "Draws at home", "DI-KAYA").click();
  await submitHome(page);
  await expect(
    homeForm(page).getByText("All home observations submitted", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    homeForm(page).getByRole("button", {
      name: "Submit Observations",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await openHome(page);
  await expect(
    homeForm(page).getByText("All home observations submitted", {
      exact: true,
    }),
  ).toBeVisible();
  await expectNoStoredCredentials(page);
});

for (const period of ["PRE", "MID", "POST"] as const) {
  test(`declined home observations reopen for manual resubmission in ${period}`, async ({
    page,
  }) => {
    const state = await portal(page);
    state.reviewFlow = true;
    state.laterOpen = true;
    const key = `3_${period}_11`;
    state.pending.set(key, "KAYA");
    await page.reload();
    await openHome(page);
    const selectPeriod = async () => {
      await page
        .getByRole("combobox", { name: "Home assessment testing period" })
        .click();
      await page
        .getByRole("option", {
          name: { PRE: "Pre-Test", MID: "Mid-Test", POST: "Post-Test" }[period],
          exact: true,
        })
        .click();
    };
    await selectPeriod();
    await expect(homeAnswer(page, "Plays safely at home", "KAYA")).toHaveCount(
      0,
    );
    state.declined.add(key);
    await page.reload();
    await openHome(page);
    await selectPeriod();
    await expect(
      homeAnswer(page, "Plays safely at home", "DI-KAYA"),
    ).toBeEnabled();
    await homeAnswer(page, "Plays safely at home", "DI-KAYA").click();
    await submitHome(page);
    await expect.poll(() => state.pending.get(key)).toBe("DI-KAYA");
    expect(state.declined.has(key)).toBe(false);
    await expect(
      homeAnswer(page, "Plays safely at home", "DI-KAYA"),
    ).toHaveCount(0);
    await expectNoStoredCredentials(page);
  });
}

test("ECCD DI-KAYA-first ordering mixes home and school questions without answer filters", async ({
  page,
}) => {
  const state = await portal(page, "/parent/eccdassessment", true);
  state.saved.set("3_PRE_11", "KAYA");
  state.saved.set("3_PRE_12", "DI-KAYA");
  await page.reload();
  await page
    .getByRole("button", { name: "ECCD Checklists", exact: true })
    .click();
  await page
    .getByRole("button", { name: "View Gross Motor", exact: true })
    .click();
  const rows = page
    .getByRole("region", { name: "Domain questions" })
    .getByRole("group");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("2. Walks in class");
  await expect(rows.nth(0)).toContainText("DI-KAYA");
  await expect(rows.nth(1)).toContainText("1. Plays safely at home");
  await expect(
    page.getByRole("button", { name: /^(All|KAYA|DI-KAYA)$/ }),
  ).toHaveCount(0);
  state.saved.delete("3_PRE_12");
  await page.reload();
  await page
    .getByRole("button", { name: "ECCD Checklists", exact: true })
    .click();
  await page
    .getByRole("button", { name: "View Gross Motor", exact: true })
    .click();
  await expect(rows.nth(0)).toContainText("1. Plays safely at home");
  await expect(rows.nth(1)).toContainText("Not yet evaluated");
});

for (const action of ["photo", "submission"] as const) {
  test(`${action} throttling never displays an export error and manual retry preserves drafts`, async ({
    page,
  }) => {
    const state = await portal(page);
    state.reviewFlow = true;
    let limited = true;
    const pattern =
      action === "photo"
        ? "**/api/eccd/parent/home-photos/**"
        : "**/api/eccd/parent/evaluate";
    await page.route(pattern, async (route) => {
      if (!limited) return route.fallback();
      await route.fulfill({
        status: 429,
        headers: { "Retry-After": "60" },
        json: {
          message:
            "Export or backup limit reached. Please try again in 10 minutes.",
        },
      });
    });
    await homeAnswer(page, "Plays safely at home", "KAYA").click();
    if (action === "photo") {
      await homeForm(page)
        .getByText("Optional photo", { exact: true })
        .first()
        .locator("input")
        .setInputFiles({
          name: "dsd.png",
          mimeType: "image/png",
          buffer: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5z0AAAAASUVORK5CYII=",
            "base64",
          ),
        });
      await expect(
        homeForm(page).getByRole("img", { name: "Optional photo preview" }),
      ).toBeVisible();
    }
    await submitHome(page);
    await expect(
      homeForm(page).getByText(
        action === "photo"
          ? /Photo upload limit reached/
          : /Observation submission limit reached/,
      ),
    ).toBeVisible();
    await expect(page.getByText(/Export or backup limit reached/)).toHaveCount(
      0,
    );
    expect(state.submissions).toHaveLength(0);
    await expect(
      homeAnswer(page, "Plays safely at home", "KAYA"),
    ).toHaveAttribute("aria-pressed", "true");
    if (action === "photo")
      await expect(homeForm(page).getByText(/dsd.png/)).toBeVisible();
    limited = false;
    await submitHome(page);
    await expect.poll(() => state.pending.get("3_PRE_11")).toBe("KAYA");
    await expect(homeAnswer(page, "Plays safely at home", "KAYA")).toHaveCount(
      0,
    );
    expect(state.pending.get("3_PRE_11")).toBe("KAYA");
  });
}

test("429 error mapping reserves export wording for export and backup routes", async ({
  page,
}) => {
  await portal(page);
  const messages = await page.evaluate(async () => {
    const path = "/src/services/api.ts";
    const api = (await import(path)) as {
      errorMessage: (error: unknown) => string;
    };
    return [
      "/api/backup/export",
      "/api/teachers/download-all",
      "/api/eccd/parent/home-photos/3/11/PRE",
      "/api/eccd/parent/evaluate",
      "/api/settings/rollover",
    ].map((url) =>
      api.errorMessage({
        isAxiosError: true,
        config: { url, method: "post" },
        response: {
          status: 429,
          data: {
            message:
              "Export or backup limit reached. Please try again in 10 minutes.",
          },
        },
      }),
    );
  });
  expect(
    messages
      .slice(0, 2)
      .every((message) => message.startsWith("Export or backup")),
  ).toBe(true);
  expect(messages[2]).toContain("Photo upload limit reached");
  expect(messages[3]).toContain("Observation submission limit reached");
  expect(messages[4]).toContain("Too many requests");
});

const homeForm = (page: Page) =>
  page.getByRole("region", {
    name: "Assess Home-Based Questions",
    exact: true,
  });
const homeAnswer = (page: Page, name: string, answer: Answer) =>
  homeForm(page)
    .getByRole("group", { name, exact: true })
    .getByRole("button", { name: answer, exact: true });

test("partial parent submission stays pending and optional photo drafts survive reload until confirmed", async ({
  page,
}) => {
  const state = await portal(page);
  state.reviewFlow = true;
  const photo = page.getByText("Optional photo", { exact: true }).first();
  await photo.locator("input").setInputFiles({
    name: "proof.png",
    mimeType: "image/png",
    buffer: Buffer.from("isolated mocked upload"),
  });
  await expect(homeForm(page).getByText(/proof.png/)).toBeVisible();
  await homeAnswer(page, "Plays safely at home", "KAYA").click();
  await page.reload();
  await openHome(page);
  await expect(homeForm(page).getByText(/proof.png/)).toBeVisible();
  await submitHome(page);
  await expect(
    homeForm(page).getByText("Submitted — awaiting teacher review.").first(),
  ).toBeVisible();
  expect(state.pending.get("3_PRE_11")).toBe("KAYA");
  expect(state.saved.has("3_PRE_11")).toBe(false);
  expect(state.submissions[0].photo_ids?.[11]).toBe("a".repeat(32));
  await expect(homeAnswer(page, "Draws at home", "DI-KAYA")).toBeEnabled();
  await page.reload();
  await openHome(page);
  await expect(homeAnswer(page, "Plays safely at home", "KAYA")).toHaveCount(0);
  await expect(homeForm(page).getByText(/proof.png/)).toHaveCount(0);
  await expectNoStoredCredentials(page);
});

test("an account switch during photo upload preserves the original draft and cannot submit as the new parent", async ({
  page,
}) => {
  const state = await portal(page);
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let uploading = false,
    finished = false;
  await page.route("**/api/eccd/parent/home-photos/**", async (route) => {
    uploading = true;
    await waiting;
    await route.fulfill({ json: { photo_id: "a".repeat(32) } });
    finished = true;
  });
  await homeForm(page)
    .getByText("Optional photo", { exact: true })
    .first()
    .locator("input")
    .setInputFiles({
      name: "proof.png",
      mimeType: "image/png",
      buffer: Buffer.from("isolated upload"),
    });
  await homeAnswer(page, "Plays safely at home", "KAYA").click();
  await submitHome(page);
  await expect.poll(() => uploading).toBe(true);
  const replacement: SessionUser = {
    id: 8,
    first_name: "Other",
    last_name: "Parent",
    full_name: "Other Parent",
    email: "other@example.com",
    role: "user",
    is_first_login: 0,
    section_id: null,
    section_name: null,
    allow_eccd_question_management: false,
  };
  await setRamSession(page, sessionFor(replacement));
  release();
  await expect.poll(() => finished).toBe(true);
  await expect
    .poll(async () =>
      page.evaluate((key) => localStorage.getItem(key), draftKey),
    )
    .toContain("Account changed");
  expect(state.submissions).toHaveLength(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), draftKey),
  ).toContain('"11":"KAYA"');
  await expectNoStoredCredentials(page);
});

test("accepted earlier KAYA hides photo fields while a negative or unanswered history keeps them optional", async ({
  page,
}) => {
  const state = await portal(page);
  state.laterOpen = true;
  state.saved.set("3_PRE_11", "KAYA");
  state.saved.set("3_PRE_21", "DI-KAYA");
  await page.reload();
  await openHome(page);
  await homeForm(page).getByRole("combobox").click();
  await page.getByRole("option", { name: "Mid-Test", exact: true }).click();
  await expect(
    homeForm(page).getByText("Optional photo", { exact: true }),
  ).toHaveCount(1);
  await expect(homeForm(page).getByText("draft-not save")).toHaveCount(1);
  expect(
    await homeForm(page)
      .getByText("draft-not save")
      .evaluate((e) => getComputedStyle(e).whiteSpace),
  ).toBe("nowrap");
  await homeAnswer(page, "Draws at home", "KAYA").click();
  await expect(
    homeForm(page).getByText("Optional photo", { exact: true }),
  ).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("teacher review decisions survive close and reload, save only selected rows and keep explicit declines", async ({
  page,
}) => {
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
  const questions = [11, 12, 13].map((id, i) => ({
    question_id: id,
    domain_id: 1,
    sequence_order: i + 1,
    question_text: `Review question ${id}`,
    is_home_based: true,
    answers: { PRE: null, MID: null, POST: null },
    home_observations: {
      PRE: {
        status: "pending",
        answer: "KAYA",
        submitted_at: "2026-11-16T12:00:00+08:00",
      },
    },
  }));
  const domain = { domain_id: 1, domain_name: "Gross Motor", questions };
  let pending = questions.map((q) => ({
    observation_id: q.question_id,
    question_id: q.question_id,
    student_id: 1,
    testing_period: "PRE",
    answer: "KAYA",
    submitted_at: "2026-11-16T12:00:00+08:00",
    has_photo: false,
  }));
  const saves: { decisions: { observation_id: number; status: string }[] }[] =
    [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path === "/api/eccd/home-observations/pending") json = pending;
    else if (path === "/api/eccd/home-observations/review") {
      const payload = route.request().postDataJSON() as (typeof saves)[number];
      saves.push(payload);
      pending = pending.filter(
        (r) =>
          !payload.decisions.some((d) => d.observation_id === r.observation_id),
      );
      json = { message: "Review saved.", cleanup_pending: 0 };
    } else if (path === "/api/eccd/students")
      json = [
        {
          student_id: 1,
          first_name: "Sample",
          last_name: "Child",
          full_name: "Sample Child",
          masked_lrn: "********1234",
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
      json = { section_id: 1, section_name: "Test A" };
    else if (path === "/api/eccd/domains-progress") json = [domain];
    else if (path === "/api/eccd/section/1/period-gates")
      json = {
        section_id: 1,
        required_question_count: 3,
        prerequisites: { PRE: [], MID: [] },
      };
    else if (path.startsWith("/api/eccd/assessment/"))
      json = {
        student_id: 1,
        domains: [domain],
        evalAges: {},
        periodDates: { PRE: null, MID: null, POST: null },
        student_birth_date: null,
      };
    else if (path === "/api/messages/contacts")
      json = { myId: 2, contacts: [] };
    else if (path === "/api/messages/unread-count") json = { unreadCount: 0 };
    await route.fulfill({ json });
  });
  await mockSession(page, user);
  await page.goto(
    "/teacher/eccdassessment?student_id=1&period=PRE&domain_id=1",
  );
  await page
    .getByRole("button", { name: "Pending Home-Based Assessments 3" })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Pending Home-Based Assessments",
  });
  const reviewRow = (id: number) =>
    dialog.getByText(`Review question ${id}`, { exact: true }).locator("..");
  await reviewRow(11)
    .getByRole("button", { name: "Decline", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  expect(saves).toHaveLength(0);
  await page.reload();
  await page
    .getByRole("button", { name: "Pending Home-Based Assessments 3" })
    .click();
  await dialog
    .getByRole("button", { name: "Accept all in this domain" })
    .click();
  await dialog
    .getByRole("button", { name: "Save Review", exact: true })
    .click();
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0].decisions).toEqual([
    { observation_id: 11, status: "declined" },
    { observation_id: 12, status: "accepted" },
    { observation_id: 13, status: "accepted" },
  ]);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pending Home-Based Assessments 0" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pending Home-Based Assessments 0" })
    .click();
  await expect(
    dialog.getByText("No pending observations for this selection."),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await expectNoStoredCredentials(page);
});

async function submitHome(page: Page) {
  await homeForm(page)
    .getByRole("button", { name: "Submit Observations", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Submit Answers" })
    .getByRole("button", { name: "Submit Answers", exact: true })
    .click();
}

test("confirmation cancellation retains selections and saved questions lock across reloads", async ({
  page,
}) => {
  const state = await portal(page);
  await homeAnswer(page, "Plays safely at home", "KAYA").click();
  const before = await page.evaluate(
    (key) => localStorage.getItem(key),
    draftKey,
  );
  await homeForm(page)
    .getByRole("button", { name: "Submit Observations", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Submit Answers" });
  await expect(
    dialog.getByText(/Submit 1 answered questions for teacher review/),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(state.submissions).toHaveLength(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), draftKey),
  ).toBe(before);
  await expect(
    homeAnswer(page, "Plays safely at home", "KAYA"),
  ).toHaveAttribute("aria-pressed", "true");
  await submitHome(page);
  await expect(homeAnswer(page, "Plays safely at home", "KAYA")).toHaveCount(0);
  await page.reload();
  await openHome(page);
  await expect(homeAnswer(page, "Plays safely at home", "KAYA")).toHaveCount(0);
  await homeAnswer(page, "Draws at home", "DI-KAYA").click();
  await submitHome(page);
  await expect.poll(() => state.submissions.length).toBe(2);
  expect(state.submissions[1].evaluations).toEqual([
    { question_id: 21, testing_period: "PRE", answer: "DI-KAYA" },
  ]);
});

test("saved KAYA prefills and locks later home answers but only explicit submit saves them", async ({
  page,
}) => {
  const state = await portal(page);
  state.laterOpen = true;
  state.saved.set("3_PRE_11", "KAYA");
  await page.reload();
  await openHome(page);
  await homeForm(page)
    .getByRole("combobox", { name: "Home assessment testing period" })
    .click();
  await page.getByRole("option", { name: "Mid-Test", exact: true }).click();
  await expect(
    homeAnswer(page, "Plays safely at home", "KAYA"),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    homeAnswer(page, "Plays safely at home", "DI-KAYA"),
  ).toBeDisabled();
  await expect(homeForm(page).getByText("draft-not save")).toBeVisible();
  expect(state.submissions).toHaveLength(0);
  expect(state.saved.has("3_MID_11")).toBe(false);
  await submitHome(page);
  await expect.poll(() => state.submissions.length).toBe(1);
  expect(state.submissions[0].evaluations).toContainEqual({
    question_id: 11,
    testing_period: "MID",
    answer: "KAYA",
  });
  await expect(homeForm(page).getByText("draft-not save")).toHaveCount(0);
  await expectNoStoredCredentials(page);
});

test("offline parent submissions retain drafts and require manual online confirmation", async ({
  page,
}) => {
  const state = await portal(page);
  await homeAnswer(page, "Plays safely at home", "KAYA").click();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    }),
  );
  await submitHome(page);
  await expect(
    homeForm(page).getByText(
      "Your draft is saved on this device. Reconnect and submit again.",
    ),
  ).toBeVisible();
  expect(state.submissions).toHaveLength(0);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    window.dispatchEvent(new Event("online"));
  });
  await expect(
    homeAnswer(page, "Plays safely at home", "KAYA"),
  ).toHaveAttribute("aria-pressed", "true");
  expect(state.submissions).toHaveLength(0);
  await submitHome(page);
  await expect.poll(() => state.submissions.length).toBe(1);
});

test("a conflicting linked-parent save refreshes locks and preserves the local draft", async ({
  page,
}) => {
  const state = await portal(page);
  await homeAnswer(page, "Plays safely at home", "KAYA").click();
  // Another linked parent submits while this parent's checklist is still open.
  state.saved.set("3_PRE_11", "DI-KAYA");
  await submitHome(page);
  await expect(
    homeForm(page).getByText(
      "Submitted answers cannot be changed. Refresh to view the saved answers.",
    ),
  ).toBeVisible();
  await expect(homeAnswer(page, "Plays safely at home", "DI-KAYA")).toHaveCount(
    0,
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), draftKey),
  ).toContain('"11":"KAYA"');
  expect(state.submissions).toHaveLength(0);
});

test("Overview shows domain-tagged home questions and saves one batch without school items", async ({
  page,
}, testInfo) => {
  const state = await portal(page);
  const form = homeForm(page);
  await expect(form.getByText("Gross Motor", { exact: true })).toHaveCount(2);
  await expect(form.getByText("Fine Motor", { exact: true })).toHaveCount(2);
  await expect(form.getByText("Walks in class")).toHaveCount(0);
  await homeAnswer(page, "Plays safely at home", "KAYA").click();
  await homeAnswer(page, "Draws at home", "DI-KAYA").click();
  await submitHome(page);
  await expect(
    form.getByText("Submitted — awaiting teacher review."),
  ).toBeVisible();
  expect(state.submissions).toEqual([
    {
      student_id: 3,
      testing_period: "PRE",
      evaluations: [
        { question_id: 11, testing_period: "PRE", answer: "KAYA" },
        { question_id: 21, testing_period: "PRE", answer: "DI-KAYA" },
      ],
    },
  ]);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), draftKey),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem("ames_draft_7_unrelated")),
  ).toBe("keep my work");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath("overview.png"),
    fullPage: true,
  });
});

test("drafts survive reload, failed saves and reconnect, and remain isolated between children", async ({
  page,
}) => {
  const state = await portal(page);
  await homeAnswer(page, "Plays safely at home", "DI-KAYA").click();
  await page.reload();
  await openHome(page);
  await expect(
    homeAnswer(page, "Plays safely at home", "DI-KAYA"),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: /Sibling Child/ }).click();
  await expect(
    homeAnswer(page, "Plays safely at home", "DI-KAYA"),
  ).toHaveAttribute("aria-pressed", "false");
  await homeAnswer(page, "Plays safely at home", "KAYA").click();
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: /Sample Child/ }).click();
  await expect(
    homeAnswer(page, "Plays safely at home", "DI-KAYA"),
  ).toHaveAttribute("aria-pressed", "true");
  state.failSave = true;
  await submitHome(page);
  await expect(
    homeForm(page).getByText(
      "Your draft is saved on this device. Reconnect and submit again.",
    ),
  ).toBeVisible();
  await page.reload();
  await openHome(page);
  await expect(
    homeAnswer(page, "Plays safely at home", "DI-KAYA"),
  ).toHaveAttribute("aria-pressed", "true");
  state.failSave = false;
  const submissions = state.submissions.length;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    homeAnswer(page, "Plays safely at home", "DI-KAYA"),
  ).toHaveAttribute("aria-pressed", "true");
  expect(state.submissions).toHaveLength(submissions);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), draftKey),
  ).not.toBeNull();
  await submitHome(page);
  await expect.poll(() => state.saved.get("3_PRE_11")).toBe("DI-KAYA");
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), draftKey))
    .toBeNull();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("eccd_draft_4_PRE_1_home_7"),
    ),
  ).toContain('"11":"KAYA"');
});

test("ECCD cards contain only names and actions; domain results ignore unsaved drafts", async ({
  page,
}, testInfo) => {
  const state = await portal(page, "/parent/eccdassessment", true);
  await page.evaluate(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          owner_id: 7,
          values: { answers: { 11: "DI-KAYA" } },
          revision: "unsaved",
          is_pending_sync: false,
        }),
      ),
    draftKey,
  );
  state.saved.set("3_PRE_11", "KAYA");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByText("Results Pending Adviser Release", { exact: true }),
  ).toHaveCount(3);
  await page
    .getByRole("button", { name: "ECCD Checklists", exact: true })
    .click();
  const button = page.getByRole("button", {
    name: "View Gross Motor",
    exact: true,
  });
  await expect(button).toBeVisible();
  await expect(
    button.locator("..").getByText(/%|Indicators|Contains Home/),
  ).toHaveCount(0);
  await button.click();
  await expect(
    page
      .getByRole("group", { name: "Plays safely at home", exact: true })
      .getByText("KAYA", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", {
        name: "Domain questions",
        exact: true,
      })
      .getByText("Walks in class"),
  ).toBeVisible();
  await expect(page.getByText("Draws at home")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Save|^KAYA$|^DI-KAYA$|Assess Domain/ }),
  ).toHaveCount(0);
  expect(state.submissions).toEqual([]);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), draftKey),
  ).toContain("unsaved");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath("domain-details.png"),
    fullPage: true,
  });
  await page.getByRole("combobox", { name: "Testing period" }).click();
  await page.getByRole("option", { name: "Mid-Test", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Domain questions", exact: true })
      .getByText("Not yet evaluated"),
  ).toHaveCount(2);
});

test("a rejected save retains the exact home answers for later review", async ({
  page,
}) => {
  const state = await portal(page);
  await homeAnswer(page, "Plays safely at home", "DI-KAYA").click();
  state.editing = false;
  await submitHome(page);
  await expect(
    homeForm(page).getByText(
      "Editing is currently locked by the Class Adviser.",
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) || "null") as unknown,
      draftKey,
    ),
  ).toMatchObject({
    values: { answers: { 11: "DI-KAYA" } },
    is_pending_sync: false,
  });
  expect(state.submissions).toEqual([]);
});

test("an older confirmed save cannot clear a newer draft revision", async ({
  page,
}) => {
  const state = await portal(page);
  let release: () => void = () => {};
  state.saveResponse = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await homeAnswer(page, "Plays safely at home", "KAYA").click();
    await submitHome(page);
    await expect.poll(() => state.submissions.length).toBe(1);
    await page.evaluate((key) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          owner_id: 7,
          values: { answers: { 11: "DI-KAYA" } },
          revision: "newer-edit",
          is_pending_sync: false,
        }),
      );
      window.dispatchEvent(new Event("ames-drafts-changed"));
    }, draftKey);
  } finally {
    release();
  }
  await expect(
    homeForm(page).getByText("Submitted — awaiting teacher review."),
  ).toBeVisible();
  await expect(homeAnswer(page, "Plays safely at home", "KAYA")).toHaveCount(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), draftKey),
  ).toContain("newer-edit");
});

test("marks restriction hides ECCD details even with home editing enabled", async ({
  page,
}) => {
  await portal(page, "/parent/eccdassessment");
  await page
    .getByRole("button", { name: "ECCD Checklists", exact: true })
    .click();
  await expect(page.getByText(/Checklist viewing is restricted/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "View Gross Motor" }),
  ).toHaveCount(0);
  await expect(page.getByText("Plays safely at home")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Official Evaluation Summary" })
    .click();
  await expect(
    page.getByText("Results Pending Adviser Release", { exact: true }),
  ).toHaveCount(3);
});

test("revoking viewing closes an open detail; failed access validation hides records", async ({
  page,
}) => {
  const state = await portal(page, "/parent/eccdassessment", true);
  await page
    .getByRole("button", { name: "ECCD Checklists", exact: true })
    .click();
  await page.getByRole("button", { name: "View Gross Motor" }).click();
  await expect(page.getByText("Walks in class")).toBeVisible();
  state.marks = false;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText(/Checklist viewing is restricted/)).toBeVisible();
  await expect(page.getByText("Walks in class")).toHaveCount(0);
  state.marks = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Walks in class")).toBeVisible();
  state.denyRead = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Assessment access unavailable.")).toBeVisible();
  await expect(page.getByText("Walks in class")).toHaveCount(0);
});

test("global and period editing locks hide Overview submissions and preserve drafts", async ({
  page,
}) => {
  const state = await portal(page);
  await homeAnswer(page, "Plays safely at home", "KAYA").click();
  state.preOpen = false;
  await page.reload();
  await openHome(page);
  await expect(homeForm(page).getByText(/Locked by teacher/)).toBeVisible();
  await expect(
    homeForm(page).getByRole("button", {
      name: "Submit Observations",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), draftKey),
  ).toContain('"11":"KAYA"');
  state.preOpen = true;
  state.editing = false;
  await page.reload();
  await openHome(page);
  await expect(homeAnswer(page, "Plays safely at home", "KAYA")).toHaveCount(0);
  expect(state.submissions).toEqual([]);
});
