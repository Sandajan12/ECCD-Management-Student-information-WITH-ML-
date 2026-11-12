import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const backend = "http://127.0.0.1:8775";
test.beforeEach(async ({ request }) => {
  expect((await request.post(`${backend}/__test/reset`)).ok()).toBe(true);
  expect((await request.post(`${backend}/__test/auth/mode`, {data: {enabled: false, access_minutes: 30}})).ok()).toBe(true);
});
async function login(page: Page) {
  const result = await page
    .context()
    .request.post(`${backend}/api/auth/login`, {
      data: { email: "adviser@example.com", password: "Example123" },
    });
  expect(result.status()).toBe(200);
  expect(await result.json()).not.toHaveProperty("refresh_token");
  await page.goto("/teacher/dashboard");
  await expect(page.locator("main").first()).toBeVisible();
}
async function storage(page: Page) {
  return page.evaluate(() =>
    [localStorage, sessionStorage].map((store) =>
      ["token", "refresh_token", "user", "role"].map((key) =>
        store.getItem(key),
      ),
    ),
  );
}

test("proactive expiry uses the cookie and server Date without remounting a form", async ({
  page,
}) => {
  await page.context().request.post(`${backend}/__test/auth/mode`, {data: {enabled: false, access_minutes: 1}});
  await page.clock.install();
  await login(page);
  await page
    .locator("main")
    .first()
    .evaluate((el) => el.setAttribute("data-auth-mounted", "yes"));
  const renewal = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/refresh"),
  );
  await page.clock.runFor(31000);
  expect((await renewal).status()).toBe(200);
  await expect(page.locator("main").first()).toHaveAttribute(
    "data-auth-mounted",
    "yes",
  );
  const remaining = await page.evaluate(async () => {
    const modulePath = "/src/services/api.ts";
    const { getAccessToken, accessTokenRemaining } = (await import(
      modulePath
    )) as typeof import("../src/services/api");
    return accessTokenRemaining(getAccessToken()!);
  });
  expect(remaining).toBeGreaterThan(50000);
});

test("a transient startup outage keeps auth loading and restores on retry", async ({
  page,
}) => {
  const response = await page
    .context()
    .request.post(`${backend}/api/auth/login`, {
      data: { email: "adviser@example.com", password: "Example123" },
    });
  expect(response.status()).toBe(200);
  await page.clock.install();
  let attempts = 0;
  await page.route("**/api/auth/refresh", (route) => {
    attempts++;
    return attempts === 1
      ? route.fulfill({
          status: 503,
          json: { message: "Temporarily unavailable" },
        })
      : route.continue();
  });
  await page.goto("/teacher/dashboard");
  await expect(
    page.getByText(
      "Waiting for a connection to restore your session. Your drafts are safe.",
    ),
  ).toBeVisible();
  await page.clock.runFor(31000);
  await expect(page.locator("main").first()).toBeVisible();
  expect(attempts).toBe(2);
});

test("ordinary permission rejection preserves the session without refreshing", async ({
  page,
}) => {
  await login(page);
  let renewals = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/auth/refresh")) renewals++;
  });
  await page.route("**/api/cookie-probe/permission", (route) =>
    route.fulfill({ status: 403, json: { detail: "Permission required" } }),
  );
  const active = await page.evaluate(async () => {
    const modulePath = "/src/services/api.ts";
    const { default: api, getAccessToken } = (await import(
      modulePath
    )) as typeof import("../src/services/api");
    await api.get("/api/cookie-probe/permission").catch(() => {});
    return Boolean(getAccessToken());
  });
  expect(active).toBe(true);
  expect(renewals).toBe(0);
  await expect(page).toHaveURL(/\/teacher\/dashboard$/);
});

test("reload restores only RAM credentials from a scoped HttpOnly Strict cookie and preserves drafts", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("token", "obsolete");
    localStorage.setItem("refresh_token", "obsolete");
    sessionStorage.setItem("user", "obsolete");
    localStorage.setItem("ames_draft_2_cookie_test", "unsaved work");
  });
  await login(page);
  const cookie = (
    await page.context().cookies(`${backend}/api/auth/refresh`)
  ).find((c) => c.name === "ames_refresh_token");
  expect(cookie).toMatchObject({
    httpOnly: true,
    secure: false,
    sameSite: "Strict",
    path: "/api/auth",
  });
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "ames_refresh_token",
  );
  expect(await storage(page)).toEqual([
    [null, null, null, null],
    [null, null, null, null],
  ]);
  await page.reload();
  await expect(page).toHaveURL(/\/teacher\/dashboard$/);
  await expect(page.locator("main").first()).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("ames_draft_2_cookie_test")),
  ).toBe("unsaved work");
  expect(await storage(page)).toEqual([
    [null, null, null, null],
    [null, null, null, null],
  ]);
});

test("concurrent expired protected requests share one cookie refresh and retry without remounting", async ({
  page,
}) => {
  await login(page);
  await page
    .locator("main")
    .first()
    .evaluate((el) => el.setAttribute("data-auth-mounted", "yes"));
  let renewals = 0;
  page.on("request", (req) => {
    if (req.url().endsWith("/api/auth/refresh")) {
      renewals++;
      expect(req.postData()).toBeFalsy();
    }
  });
  const attempts = new Map<string, number>();
  await page.route("**/api/cookie-probe/*", (route) => {
    const path = route.request().url();
    const count = (attempts.get(path) || 0) + 1;
    attempts.set(path, count);
    return route.fulfill({
      status: count === 1 ? 401 : 200,
      json:
        count === 1
          ? { code: "TOKEN_EXPIRED" }
          : { auth: route.request().headers().authorization },
    });
  });
  const result = await page.evaluate(async () => {
    const modulePath = "/src/services/api.ts";
    const { default: api, getAccessToken } = (await import(
      modulePath
    )) as typeof import("../src/services/api");
    const responses = await Promise.all([
      api.get("/api/cookie-probe/a"),
      api.get("/api/cookie-probe/b"),
    ]);
    return {
      headers: responses.map((r) => (r.data as { auth: string }).auth),
      token: getAccessToken(),
    };
  });
  expect(renewals).toBe(1);
  expect([...attempts.values()]).toEqual([2, 2]);
  expect(result.headers).toEqual([
    `Bearer ${result.token}`,
    `Bearer ${result.token}`,
  ]);
  await expect(page.locator("main").first()).toHaveAttribute(
    "data-auth-mounted",
    "yes",
  );
});

test("simultaneous tab reloads survive rotation and logout synchronizes every tab", async ({
  page,
  context,
}) => {
  await login(page);
  const other = await context.newPage();
  await other.goto("/teacher/dashboard");
  await expect(other.locator("main").first()).toBeVisible();
  await Promise.all([
    page.reload({ waitUntil: "domcontentloaded" }),
    other.reload({ waitUntil: "domcontentloaded" }),
  ]);
  await expect(page.locator("main").first()).toBeVisible();
  await expect(other.locator("main").first()).toBeVisible();
  await page.evaluate(async () => {
    const modulePath = "/src/services/api.ts";
    const { default: api, clearSession } = (await import(
      modulePath
    )) as typeof import("../src/services/api");
    await api.post("/api/auth/logout");
    clearSession();
  });
  await expect(page).toHaveURL(/\/login$/);
  await expect(other).toHaveURL(/\/login$/);
  await other.reload();
  await expect(
    other.getByRole("button", { name: "Log In", exact: true }),
  ).toBeVisible();
});

test("login propagates through BroadcastChannel without persistent credentials", async ({
  page,
  context,
}) => {
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Log In", exact: true }),
  ).toBeVisible();
  const other = await context.newPage();
  await other.goto("/login");
  await expect(
    other.getByRole("button", { name: "Log In", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const modulePath = "/src/services/api.ts";
    const { default: api, saveSession } = (await import(
      modulePath
    )) as typeof import("../src/services/api");
    const response = await api.post("/api/auth/login", {
      email: "adviser@example.com",
      password: "Example123",
    });
    saveSession(response.data);
  });
  await expect(other).toHaveURL(/\/teacher\/dashboard$/);
  expect(await storage(other)).toEqual([
    [null, null, null, null],
    [null, null, null, null],
  ]);
});

for (const status of [408, 425, 429, 500, 503]) {
  test(`temporary refresh ${status} preserves RAM and drafts and shares its retry cooldown`, async ({
    page,
  }) => {
    await login(page);
    await page.evaluate(() =>
      localStorage.setItem("ames_draft_2_cookie_test", "keep"),
    );
    let renewals = 0;
    await page.route("**/api/auth/refresh", (route) => {
      renewals++;
      return route.fulfill({
        status,
        headers: {
          "Retry-After": "60",
          "Access-Control-Expose-Headers": "Retry-After, Date",
        },
        json: { message: "Try later" },
      });
    });
    const result = await page.evaluate(async () => {
      const modulePath = "/src/services/api.ts";
      const { refreshSession, getAccessToken, proactiveRefreshDelay } =
        (await import(modulePath)) as typeof import("../src/services/api");
      const before = getAccessToken();
      await refreshSession().catch(() => {});
      await refreshSession().catch(() => {});
      return {
        same: before === getAccessToken(),
        delay: proactiveRefreshDelay(getAccessToken() || ""),
        draft: localStorage.getItem("ames_draft_2_cookie_test"),
      };
    });
    expect(renewals).toBe(1);
    expect(result.same).toBe(true);
    expect(result.delay).toBeGreaterThan(55000);
    expect(result.draft).toBe("keep");
    await expect(page).toHaveURL(/\/teacher\/dashboard$/);
  });
}

test("a late renewal cannot restore memory after logout", async ({ page }) => {
  await login(page);
  const result = await page.evaluate(async () => {
    const modulePath = "/src/services/api.ts";
    const {
      default: api,
      refreshSession,
      clearSession,
      getAccessToken,
    } = (await import(modulePath)) as typeof import("../src/services/api");
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const adapter = api.defaults.adapter;
    api.defaults.adapter = async (config) => {
      await gate;
      return {
        status: 200,
        statusText: "OK",
        headers: {},
        config,
        data: {
          access_token: "late",
          token: "late",
          user: { id: 2, role: "admin" },
        },
      };
    };
    const pending = refreshSession().catch(() => {});
    await Promise.resolve();
    clearSession();
    release?.();
    await pending;
    api.defaults.adapter = adapter;
    return getAccessToken();
  });
  expect(result).toBeNull();
});

for (const [code, reason] of [
  ["SESSION_REVOKED", "revoked"],
  ["INVALID_TOKEN", "invalid"],
  ["ACCOUNT_INACTIVE", "revoked"],
] as const) {
  test(`${code} ends the session and retains durable drafts`, async ({
    page,
  }) => {
    await login(page);
    await page.evaluate(() =>
      localStorage.setItem("ames_draft_2_cookie_test", "keep"),
    );
    await page.route("**/api/cookie-probe/rejected", (route) =>
      route.fulfill({
        status: code === "ACCOUNT_INACTIVE" ? 403 : 401,
        json: { code },
      }),
    );
    await page.evaluate(async () => {
      const modulePath = "/src/services/api.ts";
      const { default: api } = (await import(
        modulePath
      )) as typeof import("../src/services/api");
      await api.get("/api/cookie-probe/rejected").catch(() => {});
    });
    await expect(page).toHaveURL(new RegExp(`/login\\?session=${reason}$`));
    await expect(
      page.getByRole("button", { name: "Log In", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        localStorage.getItem("ames_draft_2_cookie_test"),
      ),
    ).toBe("keep");
    expect(await storage(page)).toEqual([
      [null, null, null, null],
      [null, null, null, null],
    ]);
  });
}
