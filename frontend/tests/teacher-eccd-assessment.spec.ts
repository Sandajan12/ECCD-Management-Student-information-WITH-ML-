import { expect, test, type Page } from "@playwright/test";
import type { Assessment, Domain, Period, SessionUser } from "../src/types";
import { expectNoStoredCredentials, mockSession } from "./helpers/session";

interface AssessmentScenario {
  preComplete?: boolean;
  dateOnly?: boolean;
  pendingCount?: number;
  gatesOpen?: boolean;
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
    questions: [1, 2].map((sequence) => ({
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
        masked_lrn: "Pending",
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
      json = path.endsWith("/2")
        ? target
        : {
            ...target,
            student_id: 1,
            domains,
            periodDates: { PRE: "2026-08-01", MID: "2026-09-01", POST: null },
          };
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
  await expect(page.locator("select").first()).toHaveValue("1");
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
    await page.locator("select").nth(1).selectOption(item.requested);
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
    await expect(page.locator("select").first()).toHaveValue("2");
    await expect(page.locator("select").nth(1)).toHaveValue(
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
  await page.locator("select").nth(1).selectOption("POST");
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
  await expect(page.locator("select").first()).toHaveValue("2");
  await expect(page.locator("select").nth(1)).toHaveValue("PRE");
  expect(
    await page.evaluate(() => localStorage.getItem("eccd_draft_1_POST_6_2")),
  ).toContain("DI-KAYA");
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
