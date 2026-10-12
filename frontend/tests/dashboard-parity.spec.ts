import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const domains = ["Gross Motor Domain", "Fine Motor Domain", "Self-Help Domain"];
const settings = {
  system_title: "AMES",
  school_name: "Example School",
  principal_name: "Example Principal",
  primary_color: "#2563eb",
  secondary_color: "#111827",
  logo_url:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23ffffff'/%3E%3Ctext x='50' y='64' font-size='40' text-anchor='middle' fill='%232563eb'%3EA%3C/text%3E%3C/svg%3E",
  current_school_year: "2026-2027",
  school_year_start_month: 8,
};
interface Fixture {
  empty?: boolean;
  domains?: string[];
}
type Dataset = "stats" | "pie" | "rankings" | "filters";
function dataset(url: URL): Dataset | null {
  if (/dashboard-filters|analytics\/filters/.test(url.pathname))
    return "filters";
  if (/dashboard-stats|analytics\/stats/.test(url.pathname)) return "stats";
  if (/dashboard-pie|pie-data/.test(url.pathname))
    return url.searchParams.get("domain") === "All" ? "pie" : "rankings";
  return null;
}
function pieData(kaya = 3, dikaya = 1) {
  return [
    { name: "KAYA", value: kaya, color: "#3b82f6" },
    { name: "DI-KAYA", value: dikaya, color: "#f59e0b" },
  ];
}
function statsData(totalStudents = "12") {
  return {
    stats: {
      totalStudents,
      totalTeachers: "3",
      priorityIntervention: "25%",
      priorityInterventionSubtitle: "Needs support",
      criticalDomain: "Fine Motor",
      criticalDomainSubtitle: "Focus on improvement",
    },
    functionalMastery: { kaya: 3, dikaya: 1 },
  };
}
async function prepare(page: Page, fixture: Fixture = {}) {
  const requests: URL[] = [];
  await page.addInitScript(() => {
    localStorage.setItem(
      "user",
      JSON.stringify({
        id: 1,
        username: "Example",
        role: "super-admin",
        is_first_login: 0,
      }),
    );
    localStorage.setItem(
      "token",
      `reference.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.reference`,
    );
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const group = dataset(url);
    const index = (fixture.domains || domains).indexOf(
      url.searchParams.get("domain") || "",
    );
    const data =
      url.pathname === "/api/settings"
        ? settings
        : group === "filters"
          ? {
              sections: ["Section A", "Section B"],
              domains: fixture.domains || domains,
              schoolYears: ["2025-2026", "2026-2027"],
            }
          : group === "stats"
            ? fixture.empty
              ? {
                  stats: { totalStudents: "0", totalTeachers: "3" },
                  functionalMastery: { kaya: 0, dikaya: 0 },
                }
              : statsData(
                  url.searchParams.get("schoolYear") === "2025-2026"
                    ? "6"
                    : url.searchParams.get("section") === "Section A"
                      ? "8"
                      : "12",
                )
            : group === "pie" || group === "rankings"
              ? fixture.empty
                ? []
                : index === 1
                  ? pieData(1, 3)
                  : index === 2
                    ? pieData(2, 2)
                    : pieData()
              : { unreadCount: 0 };
    await route.fulfill({ json: data });
  });
  return requests;
}
const chart = (page: Page) =>
  page.getByRole("region", { name: "ECCD Progress Overview", exact: true });
const rankings = (page: Page) =>
  page.getByRole("region", {
    name: "Domain Performance Breakdown",
    exact: true,
  });
const summary = (page: Page) =>
  page.locator('[aria-label="Summary statistics"]');
async function choose(page: Page, label: string, value: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: value, exact: true }).click();
}
async function loaded(page: Page) {
  await expect(summary(page)).toHaveAttribute("aria-busy", "false");
  await expect(chart(page)).toHaveAttribute("aria-busy", "false");
  await expect(rankings(page)).toHaveAttribute("aria-busy", "false");
}
function deferred() {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

for (const blocked of ["stats", "pie", "rankings", "filters"] as const) {
  test(`Dashboard ${blocked} loading and failure stay independent`, async ({
    page,
  }) => {
    await prepare(page);
    const gate = deferred();
    await page.route("**/api/**", async (route) => {
      if (dataset(new URL(route.request().url())) !== blocked)
        return route.fallback();
      await gate.promise;
      await route.fulfill({
        status: 503,
        json: { detail: `${blocked} unavailable` },
      });
    });
    await page.goto("/super-admin/dashboard");
    try {
      if (blocked !== "stats") await expect(summary(page)).toContainText("12");
      if (blocked !== "pie")
        await expect(chart(page).locator(".recharts-pie-sector")).toHaveCount(
          2,
        );
      if (blocked !== "rankings" && blocked !== "filters")
        await expect(rankings(page).getByRole("progressbar")).toHaveCount(3);
      if (blocked === "rankings")
        await expect(rankings(page)).toHaveAttribute("aria-busy", "true");
    } finally {
      gate.release();
    }
    await expect(page.getByRole("alert")).toContainText(
      `${blocked} unavailable`,
    );
    if (blocked !== "stats") await expect(summary(page)).toContainText("12");
    if (blocked !== "pie")
      await expect(chart(page).locator(".recharts-pie-sector")).toHaveCount(2);
  });
}

test("Dashboard filters use legacy dependencies, query values and ranking order", async ({
  page,
}) => {
  const requests = await prepare(page);
  await page.goto("/super-admin/dashboard");
  await loaded(page);
  expect(
    await rankings(page)
      .getByRole("progressbar")
      .evaluateAll((nodes) =>
        nodes.map((node) => [
          node.getAttribute("aria-label"),
          node.getAttribute("aria-valuenow"),
        ]),
      ),
  ).toEqual([
    ["Gross Motor", "75"],
    ["Self-Help", "50"],
    ["Fine Motor", "25"],
  ]);
  for (const [label, value, groups] of [
    ["Domain", "Fine Motor Domain", ["rankings"]],
    ["Period", "PRE", ["rankings", "rankings", "rankings", "rankings"]],
    [
      "Section",
      "Section A",
      ["stats", "rankings", "rankings", "rankings", "rankings"],
    ],
    [
      "School Year",
      "2025-2026",
      ["stats", "rankings", "rankings", "rankings", "rankings"],
    ],
  ] as const) {
    requests.length = 0;
    await choose(page, label, value);
    await loaded(page);
    await expect(chart(page).locator(".recharts-pie-label-text")).toHaveText([
      "KAYA 25%",
      "DI-KAYA 75%",
    ]);
    await expect(
      summary(page).getByText(
        label === "School Year" ? "6" : label === "Section" ? "8" : "12",
        { exact: true },
      ),
    ).toBeVisible();
    expect(requests.map(dataset).filter(Boolean).sort()).toEqual(
      [...groups].sort(),
    );
    for (const url of requests.filter((url) => dataset(url))) {
      if (label === "Domain")
        expect(url.searchParams.get("domain")).toBe(value);
      else
        expect(
          url.searchParams.get(
            {
              Period: "period",
              Section: "section",
              "School Year": "schoolYear",
            }[label],
          ),
        ).toBe(value);
      if (dataset(url) === "stats")
        expect([...url.searchParams.keys()].sort()).toEqual([
          "schoolYear",
          "section",
        ]);
    }
  }
  await expect(
    page.getByText("Section: Section A", { exact: true }),
  ).toBeVisible();
  await expect(rankings(page)).toContainText("Showing: Section Section A");
});

test("Dashboard ignores stale statistics, pie and ranking responses", async ({
  page,
}) => {
  await prepare(page);
  const gate = deferred();
  let held = 0;
  await page.route("**/api/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const group = dataset(url);
    if (
      !group ||
      group === "filters" ||
      url.searchParams.get("section") !== "Section A"
    )
      return route.fallback();
    held++;
    await gate.promise;
    await route.fulfill({
      json: group === "stats" ? statsData("99") : pieData(0, 10),
    });
  });
  await page.goto("/super-admin/dashboard");
  await loaded(page);
  await choose(page, "Section", "Section A");
  await expect.poll(() => held).toBe(5);
  await choose(page, "Section", "Section B");
  await loaded(page);
  const obsolete = Promise.all(
    [null, "All", ...domains].map((domain) =>
      page
        .waitForResponse((response) => {
          const url = new URL(response.url());
          return (
            url.searchParams.get("section") === "Section A" &&
            url.searchParams.get("domain") === domain
          );
        })
        .then((response) => response.finished()),
    ),
  );
  gate.release();
  await obsolete;
  await expect(summary(page)).toContainText("12");
  await expect(summary(page)).not.toContainText("99");
  await expect(
    rankings(page).getByRole("progressbar", {
      name: "Gross Motor",
      exact: true,
    }),
  ).toHaveAttribute("aria-valuenow", "75");
  await expect(
    chart(page).locator(".recharts-pie-label-text").first(),
  ).toHaveText("KAYA 75%");
});

for (const empty of [false, true])
  test(`Dashboard ${empty ? "empty" : "populated"} matches legacy screenshots`, async ({
    page,
    context,
  }, info) => {
    const reference = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    reference.on("pageerror", (error) => errors.push(error.message));
    await prepare(page, { empty });
    await prepare(reference, { empty });
    await Promise.all([
      page.goto("/super-admin/dashboard"),
      reference.goto(
        "http://localhost:5187/chairman/dashboard?role=super-admin",
      ),
    ]);
    await loaded(page);
    await expect(reference.locator('[role="progressbar"]')).toHaveCount(3);
    if (!empty) {
      await expect(chart(page).locator(".recharts-pie-label-text")).toHaveText([
        "KAYA 75%",
        "DI-KAYA 25%",
      ]);
      await expect(reference.locator(".recharts-pie-label-text")).toHaveText([
        "KAYA 75%",
        "DI-KAYA 25%",
      ]);
    } else
      await expect(chart(page)).toContainText(
        "No ECCD assessment data available yet.",
      );
    for (const target of [page, reference]) {
      await target.bringToFront();
      await target.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          Array.from(document.images).map((img) =>
            img.decode().catch(() => {}),
          ),
        );
      });
      await target.mouse.move(0, 0);
      if (!empty)
        await target
          .locator('.recharts-surface[role="application"]')
          .scrollIntoViewIfNeeded();
      // Recharts delays 400ms, then animates for 1500ms outside CSS cancellation.
      await target.waitForTimeout(2100);
      await target.evaluate(() => {
        window.scrollTo(0, 0);
        document.querySelector("main")?.scrollTo(0, 0);
      });
    }
    if (!empty) {
      const paths = (target: Page) =>
        target
          .locator(".recharts-pie-sector path")
          .evaluateAll((elements) =>
            elements.map((element) => element.getAttribute("d")),
          );
      expect(await paths(page)).toEqual(await paths(reference));
      expect(
        await chart(page)
          .locator(".recharts-legend-wrapper")
          .evaluate((element) => element.getBoundingClientRect().height),
      ).toBe(36);
    }
    const referenceCard = (title: string) =>
      reference
        .getByRole("heading", { name: title, exact: true })
        .locator('xpath=ancestor::*[contains(@class,"MuiCard-root")][1]');
    // Viewport + visible card captures avoid full-page resize restarting SVG animations on mobile.
    for (const [name, actual, expected] of [
      ["overview", page, reference],
      ["chart", chart(page), referenceCard("ECCD Progress Overview")],
      [
        "rankings",
        rankings(page),
        referenceCard("Domain Performance Breakdown"),
      ],
    ] as const) {
      if (name !== "overview") {
        const actualCard = name === "chart" ? chart(page) : rankings(page);
        const expectedCard = referenceCard(
          name === "chart"
            ? "ECCD Progress Overview"
            : "Domain Performance Breakdown",
        );
        await reference.bringToFront();
        await expectedCard.scrollIntoViewIfNeeded();
        await actualCard.scrollIntoViewIfNeeded();
        const measured = {
          actual: await actualCard.boundingBox(),
          expected: await expectedCard.boundingBox(),
        };
        await writeFile(
          info.outputPath(`${name}-geometry.json`),
          JSON.stringify(measured, null, 2),
        );
        expect(measured.actual!.width).toBeCloseTo(measured.expected!.width, 1);
        expect(measured.actual!.height).toBeCloseTo(
          measured.expected!.height,
          1,
        );
        // Isolate the original cards at the same viewport origin and measured size.
        for (const card of [actualCard, expectedCard])
          await card.evaluate(
            (element, isolate) => {
              const rect = element.getBoundingClientRect();
              const card = element as HTMLElement;
              card.dataset.originalScreenshotStyle =
                card.getAttribute("style") || "";
              if (isolate)
                Object.assign(card.style, {
                  position: "fixed",
                  left: "0",
                  top: "0",
                  width: `${rect.width}px`,
                  height: `${rect.height}px`,
                  zIndex: "1300",
                });
            },
            info.project.name === "mobile" && name === "chart",
          );
        const measure = (card: typeof actualCard) =>
          card.evaluate((element) => {
            const root = element.getBoundingClientRect();
            return Array.from(
              element.querySelectorAll("h2,h6,p,span,text"),
            ).map((node) => {
              const rect = node.getBoundingClientRect(),
                style = getComputedStyle(node);
              return {
                text: node.textContent,
                x: rect.x - root.x,
                y: rect.y - root.y,
                width: rect.width,
                height: rect.height,
                font: style.font,
                lineHeight: style.lineHeight,
                color: style.color,
                letterSpacing: style.letterSpacing,
                fontSmoothing: style.getPropertyValue("-webkit-font-smoothing"),
              };
            });
          });
        await writeFile(
          info.outputPath(`${name}-text.json`),
          JSON.stringify(
            {
              actual: await measure(actualCard),
              expected: await measure(expectedCard),
            },
            null,
            2,
          ),
        );
        const bars = (card: typeof actualCard) =>
          card.evaluate((element) =>
            Array.from(element.querySelectorAll('[role="progressbar"]')).map(
              (node) => {
                const root = node.getBoundingClientRect(),
                  child = node.firstElementChild!.getBoundingClientRect(),
                  style = getComputedStyle(node.firstElementChild!);
                return {
                  x: root.x,
                  y: root.y,
                  width: root.width,
                  child: { x: child.x, y: child.y, width: child.width },
                  transform: style.transform,
                  origin: style.transformOrigin,
                };
              },
            ),
          );
        if (name === "rankings")
          await writeFile(
            info.outputPath("bars.json"),
            JSON.stringify(
              {
                actual: await bars(actualCard),
                expected: await bars(expectedCard),
              },
              null,
              2,
            ),
          );
        if (!empty) await reference.waitForTimeout(2100);
      }
      const snapshot = `dashboard-${empty ? "empty" : "populated"}-${name}.png`;
      const scale = "device" as const;
      const baseline = info.snapshotPath(snapshot);
      await mkdir(dirname(baseline), { recursive: true });
      await writeFile(
        baseline,
        await expected.screenshot({ scale, animations: "disabled" }),
      );
      await page.bringToFront();
      await expect(actual).toHaveScreenshot(snapshot, {
        scale,
        threshold: 0.1,
        maxDiffPixels: 0,
      });
      await actual.screenshot({
        path: info.outputPath(`current-${name}.png`),
        scale,
        animations: "disabled",
      });
      await expected.screenshot({
        path: info.outputPath(`legacy-${name}.png`),
        scale,
        animations: "disabled",
      });
      if (name === "chart" && !empty) {
        await chart(page)
          .locator(".recharts-pie-sector path")
          .first()
          .hover({ position: { x: 10, y: 120 } });
        await expect(
          chart(page).locator(".recharts-tooltip-wrapper"),
        ).toBeVisible();
        await expect(
          chart(page).locator(".recharts-tooltip-wrapper"),
        ).toContainText("KAYA");
        await page.mouse.move(0, 0);
      }
      if (name !== "overview")
        for (const card of [
          name === "chart" ? chart(page) : rankings(page),
          referenceCard(
            name === "chart"
              ? "ECCD Progress Overview"
              : "Domain Performance Breakdown",
          ),
        ])
          await card.evaluate((element) => {
            const card = element as HTMLElement;
            card.setAttribute(
              "style",
              card.dataset.originalScreenshotStyle || "",
            );
            delete card.dataset.originalScreenshotStyle;
          });
    }
    expect(errors).toEqual([]);
    await reference.close();
  });

test("Dashboard contains long names and aligns the chart grid at 900px", async ({
  page,
}) => {
  await prepare(page, {
    domains: [
      "Very Long Expressive Language and Social Emotional Development Domain",
      ...domains,
    ],
  });
  await page.goto("/super-admin/dashboard");
  await loaded(page);
  for (const width of [320, 390, 599, 600, 899, 900, 1024, 1199, 1200, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const plot = await chart(page).boundingBox();
    const rank = await rankings(page).boundingBox();
    expect(plot).not.toBeNull();
    expect(rank).not.toBeNull();
    if (width < 900) {
      expect(rank!.y).toBeGreaterThan(plot!.y);
      expect(rank!.width).toBeCloseTo(plot!.width, 0);
    } else {
      expect(rank!.y).toBeCloseTo(plot!.y, 0);
      expect(plot!.width * 3 + 24).toBeCloseTo(
        (plot!.width + rank!.width + 24) * 2,
        0,
      );
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      await rankings(page).evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    expect(
      await summary(page).evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    expect(
      await chart(page)
        .locator(".recharts-responsive-container")
        .evaluate((element) => element.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(300);
    await expect(chart(page).getByRole("combobox")).toHaveCount(4);
    await choose(page, "Period", width % 2 ? "PRE" : "MID");
    await loaded(page);
  }
});
