import { expect, test, type Page } from "@playwright/test";

interface DashboardState {
  requests: URL[];
  fail: boolean;
  hold: Promise<void> | null;
  primaryColor: string;
}

async function dashboard(page: Page): Promise<DashboardState> {
  const state: DashboardState = {
    requests: [],
    fail: false,
    hold: null,
    primaryColor: "#2563eb",
  };
  await page.addInitScript(() => {
    localStorage.setItem(
      "token",
      `test.${btoa(JSON.stringify({ exp: Date.now() / 1000 + 3600 }))}.test`,
    );
    localStorage.setItem(
      "user",
      JSON.stringify({
        id: 1,
        role: "super-admin",
        email: "chairman@example.test",
      }),
    );
    localStorage.setItem("ames_draft_1_unrelated", "preserve");
  });
  const sections = Array.from({ length: 40 }, (_, i) => ({
    section_id: i + 1,
    section_name: i === 0 ? "Diamond" : `Section ${i + 1}`,
  }));
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/settings") {
      await route.fulfill({
        json: {
          current_school_year: "2026-2027",
          chairman_name: "Sample Chairman",
          primary_color: state.primaryColor,
        },
      });
    } else if (url.pathname === "/api/analytics/filters") {
      await route.fulfill({
        json: {
          sections: sections.map((s) => s.section_name),
          sectionOptions: sections,
          currentSchoolYear: "2026-2027",
          schoolYears: ["2026-2027", "2025-2026"],
          domains: [
            "Gross Motor",
            "Fine Motor",
            "Self-Help",
            "Receptive Language",
            "Expressive Language",
            "Cognitive",
            "Socio-Emotional",
          ].map((name) => `${name} Domain`),
        },
      });
    } else if (url.pathname.startsWith("/api/analytics/")) {
      state.requests.push(url);
      const fail = state.fail;
      const held = state.hold;
      await held;
      if (fail) {
        await route.fulfill({
          status: 503,
          json: { detail: "Metrics unavailable" },
        });
        return;
      }
      const selected = url.searchParams.get("section_id") === "1";
      const historic = url.searchParams.get("schoolYear") === "2025-2026";
      if (url.pathname.endsWith("/stats")) {
        const delayPeriod = url.searchParams.get("period");
        const interpretation = url.searchParams.get("interpretation");
        const status = interpretation;
        const noDelayAssessments = historic || delayPeriod === "POST";
        const delayedStudents = noDelayAssessments
          ? []
          : [
              {
                studentId: 1,
                studentName: "Ada Example",
                decimalAge: 5.6,
                delayStatus: status,
              },
              {
                studentId: 2,
                studentName: "Ben Example",
                decimalAge: 5.7,
                delayStatus: status,
              },
              {
                studentId: 3,
                studentName: "Cara Example",
                decimalAge: 5.4,
                delayStatus: status,
              },
            ].filter(
              (student) =>
                (interpretation === "Delay" ||
                interpretation === "Highly Advance"
                  ? student.studentId === 2
                  : interpretation === "Slight Delay"
                    ? student.studentId !== 2
                    : interpretation === "Slight Advance"
                      ? student.studentId !== 3
                      : true) &&
                (delayPeriod === "MID"
                  ? student.studentId === 2
                  : delayPeriod === null
                    ? student.studentId !== 3
                    : true),
            );
        const matchingGenders = delayedStudents.reduce(
          (counts, student) => {
            if (student.studentId === 2) counts.male += 1;
            else counts.female += 1;
            return counts;
          },
          { male: 0, female: 0 },
        );
        const male = noDelayAssessments
          ? 0
          : selected
            ? matchingGenders.male
            : interpretation !== "Average"
              ? matchingGenders.male * 7
              : delayPeriod === "MID"
                ? 7
                : delayPeriod === null
                  ? 8
                  : 10;
        const female = noDelayAssessments
          ? 0
          : selected
            ? matchingGenders.female
            : interpretation !== "Average"
              ? matchingGenders.female * 7
              : delayPeriod === "MID"
                ? 0
                : delayPeriod === null
                  ? 10
                  : 20;
        let remainingMale = male;
        let remainingFemale = female;
        const bySection = Object.fromEntries(
          (selected ? sections.slice(0, 1) : sections).map((section) => {
            const counts =
              section.section_id === 1
                ? { ...matchingGenders }
                : {
                    male: remainingMale > 0 ? 1 : 0,
                    female: remainingMale === 0 && remainingFemale > 0 ? 1 : 0,
                  };
            remainingMale -= counts.male;
            remainingFemale -= counts.female;
            return [section.section_name, counts];
          }),
        );
        await route.fulfill({
          json: {
            stats: {
              totalStudents:
                historic || delayPeriod === "POST"
                  ? "0"
                  : delayPeriod === "MID"
                    ? "1"
                    : selected
                      ? "8"
                      : "80",
              totalTeachers: selected ? "1" : "40",
              criticalDomain: "Cognitive",
              criticalDomainSubtitle: "Needs Improvement",
              priorityIntervention: "Diamond",
              priorityInterventionSubtitle: "Requires Support",
            },
            functionalMastery: { kaya: 90, dikaya: 10 },
            criticalDomainDiKayaRate: historic ? null : selected ? 12.5 : 63.64,
            excellingDomain: {
              domainName:
                historic || delayPeriod === "POST"
                  ? null
                  : selected
                    ? "Gross Motor"
                    : "Receptive Language",
              masteryRate:
                historic || delayPeriod === "POST"
                  ? null
                  : delayPeriod === "MID"
                    ? 75
                    : selected
                      ? 94
                      : 85,
              totalKaya: 94,
              totalItems: 100,
              completedStudents: 8,
            },
            delaySummary: {
              male,
              female,
              totalDelayed:
                interpretation === "Slight Delay" || interpretation === "Delay"
                  ? male + female
                  : 0,
              totalMatched: male + female,
              assessedStudents: noDelayAssessments ? 0 : selected ? 8 : 80,
              students: selected ? delayedStudents : [],
              bySection,
            },
          },
        });
      } else
        await route.fulfill({
          json: [
            {
              name: "KAYA",
              value:
                url.searchParams.get("period") === "MID" ? 6 : selected ? 9 : 8,
              color: "#10b981",
            },
            {
              name: "DI-KAYA",
              value:
                url.searchParams.get("period") === "MID" ? 4 : selected ? 1 : 2,
              color: "#ef4444",
            },
          ],
        });
    } else await route.fulfill({ json: {} });
  });
  await page.goto("/super-admin/dashboard");
  await expect(
    page.getByRole("region", { name: "Summary statistics" }),
  ).toHaveAttribute("aria-busy", "false");
  return state;
}

async function choose(page: Page, filter: string, option: string) {
  await page.getByRole("combobox", { name: filter, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

const stats = (page: Page) =>
  page.getByRole("region", { name: "Summary statistics" });

test("analytics wait for filter defaults and share initial Strict Mode lookups", async ({
  page,
}) => {
  const state = await dashboard(page);
  state.requests.length = 0;
  const lookups: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (["/api/settings", "/api/analytics/filters"].includes(path))
      lookups.push(path);
  });
  let release = () => {};
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/analytics/filters", async (route) => {
    await hold;
    await route.fulfill({
      json: {
        sections: ["Diamond"],
        sectionOptions: [{ section_id: 1, section_name: "Diamond" }],
        domains: ["Gross Motor"],
        schoolYears: ["2027-2028", "2026-2027"],
        currentSchoolYear: "2027-2028",
      },
    });
  });
  await page.reload();
  await expect.poll(() => lookups.length).toBe(2);
  await expect(
    page.getByRole("combobox", { name: "School Year", exact: true }),
  ).toBeDisabled();
  expect(state.requests).toHaveLength(0);
  release();
  await expect(stats(page)).toHaveAttribute("aria-busy", "false");
  await expect.poll(() => state.requests.length).toBe(2);
  expect(
    state.requests.every(
      (url) =>
        url.searchParams.get("schoolYear") === "2027-2028" &&
        url.searchParams.get("period") === "PRE",
    ),
  ).toBe(true);
  expect(lookups.filter((path) => path === "/api/settings")).toHaveLength(1);
  expect(
    lookups.filter((path) => path === "/api/analytics/filters"),
  ).toHaveLength(1);
});

test("missing filter year waits for settings before starting analytics", async ({
  page,
}) => {
  const state = await dashboard(page);
  state.requests.length = 0;
  let release = () => {};
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/settings", async (route) => {
    await hold;
    await route.fallback();
  });
  await page.route("**/api/analytics/filters", async (route) => {
    await route.fulfill({
      json: {
        sections: [],
        sectionOptions: [],
        domains: [],
        schoolYears: [],
        currentSchoolYear: null,
      },
    });
  });
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Section", exact: true }),
  ).toBeEnabled();
  expect(state.requests).toHaveLength(0);
  release();
  await expect(stats(page)).toHaveAttribute("aria-busy", "false");
  await expect.poll(() => state.requests.length).toBe(2);
  expect(
    state.requests.every(
      (url) => url.searchParams.get("schoolYear") === "2026-2027",
    ),
  ).toBe(true);
});

test("personalized branding updates without recoloring ECCD status indicators", async ({
  page,
}, info) => {
  const state = await dashboard(page);
  state.primaryColor = "#7c3aed";
  await page.reload();
  await expect(stats(page)).toHaveAttribute("aria-busy", "false");
  const cards = stats(page).locator(":scope > section");
  const header = page
    .getByRole("region", { name: "Section Totals", exact: true })
    .locator("thead tr");
  const semanticColors = () =>
    page.evaluate(() => {
      const cards = Array.from(
        document.querySelectorAll(
          '[aria-label="Summary statistics"] > section',
        ),
      ).slice(2);
      return {
        cards: cards.map((card) =>
          Array.from(
            card.querySelectorAll('svg, [aria-hidden="true"], p span'),
          ).map((element) => {
            const style = getComputedStyle(element);
            return {
              color: style.color,
              background: style.backgroundColor,
              border: style.borderColor,
            };
          }),
        ),
        slices: Array.from(document.querySelectorAll(".recharts-sector")).map(
          (element) => element.getAttribute("fill"),
        ),
        totals: Array.from(
          document.querySelectorAll(
            'dl[aria-label="Assessment item totals"] > div',
          ),
        ).map((element) => {
          const style = getComputedStyle(element);
          return { color: style.color, background: style.backgroundColor };
        }),
      };
    });
  await expect(
    page.getByRole("region", { name: "ECCD Progress Overview" }),
  ).toHaveAttribute("aria-busy", "false");
  const statuses = await semanticColors();
  const purpleTint = await cards
    .first()
    .locator('div[aria-hidden="true"]')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  const purpleHeader = await header.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  for (const card of [cards.nth(0), cards.nth(1)]) {
    await expect(card.locator("svg")).toHaveCSS("color", "rgb(124, 58, 237)");
    await expect(card).toHaveCSS("border-top-color", "rgb(124, 58, 237)");
    await expect(card).toHaveCSS("background-color", "rgb(255, 255, 255)");
  }
  const neutralColors = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--color-slate-50)";
    probe.style.color = "var(--color-slate-700)";
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const colors = { canvas: style.backgroundColor, text: style.color };
    probe.remove();
    return colors;
  });
  await expect(page.locator("main[data-layout-content]")).toHaveCSS(
    "background-color",
    neutralColors.canvas,
  );
  await expect(header.getByRole("columnheader").first()).toHaveCSS(
    "color",
    neutralColors.text,
  );
  const mobile = page.viewportSize()!.width < 900;
  if (mobile)
    await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page
      .getByRole("navigation", { name: "Sidebar", exact: true })
      .getByRole("link", { name: "Dashboard" }),
  ).toHaveCSS("background-color", "rgb(124, 58, 237)");
  if (mobile) await page.keyboard.press("Escape");
  for (const name of [
    "School Year",
    "Section",
    "Assessment Period",
    "Interpretation",
    "Domain",
  ]) {
    const control = page.getByRole("combobox", { name, exact: true });
    await control.scrollIntoViewIfNeeded();
    await control.focus();
    await expect(control.locator("..").locator("fieldset")).toHaveCSS(
      "border-color",
      "rgb(124, 58, 237)",
    );
    expect(
      await control
        .locator("..")
        .evaluate((element) => getComputedStyle(element).boxShadow),
    ).not.toBe("none");
  }
  await page.getByRole("combobox", { name: "Section", exact: true }).click();
  const selected = page.getByRole("option", { selected: true });
  const purpleOption = await selected.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await page.keyboard.press("Escape");

  // The provider updates this same root variable after confirmed settings saves.
  await page.evaluate(() =>
    document.documentElement.style.setProperty("--primary-color", "#0f766e"),
  );
  for (const card of [cards.nth(0), cards.nth(1)]) {
    await expect(card.locator("svg")).toHaveCSS("color", "rgb(15, 118, 110)");
    await expect(card).toHaveCSS("border-top-color", "rgb(15, 118, 110)");
  }
  expect(
    await cards
      .first()
      .locator('div[aria-hidden="true"]')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe(purpleTint);
  expect(
    await header.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ).not.toBe(purpleHeader);
  await page.getByRole("combobox", { name: "Section", exact: true }).click();
  expect(
    await selected.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ).not.toBe(purpleOption);
  await page.keyboard.press("Escape");
  expect(await semanticColors()).toEqual(statuses);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("dashboard-personalized.png"),
    fullPage: true,
  });

  state.primaryColor = "#0f766e";
  await page.reload();
  await expect(cards.first().locator("svg")).toHaveCSS(
    "color",
    "rgb(15, 118, 110)",
  );
  await page.evaluate(() =>
    document.documentElement.style.removeProperty("--primary-color"),
  );
  await expect(cards.first().locator("svg")).toHaveCSS(
    "color",
    "rgb(37, 99, 235)",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

async function expectBalancedLayout(page: Page) {
  const width = page.viewportSize()!.width;
  const columns = width >= 1280 ? 5 : width >= 768 ? 3 : width >= 640 ? 2 : 1;
  const cards = await stats(page)
    .locator(":scope > section")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          top: Math.round(rect.top),
          width: rect.width,
          height: rect.height,
          footerBottom: Math.round(
            element.lastElementChild!.getBoundingClientRect().bottom - rect.top,
          ),
        };
      }),
    );
  expect(new Set(cards.map((card) => card.top)).size).toBe(
    Math.ceil(5 / columns),
  );
  for (const card of cards) {
    expect(Math.abs(card.width - cards[0].width)).toBeLessThanOrEqual(1);
    const row = cards.filter((other) => other.top === card.top);
    expect(Math.abs(card.height - row[0].height)).toBeLessThanOrEqual(1);
    expect(card.height).toBeLessThanOrEqual(175);
    expect(card.footerBottom).toEqual(row[0].footerBottom);
  }
  const delay = page.getByRole("region", {
    name: "Developmental Summary",
  });
  const progress = page.getByRole("region", { name: "ECCD Progress Overview" });
  await expect(progress).toHaveAttribute("aria-busy", "false");
  const left = await delay.boundingBox();
  const right = await progress.boundingBox();
  expect(left).not.toBeNull();
  expect(right).not.toBeNull();
  expect(Math.abs(left!.width - right!.width)).toBeLessThanOrEqual(1);
  if (width >= 1024) {
    expect(Math.abs(left!.y - right!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(left!.height - right!.height)).toBeLessThanOrEqual(1);
    expect(right!.x).toBeGreaterThan(left!.x + left!.width);
  } else {
    expect(right!.y).toBeGreaterThan(left!.y + left!.height);
  }
  const chart = progress.locator(".recharts-responsive-container");
  await expect(chart).toBeVisible();
  await expect(chart.locator(".recharts-pie-label-text")).toHaveCount(2);
  const chartBox = await chart.boundingBox();
  expect(chartBox!.width).toBeGreaterThan(0);
  expect(chartBox!.height).toBeGreaterThan(0);
  const chartArea = await chart.locator("../..").boundingBox();
  expect(
    Math.abs(
      chartBox!.y +
        chartBox!.height / 2 -
        (chartArea!.y + chartArea!.height / 2),
    ),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(chartBox!.x + chartBox!.width / 2 - (right!.x + right!.width / 2)),
  ).toBeLessThanOrEqual(1);
  expect(chartBox!.x).toBeGreaterThanOrEqual(right!.x);
  expect(chartBox!.x + chartBox!.width).toBeLessThanOrEqual(
    right!.x + right!.width,
  );
  const badges = delay.locator("h3").filter({ hasText: /^(Males|Females)$/ });
  await expect(badges).toHaveCount(0);
}

test("global filters scope all panels with responsive balanced layout", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const state = await dashboard(page);
  const summary = page.getByRole("region", {
    name: "Developmental Summary",
    exact: true,
  });
  const header = page.getByRole("region", { name: "Dashboard filters" });
  await expect(header.getByRole("combobox")).toHaveCount(3);
  await expect(
    header.getByRole("combobox", { name: "Assessment Period" }),
  ).toContainText("Pre-Test (BoSY)");
  await expect(summary.getByRole("combobox")).toHaveCount(1);
  await expect(summary.getByRole("combobox")).toContainText("Average");
  await expect(
    page.getByRole("combobox", { name: "Summary Period", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Period", exact: true }),
  ).toHaveCount(0);
  await expect(summary).not.toContainText(
    "Uses selected school year and section.",
  );
  await expect(summary).toContainText(
    "30 students with Average across 40 sections",
  );
  await expect(summary.getByRole("columnheader")).toHaveText([
    "Section Name",
    "Male",
    "Female",
  ]);
  await expect(stats(page).getByRole("heading")).toHaveText([
    "Total Students",
    "Total Teachers",
    "Domain of Excellence",
    "Critical Domain Focus",
    "Priority Intervention",
  ]);
  await expect(stats(page)).toContainText("85% Kaya");
  await expect(stats(page)).toContainText("63.64% Di-Kaya");
  expect(
    state.requests.every((url) => url.searchParams.get("period") === "PRE"),
  ).toBeTruthy();
  const table = page.getByRole("region", {
    name: "Section Totals",
    exact: true,
  });
  await expect(table.getByRole("row")).toHaveCount(41);
  expect(
    await table.evaluate((element) => element.clientHeight),
  ).toBeLessThanOrEqual(288);
  expect(
    await table.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBeTruthy();
  await expectBalancedLayout(page);
  await page.screenshot({
    path: info.outputPath("dashboard.png"),
    fullPage: true,
  });
  await choose(page, "Section", "Diamond");
  await expect(summary).toContainText(
    "3 students with Average across 1 section",
  );
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table.getByRole("rowheader")).toHaveText(["Diamond"]);
  await expect(table.getByRole("cell")).toHaveText(["1", "2"]);
  await expect(stats(page)).toContainText("94% Kaya");
  await expect(stats(page).locator(":scope > section").first()).toContainText(
    "8",
  );
  await expectBalancedLayout(page);
  await page.screenshot({
    path: info.outputPath("dashboard-section.png"),
    fullPage: true,
  });
  await choose(page, "Assessment Period", "Mid-Test (MoSY)");
  await expect(summary).toContainText(
    "1 students with Average across 1 section",
  );
  await expect(table.getByRole("cell")).toHaveText(["1", "0"]);
  await expect(stats(page)).toContainText("75% Kaya");
  const totals = page.locator('dl[aria-label="Assessment item totals"]');
  await expect(totals).toContainText("Total Kaya6");
  await expect(totals).toContainText("Total Di-Kaya4");
  for (const endpoint of ["/stats", "/pie-data"]) {
    const request = state.requests
      .filter((url) => url.pathname.endsWith(endpoint))
      .at(-1)!;
    expect(request.searchParams.get("period")).toBe("MID");
    expect(request.searchParams.get("section_id")).toBe("1");
    expect(request.searchParams.get("schoolYear")).toBe("2026-2027");
    expect(request.searchParams.has("delay_period")).toBeFalsy();
  }
  const before = state.requests.filter((url) =>
    url.pathname.endsWith("/stats"),
  ).length;
  await choose(page, "Domain", "Gross Motor Domain");
  await expect
    .poll(() =>
      state.requests
        .filter((url) => url.pathname.endsWith("/pie-data"))
        .at(-1)
        ?.searchParams.get("domain"),
    )
    .toBe("Gross Motor Domain");
  expect(
    state.requests.filter((url) => url.pathname.endsWith("/stats")),
  ).toHaveLength(before);
  await choose(page, "School Year", "2025-2026");
  await expect(summary).toContainText("No recorded assessments");
  await expect(table.getByRole("cell")).toHaveText(["0", "0"]);
  await expect(stats(page)).toContainText("No completed assessments yet");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(() => localStorage.getItem("ames_draft_1_unrelated")),
  ).toBe("preserve");
});

test("five interpretation tiers send exact scoring keys and retain single-section distribution", async ({
  page,
}, info) => {
  const state = await dashboard(page);
  const summary = page.getByRole("region", {
    name: "Developmental Summary",
    exact: true,
  });
  await page.getByRole("combobox", { name: "Interpretation" }).click();
  await expect(page.getByRole("option")).toHaveText([
    "Delay",
    "Slight Delay",
    "Average",
    "Slight Advancement",
    "Highly Advancement",
  ]);
  await page.keyboard.press("Escape");
  const pieCount = state.requests.filter((url) =>
    url.pathname.endsWith("/pie-data"),
  ).length;
  const tiers = [
    { label: "Delay", key: "Delay", total: 7, counts: ["1", "0"] },
    {
      label: "Slight Delay",
      key: "Slight Delay",
      total: 14,
      counts: ["0", "2"],
    },
    { label: "Average", key: "Average", total: 30, counts: ["1", "2"] },
    {
      label: "Slight Advancement",
      key: "Slight Advance",
      total: 14,
      counts: ["1", "1"],
    },
    {
      label: "Highly Advancement",
      key: "Highly Advance",
      total: 7,
      counts: ["1", "0"],
    },
  ];
  for (const tier of tiers) {
    await choose(page, "Interpretation", tier.label);
    await expect(summary).toContainText(
      `${tier.total} students with ${tier.label} across 40 sections`,
    );
    await expect(
      summary.getByRole("row").filter({ hasText: "Diamond" }).getByRole("cell"),
    ).toHaveText(tier.counts);
    const request = state.requests
      .filter((url) => url.pathname.endsWith("/stats"))
      .at(-1)!;
    expect(request.searchParams.get("interpretation")).toBe(tier.key);
    expect(request.searchParams.get("period")).toBe("PRE");
  }
  expect(
    state.requests.filter((url) => url.pathname.endsWith("/pie-data")),
  ).toHaveLength(pieCount);
  await choose(page, "Section", "Diamond");
  await expect(summary.getByRole("rowheader")).toHaveText(["Diamond"]);
  await expect(summary.getByRole("cell")).toHaveText(["1", "0"]);
  await choose(page, "Assessment Period", "Mid-Test (MoSY)");
  await expect(summary).toContainText("1 students with Highly Advancement");
  await choose(page, "Assessment Period", "Post-Test (EoSY)");
  await expect(summary).toContainText("0 students with Highly Advancement");
  await expect(summary.getByRole("cell")).toHaveText(["0", "0"]);
  await page.screenshot({
    path: info.outputPath("dashboard-empty-period.png"),
    fullPage: true,
  });
});

test("dropdowns have bounded scroll with keyboard selection and selected-item visibility", async ({
  page,
}, info) => {
  await dashboard(page);
  for (const name of [
    "Section",
    "Domain",
    "School Year",
    "Assessment Period",
    "Interpretation",
  ]) {
    const trigger = page.getByRole("combobox", { name, exact: true });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    const menu = page.getByRole("listbox", { name, exact: true });
    await expect(menu).toBeVisible();
    expect(
      await menu.evaluate((element) => element.clientHeight),
    ).toBeLessThanOrEqual(192);
    await expect(menu).toHaveCSS("overflow-y", "auto");
    const bounds = await menu.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
      page.viewportSize()!.height,
    );
    if (name === "Section" || name === "Domain" || name === "Interpretation") {
      expect(
        await menu.evaluate(
          (element) => element.scrollHeight > element.clientHeight,
        ),
      ).toBeTruthy();
      await page.keyboard.press("End");
      await expect(menu.getByRole("option").last()).toBeFocused();
      await expect(menu.getByRole("option").last()).toBeInViewport({
        ratio: 1,
      });
      if (name !== "Interpretation")
        expect(
          await menu.evaluate((element) => element.scrollTop),
        ).toBeGreaterThan(0);
      await page.keyboard.press("Home");
      await expect(menu.getByRole("option").first()).toBeFocused();
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      await expect(trigger).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(menu.getByRole("option", { selected: true })).toBeFocused();
      await expect(menu.getByRole("option", { selected: true })).toBeInViewport(
        { ratio: 1 },
      );
      if (name !== "Interpretation")
        expect(
          await menu.evaluate((element) => element.scrollTop),
        ).toBeGreaterThan(0);
      if (name === "Section")
        await page.screenshot({
          path: info.outputPath("dashboard-section-menu.png"),
          fullPage: true,
        });
    }
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("superseded filters and failed requests cannot display previous metrics", async ({
  page,
}) => {
  const state = await dashboard(page);
  let release: () => void = () => {};
  state.hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await choose(page, "Assessment Period", "Mid-Test (MoSY)");
  await expect(stats(page)).toHaveAttribute("aria-busy", "true");
  await expect(stats(page)).not.toContainText("85% Kaya");
  state.hold = null;
  await choose(page, "Assessment Period", "Post-Test (EoSY)");
  await expect(stats(page)).toHaveAttribute("aria-busy", "false");
  release();
  await expect(stats(page)).not.toContainText("75% Kaya");
  await expect(
    page.getByRole("region", { name: "Developmental Summary", exact: true }),
  ).toContainText("No recorded assessments");
  state.fail = true;
  await choose(page, "Section", "Diamond");
  await expect(stats(page)).toContainText("Unavailable");
  await expect(
    page.getByText("Developmental summary is unavailable."),
  ).toBeVisible();
  await expect(page.getByRole("rowheader")).toHaveCount(0);
});
