import { expect, test, type Page } from "@playwright/test";
import type {
  Answer,
  Assessment,
  Permissions,
  Period,
  SessionUser,
  Student,
} from "../src/types";

interface HomeSubmission {
  student_id: number;
  testing_period: Period;
  evaluations: {
    question_id: number;
    testing_period: Period;
    answer: Answer;
  }[];
}

interface PortalState {
  marks: boolean;
  editing: boolean;
  preOpen: boolean;
  failSave: boolean;
  denyRead: boolean;
  saveResponse: Promise<void> | null;
  submissions: HomeSubmission[];
  saved: Map<string, Answer>;
}

const draftKey = "eccd_draft_3_PRE_1_home_7";

async function portal(page: Page, path = "/parent/dashboard", marks = false) {
  const state: PortalState = {
    marks,
    editing: true,
    preOpen: true,
    failSave: false,
    denyRead: false,
    saveResponse: null,
    submissions: [],
    saved: new Map([["3_PRE_12", "KAYA"]]),
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
  await page.addInitScript((account) => {
    if (!localStorage.getItem("token")) {
      const payload = btoa(JSON.stringify({ exp: Date.now() / 1000 + 3600 }));
      localStorage.setItem("user", JSON.stringify(account));
      localStorage.setItem("token", `test.${payload}.test`);
      localStorage.setItem("ames_draft_7_unrelated", "keep my work");
    }
  }, user);

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
          MID: null,
          POST: null,
        },
        evaluator_roles: {
          PRE: question.is_home_based
            ? ("parent" as const)
            : ("teacher" as const),
        },
        parent_locked: {
          PRE: state.saved.has(`${id}_PRE_${question.question_id}`),
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
        mid_test_parent_editable: false,
        post_test_parent_editable: false,
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
      for (const row of payload.evaluations)
        state.saved.set(
          `${payload.student_id}_${row.testing_period}_${row.question_id}`,
          row.answer,
        );
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
  await page.goto(path);
  return state;
}

const homeForm = (page: Page) =>
  page.getByRole("region", { name: "Home-Based Assessment", exact: true });
const homeAnswer = (page: Page, name: string, answer: Answer) =>
  homeForm(page)
    .getByRole("group", { name, exact: true })
    .getByRole("button", { name: answer, exact: true });

async function submitHome(page: Page) {
  await homeForm(page)
    .getByRole("button", { name: "Save Home Observations" })
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
    .getByRole("button", { name: "Save Home Observations" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Submit Answers" });
  await expect(
    dialog.getByText(
      "Submitted evaluations cannot be changed. Any unanswered questions can still be completed later.",
    ),
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
  await expect(homeAnswer(page, "Plays safely at home", "KAYA")).toBeDisabled();
  await page.reload();
  await expect(homeAnswer(page, "Plays safely at home", "KAYA")).toBeDisabled();
  await homeAnswer(page, "Draws at home", "DI-KAYA").click();
  await submitHome(page);
  await expect.poll(() => state.submissions.length).toBe(2);
  expect(state.submissions[1].evaluations).toEqual([
    { question_id: 21, testing_period: "PRE", answer: "DI-KAYA" },
  ]);
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
  await expect(
    homeAnswer(page, "Plays safely at home", "DI-KAYA"),
  ).toBeDisabled();
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
    form.getByText("Assessment evaluations saved successfully!"),
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
      .getByRole("region", { name: "Home-Based Questions", exact: true })
      .getByText("KAYA", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", {
        name: "School-Administered Questions",
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
      .getByRole("region", { name: "Home-Based Questions", exact: true })
      .getByText("Not yet evaluated"),
  ).toBeVisible();
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
    homeForm(page).getByText("Assessment evaluations saved successfully!"),
  ).toBeVisible();
  await expect(
    homeAnswer(page, "Plays safely at home", "KAYA"),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(homeAnswer(page, "Plays safely at home", "KAYA")).toBeDisabled();
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

test("global and period editing locks disable Overview submissions and preserve drafts", async ({
  page,
}) => {
  const state = await portal(page);
  await homeAnswer(page, "Plays safely at home", "KAYA").click();
  state.preOpen = false;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    homeForm(page).getByText(/Editing Closed by Teacher/),
  ).toBeVisible();
  await expect(
    homeForm(page).getByRole("button", { name: "Save Home Observations" }),
  ).toBeDisabled();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), draftKey),
  ).toContain('"11":"KAYA"');
  state.preOpen = true;
  state.editing = false;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(homeAnswer(page, "Plays safely at home", "KAYA")).toBeDisabled();
  expect(state.submissions).toEqual([]);
});
