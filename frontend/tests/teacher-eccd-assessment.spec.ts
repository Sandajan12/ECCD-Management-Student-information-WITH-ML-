import { expect, test, type Page } from "@playwright/test";
import type { Assessment, Domain, Period, SessionUser } from "../src/types";
import { expectNoStoredCredentials, mockSession } from "./helpers/session";

interface AssessmentScenario {
  preComplete?: boolean;
  dateOnly?: boolean;
  pendingCount?: number;
  gatesOpen?: boolean;
  checklistRows?: boolean;
  saveSucceeds?: boolean;
}

const domainNames = [
  "Gross Motor",
  "Fine Motor",
  "Self-Help",
  "Receptive Language",
  "Expressive Language",
  "Cognitive",
  "Social-Emotional",
];

async function assessmentPortal(page: Page, scenario: AssessmentScenario = {}) {
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
  const domains: Domain[] = domainNames.map((name, index) => ({
    domain_id: index + 1,
    domain_name: name,
    questions: Array.from(
      { length: scenario.checklistRows ? 8 : 2 },
      (_, i) => i + 1,
    ).map((sequence) => ({
      question_id: (index + 1) * 10 + sequence,
      domain_id: index + 1,
      question_text: `${name} indicator ${sequence}`,
      sequence_order: sequence,
      answers: { PRE: "KAYA", MID: "DI-KAYA", POST: "DI-KAYA" },
    })),
  }));
  const target: Assessment = {
    student_id: 2,
    masked_lrn: "Pending",
    domains: structuredClone(domains),
    evalAges: {},
    student_birth_date: "2021-01-01",
    periodDates: {
      PRE: scenario.preComplete ? "2026-08-01" : null,
      MID: scenario.preComplete ? null : "2026-09-01",
      POST: null,
    },
    // A parent-only display fallback must not make PRE officially complete.
    gradingDates: { PRE: "2026-08-01" },
  };
  if (!scenario.dateOnly) {
    for (const domainId of scenario.preComplete ? [3, 5] : [2, 4]) {
      const question = target.domains[domainId - 1].questions[1];
      question.answers[scenario.preComplete ? "MID" : "PRE"] = null;
      if (scenario.preComplete) question.carry_forward = { MID: "locked" };
    }
  }
  const completed: Assessment = {
    ...target,
    student_id: 1,
    domains: structuredClone(domains),
    periodDates: { PRE: "2026-08-01", MID: "2026-09-01", POST: null },
  };
  const state = {
    gatesOpen: scenario.gatesOpen || false,
    submissions: 0,
    releaseConflict: () => {},
  };
  const conflict = new Promise<void>((resolve) => {
    state.releaseConflict = resolve;
  });
  await page.addInitScript(() => {
    // This mocked online flow must not depend on the host's network adapter.
    Object.defineProperty(navigator, "onLine", { get: () => true });
    localStorage.setItem("ames_draft_2_unrelated", "keep my work");
    for (const [period, domainId, questionId] of [
      ["PRE", 2, 22],
      ["MID", 3, 32],
    ] as const) {
      localStorage.setItem(
        `eccd_draft_2_${period}_${domainId}_2`,
        JSON.stringify({
          owner_id: 2,
          revision: "retained-edit",
          is_pending_sync: false,
          values: {
            answers: { [questionId]: "KAYA" },
            evaluation_date: period === "PRE" ? "2026-08-01" : "2026-09-01",
          },
        }),
      );
    }
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path === "/api/eccd/students") {
      json = [1, 2].map((id) => ({
        student_id: id,
        first_name: id === 1 ? "Completed" : "Remaining",
        last_name: "Learner",
        masked_lrn: id === 1 ? "••••••••1234" : "Pending",
        section_id: 1,
        is_active: true,
      }));
    } else if (path === "/api/sections/") {
      json = [{ section_id: 1, section_name: "Test A" }];
    } else if (path === "/api/teachers/dashboard-filters") {
      json = {
        sections: ["Test A"],
        schoolYears: ["2026-2027"],
        currentSchoolYear: "2026-2027",
      };
    } else if (path === "/api/teachers/access-controls") {
      json = { section_id: 1, section_name: "Test A" };
    } else if (path === "/api/eccd/domains-progress") {
      // API/database order is deliberately different from checklist order.
      json = [...domains].reverse();
    } else if (path === "/api/eccd/section/1/period-gates") {
      const incomplete = {
        student_id: 2,
        full_name: "Remaining Learner",
        masked_lrn: "Pending",
        saved_count: scenario.dateOnly ? 14 : 12,
        missing_testing_date: true,
      };
      json = {
        section_id: 1,
        required_question_count: 14,
        prerequisites: {
          PRE: state.gatesOpen || scenario.preComplete ? [] : [incomplete],
          MID: state.gatesOpen ? [] : [incomplete],
        },
      };
    } else if (path.startsWith("/api/eccd/assessment/")) {
      json = path.endsWith("/2") ? target : completed;
    } else if (path === "/api/eccd/home-observations/pending") {
      json = Array.from({ length: scenario.pendingCount || 0 }, (_, index) => ({
        observation_id: index + 1,
        student_id: 2,
        question_id: 11 + index,
        testing_period: "PRE",
        answer: "KAYA",
        submitted_at: "2026-08-01T00:00:00Z",
        has_photo: false,
      }));
    } else if (path === "/api/eccd/evaluate") {
      state.submissions++;
      if (scenario.saveSucceeds) {
        const payload = route.request().postDataJSON() as {
          student_id: number;
          testing_period: Period;
          assessment_date: string;
          evaluations: { question_id: number; answer: "KAYA" | "DI-KAYA" }[];
        };
        const assessment = payload.student_id === 1 ? completed : target;
        for (const evaluation of payload.evaluations) {
          const question = assessment.domains
            .flatMap((domain) => domain.questions)
            .find((item) => item.question_id === evaluation.question_id);
          if (question)
            question.answers[payload.testing_period] = evaluation.answer;
        }
        assessment.periodDates[payload.testing_period] =
          payload.assessment_date;
        await route.fulfill({ json: { message: "Saved" } });
        return;
      }
      await conflict;
      state.gatesOpen = false;
      await route.fulfill({
        status: 409,
        json: { detail: "Complete Pre-Test for the remaining student." },
      });
      return;
    } else if (path === "/api/messages/contacts") {
      json = { myId: 2, contacts: [] };
    } else if (path === "/api/messages/unread-count") {
      json = { unreadCount: 0 };
    }
    await route.fulfill({ json });
  });
  await mockSession(page, user);
  await page.goto(
    "/teacher/eccdassessment?student_id=1&period=PRE&domain_id=6",
  );
  await expect(
    page.getByRole("heading", { name: "Cognitive", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Student", exact: true }),
  ).toHaveValue(/Completed Learner/);
  await expect(page.getByText("Loading assessments...")).toHaveCount(0);
  return state;
}

const jumpCases: {
  name: string;
  requested: Period;
  scenario: AssessmentScenario;
  expectedPeriod: Period;
  expectedDomain: string;
}[] = [
  {
    name: "Mid-Test opens first unsaved PRE domain instead of completed Cognitive",
    requested: "MID",
    scenario: {},
    expectedPeriod: "PRE",
    expectedDomain: "Fine Motor",
  },
  {
    name: "Post-Test checks PRE before MID and ignores unsaved drafts",
    requested: "POST",
    scenario: {},
    expectedPeriod: "PRE",
    expectedDomain: "Fine Motor",
  },
  {
    name: "Post-Test opens first unsaved MID domain after complete official PRE",
    requested: "POST",
    scenario: { preComplete: true },
    expectedPeriod: "MID",
    expectedDomain: "Self-Help",
  },
  {
    name: "Post-Test stays on PRE when only its official date is missing",
    requested: "POST",
    scenario: { dateOnly: true },
    expectedPeriod: "PRE",
    expectedDomain: "Gross Motor",
  },
  {
    name: "Post-Test opens first domain when only MID official date is missing",
    requested: "POST",
    scenario: { preComplete: true, dateOnly: true },
    expectedPeriod: "MID",
    expectedDomain: "Gross Motor",
  },
];

for (const item of jumpCases) {
  test(`teacher smart domain jump: ${item.name}`, async ({ page }) => {
    const state = await assessmentPortal(page, item.scenario);
    await page
      .getByLabel("Period", { exact: true })
      .selectOption(item.requested);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(
      item.expectedPeriod === "PRE"
        ? "Finish Pre-Test first"
        : "Finish Mid-Test first",
    );
    await dialog
      .getByRole("button", { name: "Assess Student", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("heading", { name: item.expectedDomain, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Student", exact: true }),
    ).toHaveValue(/Remaining Learner/);
    await expect(page.getByLabel("Period", { exact: true })).toHaveValue(
      item.expectedPeriod,
    );
    await expect(page.locator('input[type="date"]')).toBeVisible();
    expect(state.submissions).toBe(0);
    expect(
      await page.evaluate(() => localStorage.getItem("ames_draft_2_unrelated")),
    ).toBe("keep my work");
    expect(
      await page.evaluate(() => localStorage.getItem("eccd_draft_2_PRE_2_2")),
    ).toContain("retained-edit");
    await expectNoStoredCredentials(page);
  });
}

test("teacher smart domain jump: prerequisite modal from domain grid opens unsaved PRE domain", async ({
  page,
}) => {
  const state = await assessmentPortal(page, { gatesOpen: true });
  await page.getByLabel("Period", { exact: true }).selectOption("POST");
  await page
    .getByRole("button", { name: "Save Assessment", exact: true })
    .click();
  await expect.poll(() => state.submissions).toBe(1);
  await page
    .getByRole("button", { name: "Back to Domains", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Assess Domain", exact: true }),
  ).toHaveCount(7);
  // A stale save can discover the gate after the teacher returns to the grid.
  state.releaseConflict();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Finish Pre-Test first");
  await dialog
    .getByRole("button", { name: "Assess Student", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Fine Motor", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Student", exact: true }),
  ).toHaveValue(/Remaining Learner/);
  await expect(page.getByLabel("Period", { exact: true })).toHaveValue("PRE");
  expect(
    await page.evaluate(() => localStorage.getItem("eccd_draft_1_POST_6_2")),
  ).toContain("DI-KAYA");
});

test("teacher checklist student search filters names and masked LRNs with saved counts", async ({
  page,
}) => {
  const state = await assessmentPortal(page);
  await page.getByRole("button", { name: /^Domain 2: Fine Motor,/ }).click();
  const student = page.getByRole("combobox", { name: "Student", exact: true });
  await student.fill("learner");
  const options = page.getByRole("listbox").getByRole("option");
  await expect(options).toHaveCount(2);
  await expect(options.filter({ hasText: "Completed Learner" })).toContainText(
    "Saved: 2 / 2",
  );
  // The retained KAYA draft must not inflate the server-saved count.
  await expect(options.filter({ hasText: "Remaining Learner" })).toContainText(
    "Saved: 1 / 2",
  );
  await student.fill("1234");
  await expect(options).toHaveCount(1);
  await expect(options).toContainText("••••••••1234");
  await student.fill("rEmAiNiNg");
  await expect(options).toHaveCount(1);
  await options.click();
  await expect(student).toHaveValue("Remaining Learner (Pending)");
  await expect(
    page.getByRole("heading", { name: "Fine Motor", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Period", { exact: true })).toHaveValue("PRE");
  await expect(page.locator("tbody tr").nth(1)).toContainText(
    "Fine Motor indicator 2",
  );
  await expect(
    page.getByText("1 unsaved change", { exact: true }).first(),
  ).toBeVisible();
  await student.fill("missing student");
  await expect(
    page.getByText("No students found", { exact: true }),
  ).toBeVisible();
  await student.fill("");
  await expect(options).toHaveCount(2);
  await student.press("Escape");
  expect(state.submissions).toBe(0);
  await expectNoStoredCredentials(page);
});

test("teacher checklist quick navigation retains drafts and refreshes saved completion", async ({
  page,
}) => {
  const state = await assessmentPortal(page, { saveSucceeds: true });
  const student = page.getByRole("combobox", { name: "Student", exact: true });
  const previous = page.getByRole("button", {
    name: "Previous Student",
    exact: true,
  });
  const next = page.getByRole("button", { name: "Next Student", exact: true });
  const fineMotor = page.getByRole("button", {
    name: /^Domain 2: Fine Motor,/,
  });
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(student).toHaveValue(/Remaining Learner/);
  await expect(next).toBeDisabled();
  await fineMotor.click();
  await expect(fineMotor).toHaveAttribute("aria-pressed", "true");
  await expect(fineMotor).toContainText("1/2 *");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  const answer = page
    .locator("tbody tr")
    .nth(1)
    .getByRole("button", { name: "DI-KAYA", exact: true })
    .first();
  await answer.click();
  await page.getByLabel("Grading Date", { exact: true }).fill("2026-08-02");
  await previous.click();
  await expect(student).toHaveValue(/Completed Learner/);
  await expect(
    page.getByRole("heading", { name: "Fine Motor", exact: true }),
  ).toBeVisible();
  await expect(fineMotor).toContainText("2/2");
  await next.click();
  await expect(student).toHaveValue(/Remaining Learner/);
  await expect(page.getByLabel("Grading Date", { exact: true })).toHaveValue(
    "2026-08-02",
  );
  await page.getByRole("button", { name: /^Domain 1: Gross Motor,/ }).click();
  await expect(
    page.getByRole("heading", { name: "Gross Motor", exact: true }),
  ).toBeVisible();
  await expect(student).toHaveValue(/Remaining Learner/);
  await fineMotor.click();
  await expect(page.getByLabel("Grading Date", { exact: true })).toHaveValue(
    "2026-08-02",
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("eccd_draft_2_PRE_2_2") || "null")
          .values.answers[22],
    ),
  ).toBe("DI-KAYA");
  await expect(answer).toHaveClass(/bg-rose-600/);
  expect(state.submissions).toBe(0);
  await page
    .getByRole("button", { name: "Save Assessment", exact: true })
    .click();
  await expect(
    page.getByText("Assessment Saved Successfully!", { exact: true }),
  ).toBeVisible();
  await expect(fineMotor).toContainText("2/2");
  await expect(fineMotor).not.toContainText("*");
  expect(state.submissions).toBe(1);
  expect(
    await page.evaluate(() => localStorage.getItem("eccd_draft_2_PRE_2_2")),
  ).toBeNull();
  await previous.click();
  await next.click();
  await expect(student).toHaveValue(/Remaining Learner/);
  await expect(fineMotor).toContainText("2/2");
  expect(
    await page.evaluate(() => localStorage.getItem("ames_draft_2_unrelated")),
  ).toBe("keep my work");
  await expectNoStoredCredentials(page);
});

for (const width of [1024, 1280]) {
  test(`teacher checklist compact layout at ${width}px shows questions without initial scroll`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 720 });
    await assessmentPortal(page, { checklistRows: true });
    await expect(page.locator("tbody tr")).toHaveCount(8);
    const toolbar = page.getByRole("group", {
      name: "Assessment actions",
      exact: true,
    });
    const geometry = await toolbar.evaluate((element) => {
      const rects = [...element.children].map((child) =>
        child.getBoundingClientRect(),
      );
      return {
        tops: rects.map((rect) => rect.top),
        bottoms: rects.map((rect) => rect.bottom),
        rights: rects.map((rect) => rect.right),
        viewport: window.innerWidth,
      };
    });
    expect(Math.max(...geometry.tops)).toBeLessThan(
      Math.min(...geometry.bottoms),
    );
    expect(Math.max(...geometry.rights)).toBeLessThanOrEqual(geometry.viewport);
    const row = page.locator("tbody tr").nth(3);
    const fourthQuestion = await row.boundingBox();
    expect(fourthQuestion!.y).toBeGreaterThan(0);
    expect(fourthQuestion!.y + fourthQuestion!.height).toBeLessThanOrEqual(720);
    await expect(
      row.getByRole("button", { name: "KAYA", exact: true }).first(),
    ).toBeInViewport({ ratio: 1 });
    await expect(
      row.getByRole("button", { name: "KAYA", exact: true }).first(),
    ).toBeEnabled();
    expect(
      await page
        .locator("[data-layout-content]")
        .evaluate((element) => element.scrollTop),
    ).toBe(0);
    await expect(page.getByText(/^Grading Date:/)).toHaveCount(0);
    await expect(
      page.getByLabel("Grading Date", { exact: true }),
    ).toBeVisible();
    expect(
      await page
        .getByRole("navigation", { name: "Checklist domains", exact: true })
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    if (testInfo.project.name === "desktop")
      await page.screenshot({
        path: testInfo.outputPath(`checklist-${width}.png`),
      });
    await page.evaluate(() => {
      const content = document.querySelector("[data-layout-content]");
      content?.scrollTo(0, content.scrollHeight);
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    const last = await page.locator("tbody tr").last().boundingBox();
    const save = await page
      .getByRole("button", { name: "Save Assessment", exact: true })
      .boundingBox();
    expect(last!.y + last!.height).toBeLessThanOrEqual(save!.y);
    expect(
      await page
        .locator("main .pb-24")
        .evaluate((element) => getComputedStyle(element).paddingBottom),
    ).toBe("96px");
  });
}

test("teacher checklist mobile controls fit without page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await assessmentPortal(page, { checklistRows: true });
  await expect(
    page.getByRole("combobox", { name: "Student", exact: true }),
  ).toBeInViewport();
  const pills = page.getByRole("navigation", {
    name: "Checklist domains",
    exact: true,
  });
  await expect(pills.getByRole("button")).toHaveCount(7);
  await pills.getByRole("button", { name: /^Domain 7:/ }).click();
  await expect(
    page.getByRole("heading", { name: "Social-Emotional", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  await page.evaluate(() => {
    const content = document.querySelector("[data-layout-content]");
    content?.scrollTo(0, content.scrollHeight);
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  const last = await page.locator("tbody tr").last().boundingBox();
  const save = await page
    .getByRole("button", { name: "Save Assessment", exact: true })
    .boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(save!.y);
});

for (const count of [0, 3]) {
  test(`teacher pending review toolbar: compact amber action with count ${count}`, async ({
    page,
  }) => {
    await assessmentPortal(page, { pendingCount: count });
    await page
      .getByRole("button", { name: "Back to Domains", exact: true })
      .click();
    const toolbar = page.getByRole("group", {
      name: "Assessment actions",
      exact: true,
    });
    const button = toolbar.getByRole("button", {
      name: `Pending Home-Based Assessments ${count}`,
      exact: true,
    });
    await expect(button).toBeVisible();
    await expect(toolbar.getByText("Online", { exact: true })).toBeVisible();
    await expect(
      toolbar.getByRole("button", { name: "Preview ECCD Card", exact: true }),
    ).toBeVisible();
    await expect(
      toolbar.getByRole("button", { name: "Download", exact: true }),
    ).toBeVisible();
    await expect(
      button.locator('svg[data-testid="PendingActionsIcon"]'),
    ).toBeVisible();
    // Hover uses a stronger tint, so inspect the resting state away from controls.
    await page.mouse.move(0, 0);
    await expect(button).toHaveCSS(
      "background-color",
      count ? "rgb(255, 247, 237)" : "rgb(255, 251, 235)",
    );
    await expect(button).toHaveCSS(
      "border-top-color",
      count ? "rgb(249, 115, 22)" : "rgb(253, 186, 116)",
    );
    await expect(button).toHaveCSS(
      "color",
      count ? "rgb(154, 52, 18)" : "rgb(180, 83, 9)",
    );
    const badge = button.getByText(String(count), { exact: true });
    await expect(badge).toHaveCSS(
      "background-color",
      count ? "rgb(234, 88, 12)" : "rgb(255, 237, 213)",
    );
    await expect(badge).toHaveCSS(
      "color",
      count ? "rgb(255, 255, 255)" : "rgb(180, 83, 9)",
    );
    const geometry = await button.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        width: rect.width,
        right: rect.right,
        viewport: window.innerWidth,
        flexGrow: getComputedStyle(element).flexGrow,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    expect(geometry.flexGrow).toBe("0");
    expect(geometry.width).toBeLessThan(geometry.viewport * 0.9);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.overflow).toBe(false);
    await button.click();
    await expect(page.getByRole("dialog")).toContainText(
      "Pending Home-Based Assessments",
    );
    if (count)
      await expect(
        page.getByRole("button", { name: "Accept all in this domain" }),
      ).toBeVisible();
    else
      await expect(
        page.getByText("No pending observations for this selection."),
      ).toBeVisible();
  });
}
