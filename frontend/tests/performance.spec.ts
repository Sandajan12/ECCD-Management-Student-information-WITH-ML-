import { expect, test } from "@playwright/test";
import { settleWithConcurrency } from "../src/utils/concurrency";

test("batch work limits concurrent requests and preserves failures and order", async () => {
  let active = 0;
  let maximum = 0;
  const results = await settleWithConcurrency(
    Array.from({ length: 12 }, (_, index) => index),
    3,
    async (index) => {
      active++;
      maximum = Math.max(maximum, active);
      try {
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
        if (index === 4) throw new Error("One learner failed");
        return index * 2;
      } finally {
        active--;
      }
    },
  );
  expect(maximum).toBe(3);
  expect(results).toHaveLength(12);
  expect(results[4].status).toBe("rejected");
  expect(results[11]).toEqual({ status: "fulfilled", value: 22 });
});

test("cancelled batch never starts queued work", async () => {
  const controller = new AbortController();
  const started: number[] = [];
  await settleWithConcurrency(
    [1, 2, 3, 4, 5],
    2,
    async (value) => {
      started.push(value);
      controller.abort();
    },
    controller.signal,
  );
  expect(started).toEqual([1]);
});

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json:
        path.replace(/\/$/, "") === "/api/settings"
          ? {
              system_name: "Performance Test School",
              school_year_start_month: 8,
            }
          : path.endsWith("unread-count")
            ? { unreadCount: 0 }
            : [],
    });
  });
});

test("production login defers portal, chart and chat chunks", async ({
  page,
}) => {
  const scripts: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.push(request.url());
  });
  await page.goto("/login");
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  expect(
    scripts.some((url) => /PieChart-|ChatInterface-|MlInsights-/.test(url)),
  ).toBe(false);
  expect(scripts.some((url) => /assets\/index-.*\.js/.test(url))).toBe(true);
  expect(errors).toEqual([]);
  await test.info().attach("initial-scripts", {
    body: JSON.stringify(scripts, null, 2),
    contentType: "application/json",
  });
});

test("production deep link loads a protected page without other portal pages", async ({
  page,
}) => {
  const scripts: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem(
      "user",
      JSON.stringify({ id: 1, role: "super-admin", email: "test@example.com" }),
    );
    localStorage.setItem(
      "token",
      `test.${btoa(JSON.stringify({ exp: Date.now() / 1000 + 3600 }))}.test`,
    );
  });
  await page.goto("/super-admin/teachers");
  await expect(
    page.getByRole("button", { name: "Add New Teacher" }),
  ).toBeVisible();
  expect(scripts.some((url) => /TeacherManagement-/.test(url))).toBe(true);
  expect(
    scripts.some((url) =>
      /PieChart-|ChatInterface-|ParentMlInsights-/.test(url),
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
});

test("failed lazy chunk offers recovery and preserves saved inputs", async ({
  page,
}) => {
  await page.route("**/assets/RegisterParentPage-*.js", (route) =>
    route.abort(),
  );
  await page.addInitScript(() => {
    localStorage.setItem("ames_draft_performance", "unconfirmed inputs");
  });
  await page.goto("/register-parent");
  await expect(page.getByRole("alert")).toContainText(
    "This page could not load",
  );
  await expect(page.getByRole("button", { name: "Reload page" })).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("ames_draft_performance")),
  ).toBe("unconfirmed inputs");
  await page.unroute("**/assets/RegisterParentPage-*.js");
  await page.getByRole("button", { name: "Reload page" }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("ames_draft_performance")),
  ).toBe("unconfirmed inputs");
});
