import { expect, test, type Page } from "@playwright/test";

interface DashboardState {
  requests: URL[];
  sectionId: number | null;
  failSummary: boolean;
  failChart: boolean;
  holdMid: Promise<void> | null;
  allMastered: boolean;
  allEvaluated: boolean;
  failPending: boolean;
  holdPending: Promise<void> | null;
}

async function dashboard(page: Page): Promise<DashboardState> {
  const state: DashboardState = {
    requests: [],
    sectionId: 1,
    failSummary: false,
    failChart: false,
    holdMid: null,
    allMastered: false,
    allEvaluated: false,
    failPending: false,
    holdPending: null,
  };
  await page.addInitScript(() => {
    localStorage.setItem(
      "token",
      `test.${btoa(JSON.stringify({ exp: Date.now() / 1000 + 3600 }))}.test`,
    );
    localStorage.setItem(
      "user",
      JSON.stringify({
        id: 2,
        role: "admin",
        email: "teacher@example.test",
        full_name: "Taylor Teacher",
        section_id: 1,
        section_name: "Diamond",
        allow_eccd_question_management: false,
      }),
    );
    localStorage.setItem("ames_draft_2_unrelated", "preserve");
  });
  const sections = [
    { section_id: 1, section_name: "Diamond" },
    { section_id: 2, section_name: "Emerald" },
  ];
  const domainsForAssessment = [
    "Gross Motor Domain",
    "Cognitive Domain",
    "Expressive Language Domain",
  ].map((domain_name, index) => ({
    domain_id: index + 1,
    domain_name,
    pre_progress: 0,
    mid_progress: 0,
    post_progress: 0,
    questions: [
      {
        question_id: index + 1,
        domain_id: index + 1,
        question_text: `Indicator ${index + 1}`,
        sequence_order: index + 1,
        is_home_based: index === 2,
      },
    ],
  }));
  const evaluationsFor = (studentId: number) =>
    ["PRE", "MID", "POST"].flatMap((testing_period) => {
      const complete =
        state.allEvaluated ||
        (testing_period === "PRE" && [1, 10].includes(studentId)) ||
        (testing_period === "MID" && studentId === 2);
      const questionIds =
        complete || (testing_period === "PRE" && studentId === 3)
          ? [1, 2, 3]
          : studentId === 2 && testing_period === "PRE"
            ? [1]
            : [];
      return questionIds.map((question_id) => ({
        question_id,
        testing_period,
        answer: "KAYA",
        teacher_evaluation_date:
          testing_period === "PRE" && studentId === 3 && !state.allEvaluated
            ? null
            : "2026-08-01",
      }));
    });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/\/$/, "");
    const section = sections.find((s) => s.section_id === state.sectionId);
    if (path === "/api/eccd/domains-progress") {
      await route.fulfill({ json: domainsForAssessment });
    } else if (path === "/api/eccd/students") {
      await state.holdPending;
      await route.fulfill({
        json: [
          {
            student_id: 1,
            first_name: "Ada",
            last_name: "Example",
            section_id: 1,
            is_active: true,
            masked_lrn: "********0001",
          },
          {
            student_id: 2,
            first_name: "Ben",
            last_name: "Example",
            section_id: 1,
            is_active: true,
            masked_lrn: "********0002",
          },
          {
            student_id: 3,
            first_name: "Dana",
            last_name: "Example",
            section_id: 1,
            is_active: true,
            masked_lrn: "",
          },
          {
            student_id: 10,
            first_name: "Cara",
            last_name: "Example",
            section_id: 2,
            is_active: true,
            masked_lrn: "********0010",
          },
          {
            student_id: 99,
            first_name: "Inactive",
            last_name: "Student",
            section_id: 1,
            is_active: false,
            masked_lrn: "",
          },
        ],
      });
    } else if (path.startsWith("/api/eccd/student/")) {
      if (state.failPending)
        await route.fulfill({ status: 503, json: { detail: "Unavailable" } });
      else
        await route.fulfill({
          json: evaluationsFor(Number(path.split("/").pop())),
        });
    } else if (path.startsWith("/api/eccd/assessment/")) {
      const student_id = Number(path.split("/").pop());
      const records = evaluationsFor(student_id);
      await route.fulfill({
        json: {
          student_id,
          masked_lrn: "********0002",
          student_birth_date: "2022-01-01",
          pre_kaya_question_ids: [],
          evalAges: {},
          periodDates: { PRE: "2026-08-01", MID: null, POST: null },
          domains: domainsForAssessment.map((domain) => ({
            ...domain,
            questions: domain.questions.map((question) => ({
              ...question,
              answers: Object.fromEntries(
                ["PRE", "MID", "POST"].map((period) => [
                  period,
                  records.find(
                    (record) =>
                      record.question_id === question.question_id &&
                      record.testing_period === period,
                  )?.answer || null,
                ]),
              ),
            })),
          })),
        },
      });
    } else if (path === "/api/settings") {
      await route.fulfill({
        json: {
          current_school_year: "2026-2027",
          school_name: "Sample School",
        },
      });
    } else if (path === "/api/sections") {
      await route.fulfill({ json: sections });
    } else if (path.endsWith("/access-controls")) {
      await route.fulfill({
        json: {
          section_id: section?.section_id ?? null,
          section_name: section?.section_name ?? null,
          allow_eccd_question_management: false,
        },
      });
    } else if (path.endsWith("/dashboard-filters")) {
      await route.fulfill({
        json: {
          sections: section ? [section.section_name] : [],
          domains: [
            "Gross Motor Domain",
            "Cognitive Domain",
            "Expressive Language Domain",
          ],
        },
      });
    } else if (
      path.endsWith("/dashboard-stats") ||
      path.endsWith("/dashboard-pie")
    ) {
      state.requests.push(url);
      const period = url.searchParams.get("period");
      const fail = path.endsWith("/dashboard-stats")
        ? state.failSummary
        : state.failChart;
      const requestedSection = Number(url.searchParams.get("section_id"));
      if (period === "MID") await state.holdMid;
      if (fail) {
        await route.fulfill({ status: 503, json: { detail: "Unavailable" } });
        return;
      }
      const empty = period === "POST";
      const counts =
        period === "MID"
          ? [
              [2, 3],
              [1, 2],
              [9, 1],
            ]
          : [
              [3, 1],
              [1, 4],
              [2, 1],
            ];
      const domains = [
        "Gross Motor Domain",
        "Cognitive Domain",
        "Expressive Language Domain",
      ].map((domainName, i) => {
        const [kaya, failed] = counts[i];
        const totalKaya = state.allMastered ? kaya + failed : kaya;
        const totalDiKaya = state.allMastered ? 0 : failed;
        return {
          domainId: i + 1,
          domainName,
          totalKaya,
          totalDiKaya,
          totalItems: totalKaya + totalDiKaya,
          masteryRate:
            Math.round((totalKaya * 10000) / (totalKaya + totalDiKaya)) / 100,
        };
      });
      if (path.endsWith("/dashboard-stats")) {
        await route.fulfill({
          json: {
            stats: {
              totalStudents: "3",
              unreadMessages: "1",
              eccdProgress: "10%",
            },
            messages: [
              {
                id: 1,
                read: false,
                name: "Sample Parent",
                time: "Nov 1",
                preview: "Hello teacher",
              },
            ],
            teacherInsights: {
              period,
              totalStudents: 3,
              completedStudents: state.allEvaluated ? 3 : empty ? 0 : 1,
              completionRate: empty ? 0 : 33.33,
              domains: empty ? [] : domains,
              excellingDomain: empty ? null : domains[period === "MID" ? 2 : 0],
              criticalDomain:
                empty || state.allMastered
                  ? null
                  : domains[period === "MID" ? 0 : 1],
              priorityStudent:
                empty || state.allMastered
                  ? null
                  : {
                      studentId:
                        requestedSection === 2 ? 10 : period === "MID" ? 2 : 1,
                      studentName:
                        requestedSection === 2
                          ? "Cara Example"
                          : period === "MID"
                            ? "Ben Example"
                            : "Ada Example",
                      totalDiKaya: 5,
                    },
            },
          },
        });
      } else {
        const selected = domains.filter(
          (d) =>
            url.searchParams.get("domain") === "All" ||
            d.domainName === url.searchParams.get("domain"),
        );
        await route.fulfill({
          json: [
            {
              name: "KAYA",
              value: empty
                ? 0
                : selected.reduce((sum, d) => sum + d.totalKaya, 0),
              color: "#10b981",
            },
            {
              name: "DI-KAYA",
              value: empty
                ? 0
                : selected.reduce((sum, d) => sum + d.totalDiKaya, 0),
              color: "#ef4444",
            },
          ],
        });
      }
    } else {
      await route.fulfill({
        json: path.endsWith("unread-count") ? { unreadCount: 1 } : [],
      });
    }
  });
  await page.goto("/teacher/dashboard");
  await expect(
    page.getByRole("article", { name: "Domain of Excellence" }),
  ).toContainText("75% Kaya");
  return state;
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("shared lookups and analytics load once after cached assignment validation", async ({
  page,
}) => {
  const state = await dashboard(page);
  // A cached section from an earlier session must not start analytics while
  // the current assignment is still being validated.
  state.sectionId = 2;
  state.requests.length = 0;
  const lookups: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      [
        "/api/settings",
        "/api/sections/",
        "/api/teachers/access-controls",
        "/api/teachers/dashboard-filters",
      ].includes(path)
    )
      lookups.push(path);
  });
  let release = () => {};
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/teachers/dashboard-filters", async (route) => {
    await hold;
    await route.fallback();
  });
  await page.reload();
  await expect.poll(() => lookups.length).toBe(4);
  await expect(
    page.getByText("Section: Diamond", { exact: true }),
  ).toBeVisible();
  expect(state.requests).toHaveLength(0);
  release();
  await expect(
    page.getByRole("article", { name: "Domain of Excellence" }),
  ).toContainText("75% Kaya");
  await expect(
    page.getByText("Section: Emerald", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/12 recorded items/)).toBeVisible();
  expect(state.requests).toHaveLength(2);
  expect(
    state.requests.every(
      (url) =>
        url.searchParams.get("section_id") === "2" &&
        url.searchParams.get("period") === "PRE",
    ),
  ).toBe(true);
  for (const path of new Set(lookups))
    expect(lookups.filter((item) => item === path)).toHaveLength(1);

  // Overlapping refresh triggers join each pending GET. Updating the session
  // from access-controls must not start another provider load.
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
  });
  await expect.poll(() => state.requests.length).toBe(4);
  await expect.poll(() => lookups.length).toBe(7);
  expect(lookups.filter((path) => path === "/api/settings")).toHaveLength(1);
  for (const path of new Set(
    lookups.filter((path) => path !== "/api/settings"),
  ))
    expect(lookups.filter((item) => item === path)).toHaveLength(2);
  expect(
    await page.evaluate(() => localStorage.getItem("ames_draft_2_unrelated")),
  ).toBe("preserve");
});

test("four equal cards, aligned filters and balanced panels fit every viewport", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const state = await dashboard(page);
  const cards = page
    .getByRole("region", { name: "Section statistics" })
    .getByRole("article");
  await expect(cards).toHaveCount(4);
  await expect(cards.locator("h2")).toHaveText([
    "Total Students",
    "Assessment Progress",
    "Domain of Excellence",
    "Critical Domain Focus",
  ]);
  await expect(cards.nth(0)).toContainText("Active Enrollees");
  await expect(cards.nth(1)).toContainText("1 / 3");
  await expect(cards.nth(1)).toContainText("Evaluations Completed");
  await expect(cards.nth(2)).toContainText("75% Kaya");
  await expect(cards.nth(3)).toContainText("80% Di-Kaya");
  await expect(
    page.getByRole("article", { name: "Priority Intervention" }),
  ).toHaveCount(0);
  await expect(cards.nth(2).locator("span[title]")).toHaveClass(
    /border-emerald-200/,
  );
  await expect(cards.nth(3).locator("span[title]")).toHaveClass(
    /border-rose-200/,
  );
  expect(
    await cards
      .locator("span[title]")
      .evaluateAll((nodes) =>
        nodes.every((node) => node.scrollWidth <= node.clientWidth + 1),
      ),
  ).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Unread Messages", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Pending Evaluations" }),
  ).toHaveCount(1);
  await expect(page.getByRole("combobox")).toHaveCount(3);
  await expect(
    page.getByRole("textbox", { name: "Section", exact: true }),
  ).toHaveCount(0);
  const sizes = await cards.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().height),
  );
  expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  const columns = await page
    .getByRole("region", { name: "Section statistics" })
    .evaluate(
      (node) => getComputedStyle(node).gridTemplateColumns.split(" ").length,
    );
  const width = page.viewportSize()!.width;
  expect(columns).toBe(width >= 1024 ? 4 : width >= 640 ? 2 : 1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  expect(
    state.requests.every(
      (url) =>
        url.searchParams.get("section_id") === "1" &&
        url.searchParams.get("period") === "PRE",
    ),
  ).toBe(true);
  const chart = page.getByRole("region", {
    name: "ECCD Development",
    exact: true,
  });
  const pending = page.getByRole("region", {
    name: "Pending Evaluations",
    exact: true,
  });
  const chartBox = (await chart.boundingBox())!;
  const pendingBox = (await pending.boundingBox())!;
  await expect(chart.getByText("Total Kaya: 6", { exact: true })).toBeVisible();
  await expect(
    chart.getByText("Total Di-Kaya: 6", { exact: true }),
  ).toBeVisible();
  const chartCanvas = chart.locator('[aria-label="ECCD development chart"]');
  await expect(chartCanvas.locator("svg.recharts-surface")).toBeVisible();
  await expect
    .poll(() =>
      chartCanvas.evaluate((node) => {
        const canvas = node.getBoundingClientRect();
        const sectors = [...node.querySelectorAll(".recharts-pie-sector path")];
        return (
          sectors.length > 0 &&
          sectors.every((sector) => {
            const box = sector.getBoundingClientRect();
            return (
              box.width > 0 &&
              box.height > 0 &&
              box.top >= canvas.top &&
              box.bottom <= canvas.bottom &&
              box.left >= canvas.left &&
              box.right <= canvas.right
            );
          })
        );
      }),
    )
    .toBe(true);
  const totalsBox = (await chart
    .getByText("Total Kaya: 6", { exact: true })
    .boundingBox())!;
  const canvasBox = (await chartCanvas.boundingBox())!;
  expect(totalsBox.y).toBeGreaterThanOrEqual(canvasBox.y + canvasBox.height);
  if (width >= 1024) {
    expect(Math.abs(chartBox.width - pendingBox.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(chartBox.height - pendingBox.height)).toBeLessThanOrEqual(
      1,
    );
    expect(Math.abs(chartBox.y - pendingBox.y)).toBeLessThanOrEqual(1);
  } else expect(pendingBox.y).toBeGreaterThan(chartBox.y);
  const sectionBox = (await page
    .getByText("Section: Diamond", { exact: true })
    .boundingBox())!;
  const yearBox = (await page
    .getByRole("combobox", { name: "School Year" })
    .boundingBox())!;
  expect(sectionBox.height).toBeCloseTo(40, 0);
  if (width >= 640)
    expect(Math.abs(sectionBox.y - yearBox.y)).toBeLessThanOrEqual(1);
  const headers = await cards.evaluateAll((nodes) =>
    nodes.map((node) => {
      const header = node.firstElementChild!;
      const icon = header.firstElementChild!;
      const svg = icon.querySelector("svg")!;
      return [
        icon.getBoundingClientRect().width,
        icon.getBoundingClientRect().height,
        svg.getBoundingClientRect().width,
        svg.getBoundingClientRect().height,
      ];
    }),
  );
  expect(headers).toEqual(Array.from({ length: 4 }, () => [32, 32, 16, 16]));
  expect(errors).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath("dashboard.png"),
    fullPage: true,
  });
});

test("domain affects chart and period affects all insights without a fallback", async ({
  page,
}) => {
  const state = await dashboard(page);
  await choose(page, "Domain", "Gross Motor Domain");
  await expect(
    page.getByText("Gross Motor: 75% Kaya", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/4 recorded items/)).toBeVisible();
  await expect(page.getByText("Total Kaya: 3", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Total Di-Kaya: 1", { exact: true }),
  ).toBeVisible();
  await choose(page, "Assessment Period", "Mid-Test (MoSY)");
  await expect(
    page.getByRole("article", { name: "Domain of Excellence" }),
  ).toContainText("Expressive Language");
  await expect(
    page.getByRole("article", { name: "Critical Domain Focus" }),
  ).toContainText("60% Di-Kaya");
  await expect(
    page.getByText("Gross Motor: 40% Kaya", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/5 recorded items/)).toBeVisible();
  await expect(page.getByText("Total Kaya: 2", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Total Di-Kaya: 3", { exact: true }),
  ).toBeVisible();
  await choose(page, "Assessment Period", "Post-Test (EoSY)");
  await expect(
    page.getByRole("article", { name: "Assessment Progress" }),
  ).toContainText("0 / 3");
  await expect(
    page.getByRole("article", { name: "Domain of Excellence" }),
  ).toContainText("No Data");
  await expect(
    page.getByText("No ECCD assessment data for this selection."),
  ).toBeVisible();
  await expect(page.getByText("Total Kaya: 0", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Total Di-Kaya: 0", { exact: true }),
  ).toBeVisible();
  expect(
    state.requests.some(
      (url) =>
        url.searchParams.get("period") === "MID" &&
        url.searchParams.get("domain") === "Gross Motor Domain",
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => localStorage.getItem("ames_draft_2_unrelated")),
  ).toBe("preserve");
});

test("late responses cannot restore old period or section metrics", async ({
  page,
}) => {
  const state = await dashboard(page);
  let release = () => {};
  state.holdMid = new Promise<void>((resolve) => {
    release = resolve;
  });
  await choose(page, "Assessment Period", "Mid-Test (MoSY)");
  await expect
    .poll(
      () =>
        state.requests.filter((url) => url.searchParams.get("period") === "MID")
          .length,
    )
    .toBeGreaterThanOrEqual(2);
  await choose(page, "Assessment Period", "Post-Test (EoSY)");
  await expect(
    page.getByRole("article", { name: "Critical Domain Focus" }),
  ).toContainText("No Data");
  release();
  await expect(
    page.getByRole("article", { name: "Critical Domain Focus" }),
  ).not.toContainText("Gross Motor");
  await choose(page, "Assessment Period", "Pre-Test (BoSY)");
  state.sectionId = 2;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("article", { name: "Critical Domain Focus" }),
  ).toContainText("Cognitive");
  await expect(
    page.getByText("Section: Emerald", { exact: true }),
  ).toBeVisible();
  expect(
    state.requests.some((url) => url.searchParams.get("section_id") === "2"),
  ).toBe(true);
});

test("errors, mastery and lost assignment clear unsupported insights and preserve drafts", async ({
  page,
}) => {
  const state = await dashboard(page);
  state.failSummary = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("status")).toHaveText("Summary unavailable");
  await expect(
    page.getByRole("article", { name: "Domain of Excellence" }),
  ).not.toContainText("75% Kaya");
  await expect(page.getByText(/12 recorded items/)).toBeVisible();
  state.failSummary = false;
  state.failChart = true;
  state.allMastered = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    page.getByText("Assessment data unavailable", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Domain of Excellence" }),
  ).toContainText("100% Kaya");
  await expect(
    page.getByRole("article", { name: "Critical Domain Focus" }),
  ).toContainText("No Di-Kaya Recorded");
  state.sectionId = null;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("status")).toHaveText("No section assigned");
  await expect(
    page.getByRole("article", { name: "Domain of Excellence" }),
  ).not.toContainText("100% Kaya");
  expect(
    await page.evaluate(() => localStorage.getItem("ames_draft_2_unrelated")),
  ).toBe("preserve");
});

test("pending list includes partial and parent-only work, follows periods and opens the right sheet", async ({
  page,
}) => {
  await dashboard(page);
  const panel = page.getByRole("region", {
    name: "Pending Evaluations",
    exact: true,
  });
  const list = panel.getByRole("list");
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list).toContainText("Ben Example");
  await expect(list).toContainText("Dana Example");
  await expect(list).not.toContainText("Ada Example");
  await expect(list).not.toContainText("Cara Example");
  await expect(list).not.toContainText("Inactive");
  await expect(list).toContainText("LRN: ********0002");
  await expect(list.getByText("Pending", { exact: true })).toHaveCount(2);
  const target = panel.getByRole("link", { name: "Assess Ben Example" });
  await expect(target).toHaveAttribute(
    "href",
    "/teacher/eccdassessment?student_id=2&period=PRE&domain_id=2",
  );
  await choose(page, "Assessment Period", "Mid-Test (MoSY)");
  await expect(list).toContainText("Ada Example");
  await expect(list).not.toContainText("Ben Example");
  await expect(panel).toContainText("awaiting Mid-Test assessment.");
  await choose(page, "Assessment Period", "Post-Test (EoSY)");
  await expect(list.getByRole("listitem")).toHaveCount(3);
  const captions = page
    .getByRole("region", { name: "Section statistics" })
    .locator("span[title='No period data']");
  await expect(captions).toHaveCount(2);
  expect(
    await captions.evaluateAll((nodes) =>
      nodes.every((node) => node.scrollWidth <= node.clientWidth + 1),
    ),
  ).toBe(true);
  await expect(target).toHaveAttribute(
    "href",
    "/teacher/eccdassessment?student_id=2&period=POST&domain_id=1",
  );
  await target.click();
  await expect(page).toHaveURL(/student_id=2&period=POST&domain_id=1/);
  await expect(
    page.getByRole("heading", { name: "Gross Motor Domain", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("select").filter({ has: page.locator("option[value='2']") }),
  ).toHaveValue("2");
  await expect(
    page.locator("select").filter({ has: page.locator("option[value='PRE']") }),
  ).toHaveValue("POST");
  expect(
    await page.evaluate(() => localStorage.getItem("ames_draft_2_unrelated")),
  ).toBe("preserve");
});

test("pending loading, failed reads, complete periods and section changes stay distinct", async ({
  page,
}) => {
  const state = await dashboard(page);
  const panel = page.getByRole("region", {
    name: "Pending Evaluations",
    exact: true,
  });
  await expect(panel.getByRole("listitem")).toHaveCount(2);
  let release = () => {};
  state.holdPending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(panel).toContainText("Loading pending evaluations...");
  await expect(panel.getByRole("link")).toHaveCount(0);
  await choose(page, "Assessment Period", "Mid-Test (MoSY)");
  release();
  await expect(panel.getByRole("listitem")).toHaveCount(2);
  await expect(panel).not.toContainText("Ben Example");
  state.failPending = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(panel).toContainText("Pending evaluations unavailable.");
  await expect(
    panel.getByRole("heading", { name: "All Evaluations Completed" }),
  ).toHaveCount(0);
  state.failPending = false;
  state.allEvaluated = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    panel.getByRole("heading", { name: "All Evaluations Completed" }),
  ).toBeVisible();
  await expect(panel).toContainText(
    "All students in this section have confirmed Mid-Test records.",
  );
  await expect(panel.getByRole("link")).toHaveCount(0);
  await expect(
    page.getByRole("article", { name: "Assessment Progress" }),
  ).toContainText("3 / 3");
  await choose(page, "Assessment Period", "Post-Test (EoSY)");
  await expect(panel).toContainText(
    "All students in this section have confirmed Post-Test records.",
  );
  await choose(page, "Assessment Period", "Pre-Test (BoSY)");
  await expect(panel).toContainText(
    "All students in this section have confirmed Pre-Test records.",
  );
  await choose(page, "Assessment Period", "Mid-Test (MoSY)");
  state.allEvaluated = false;
  let releaseSection = () => {};
  state.holdPending = new Promise<void>((resolve) => {
    releaseSection = resolve;
  });
  state.sectionId = 2;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(panel).toContainText(
    "Students in Emerald awaiting Mid-Test assessment.",
  );
  await expect(panel).toContainText("Loading pending evaluations...");
  await expect(panel.getByRole("link")).toHaveCount(0);
  releaseSection();
  await expect(panel.getByRole("listitem")).toHaveCount(1);
  await expect(panel).toContainText("Cara Example");
  await expect(panel).not.toContainText("Ada Example");
  state.sectionId = null;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(panel).toContainText("No section assigned.");
  await expect(panel.getByRole("link")).toHaveCount(0);
});

test("large pending rosters scroll with bounded reads and empty rosters do not claim completion", async ({
  page,
}) => {
  await dashboard(page);
  const panel = page.getByRole("region", {
    name: "Pending Evaluations",
    exact: true,
  });
  await expect(panel.getByRole("listitem")).toHaveCount(2);
  const roster = Array.from({ length: 12 }, (_, index) => ({
    student_id: 200 + index,
    first_name: `Pending Student ${index}`,
    last_name: "Example",
    section_id: 1,
    is_active: true,
    masked_lrn: "",
  }));
  await page.route("**/api/eccd/students", (route) =>
    route.fulfill({ json: roster }),
  );
  let active = 0;
  let peak = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/eccd/student/*", async (route) => {
    active++;
    peak = Math.max(peak, active);
    await gate;
    await route.fulfill({ json: [] });
    active--;
  });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => active).toBe(4);
  release();
  await expect(panel.getByRole("listitem")).toHaveCount(12);
  expect(peak).toBeLessThanOrEqual(4);
  const list = panel.getByRole("list");
  expect(
    await list.evaluate(
      (node) =>
        node.scrollHeight > node.clientHeight && node.clientHeight <= 256,
    ),
  ).toBe(true);
  await panel.getByRole("link").last().scrollIntoViewIfNeeded();
  await expect(panel.getByRole("link").last()).toBeVisible();
  await page.route("**/api/eccd/students", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(panel).toContainText("No active students in this section.");
  await expect(
    panel.getByRole("heading", { name: "All Evaluations Completed" }),
  ).toHaveCount(0);
});
