import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { SessionResponse } from "../src/types";

const backend = "http://127.0.0.1:8775";

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${backend}/__test/reset`)).ok()).toBe(true);
});

async function seed(page: Page, session: SessionResponse, loadUser = true) {
  await page.addInitScript(
    ({ account, includeUser }) => {
      if (sessionStorage.getItem("ames_refresh_test_seeded")) return;
      sessionStorage.setItem("ames_refresh_test_seeded", "true");
      localStorage.setItem("token", account.access_token);
      localStorage.setItem("refresh_token", account.refresh_token);
      if (includeUser)
        localStorage.setItem("user", JSON.stringify(account.user));
      localStorage.setItem("ames_draft_2_refresh_test", "unsaved work");
    },
    { account: session, includeUser: loadUser },
  );
}

test("concurrent protected 401s share one real refresh and retry with the replacement bearer", async ({
  page,
  request,
}) => {
  const session = (await (
    await request.post(`${backend}/api/auth/login`, {
      data: { email: "adviser@example.com", password: "Example123" },
    })
  ).json()) as SessionResponse;
  await seed(page, session);
  const attempts = new Map<string, number>();
  let refreshes = 0;
  page.on("request", (req) => {
    if (req.url().endsWith("/api/auth/refresh")) refreshes += 1;
  });
  await page.route("**/api/refresh-test/*", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const count = (attempts.get(path) || 0) + 1;
    attempts.set(path, count);
    await route.fulfill({
      status: count === 1 ? 401 : 200,
      json:
        count === 1
          ? { code: "TOKEN_EXPIRED" }
          : { authorization: route.request().headers().authorization },
    });
  });
  await page.goto("/teacher/dashboard");
  await page
    .locator("main")
    .first()
    .evaluate((element) => {
      element.setAttribute("data-refresh-test", "mounted");
    });
  const result = await page.evaluate(async () => {
    const modulePath = "/src/services/api.ts";
    const { default: api } = (await import(
      modulePath
    )) as typeof import("../src/services/api");
    const responses = await Promise.all([
      api.get<{ authorization: string }>("/api/refresh-test/one"),
      api.get<{ authorization: string }>("/api/refresh-test/two"),
    ]);
    return {
      headers: responses.map((res) => res.data.authorization),
      token: localStorage.getItem("token"),
      refresh: localStorage.getItem("refresh_token"),
      draft: localStorage.getItem("ames_draft_2_refresh_test"),
    };
  });
  expect(refreshes).toBe(1);
  expect([...attempts.values()]).toEqual([2, 2]);
  expect(result.headers).toEqual([
    `Bearer ${result.token}`,
    `Bearer ${result.token}`,
  ]);
  expect(result.refresh).not.toBe(session.refresh_token);
  expect(result.token).not.toBe(session.access_token);
  expect(result.draft).toBe("unsaved work");
  await expect(page.locator("main").first()).toHaveAttribute(
    "data-refresh-test",
    "mounted",
  );
  await expect(page).toHaveURL(/\/teacher\/dashboard$/);
});

test("a skewed browser clock uses the exposed server Date and renews on tab wake", async ({
  page,
  request,
}) => {
  const session = (await (
    await request.post(`${backend}/api/auth/login`, {
      data: { email: "adviser@example.com", password: "Example123" },
    })
  ).json()) as SessionResponse;
  await page.clock.install({ time: new Date(Date.now() + 5 * 60000) });
  await seed(page, session);
  await page.goto("/teacher/dashboard");
  const remaining = await page.evaluate(async () => {
    const modulePath = "/src/services/api.ts";
    const { default: api, accessTokenRemaining } = (await import(
      modulePath
    )) as typeof import("../src/services/api");
    await api.get("/api/teachers/me/access");
    return accessTokenRemaining(localStorage.getItem("token") || "");
  });
  expect(remaining).toBeGreaterThan(29 * 60000);
  expect(remaining).toBeLessThan(31 * 60000);
  const renewed = page.waitForResponse((res) =>
    res.url().endsWith("/api/auth/refresh"),
  );
  // Simulate a sleeping tab: advance Date without delivering pending timers.
  await page.clock.setSystemTime(new Date(Date.now() + 34 * 60000));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.clock.runFor(100);
  expect((await renewed).status()).toBe(200);
  await expect(page).toHaveURL(/\/teacher\/dashboard$/);
});

test("expired or undecodable access storage renews before logging out", async ({
  page,
  request,
}) => {
  const session = (await (
    await request.post(`${backend}/api/auth/login`, {
      data: { email: "adviser@example.com", password: "Example123" },
    })
  ).json()) as SessionResponse;
  await seed(
    page,
    { ...session, access_token: "undecodable", token: "undecodable" },
    false,
  );
  const renewed = page.waitForResponse((res) =>
    res.url().endsWith("/api/auth/refresh"),
  );
  await page.goto("/login");
  expect((await renewed).status()).toBe(200);
  await expect(page).toHaveURL(/\/teacher\/dashboard$/);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("ames_draft_2_refresh_test"),
    ),
  ).toBe("unsaved work");
});

test("legacy malformed access storage without a refresh token reports invalid", async ({
  page,
  request,
}) => {
  const session = (await (
    await request.post(`${backend}/api/auth/login`, {
      data: { email: "adviser@example.com", password: "Example123" },
    })
  ).json()) as SessionResponse;
  await seed(
    page,
    {
      ...session,
      access_token: "malformed",
      token: "malformed",
      refresh_token: "",
    },
    false,
  );
  await page.goto("/login");
  await expect(page).toHaveURL(/\/login\?session=invalid$/);
  await expect(
    page.getByText("Your session is no longer valid. Please sign in again.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("ames_draft_2_refresh_test"),
    ),
  ).toBe("unsaved work");
});

for (const [code, reason, message] of [
  [
    "SESSION_REVOKED",
    "revoked",
    "Your session was ended because your account credentials or permissions changed. Please sign in again.",
  ],
  [
    "INVALID_TOKEN",
    "invalid",
    "Your session is no longer valid. Please sign in again.",
  ],
] as const) {
  test(`${code} ends the session without attempting refresh and preserves drafts`, async ({
    page,
    request,
  }) => {
    const session = (await (
      await request.post(`${backend}/api/auth/login`, {
        data: { email: "adviser@example.com", password: "Example123" },
      })
    ).json()) as SessionResponse;
    await seed(page, session);
    let refreshes = 0;
    page.on("request", (req) => {
      if (req.url().endsWith("/api/auth/refresh")) refreshes += 1;
    });
    await page.route("**/api/refresh-test/rejected", (route) =>
      route.fulfill({ status: 401, json: { code } }),
    );
    await page.goto("/teacher/dashboard");
    await page.evaluate(async () => {
      const modulePath = "/src/services/api.ts";
      const { default: api } = (await import(
        modulePath
      )) as typeof import("../src/services/api");
      await api.get("/api/refresh-test/rejected").catch(() => {});
    });
    await expect(page).toHaveURL(new RegExp(`/login\\?session=${reason}$`));
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    expect(refreshes).toBe(0);
    expect(
      await page.evaluate(() => [
        localStorage.getItem("token"),
        localStorage.getItem("refresh_token"),
        localStorage.getItem("user"),
        localStorage.getItem("ames_draft_2_refresh_test"),
      ]),
    ).toEqual([null, null, null, "unsaved work"]);
  });
}

test("a failed refresh preserves the expired reason and durable drafts", async ({
  page,
  request,
}) => {
  const session = (await (
    await request.post(`${backend}/api/auth/login`, {
      data: { email: "adviser@example.com", password: "Example123" },
    })
  ).json()) as SessionResponse;
  await seed(page, session);
  await page.route("**/api/refresh-test/rejected", (route) =>
    route.fulfill({ status: 401, json: { code: "TOKEN_EXPIRED" } }),
  );
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ status: 401, json: { code: "TOKEN_EXPIRED" } }),
  );
  await page.goto("/teacher/dashboard");
  await page.evaluate(async () => {
    const modulePath = "/src/services/api.ts";
    const { default: api } = (await import(
      modulePath
    )) as typeof import("../src/services/api");
    await api.get("/api/refresh-test/rejected").catch(() => {});
  });
  await expect(page).toHaveURL(/\/login\?session=expired$/);
  await expect(
    page.getByText("Your session has expired. Please sign in again.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("ames_draft_2_refresh_test"),
    ),
  ).toBe("unsaved work");
});

test("a late refresh cannot restore credentials after local logout", async ({
  page,
  request,
}) => {
  const session = (await (
    await request.post(`${backend}/api/auth/login`, {
      data: { email: "adviser@example.com", password: "Example123" },
    })
  ).json()) as SessionResponse;
  await seed(page, session);
  await page.goto("/teacher/dashboard");
  const result = await page.evaluate(async () => {
    const modulePath = "/src/services/api.ts";
    const {
      default: api,
      refreshSession,
      clearSession,
    } = (await import(modulePath)) as typeof import("../src/services/api");
    let release: (() => void) | undefined;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const realAdapter = api.defaults.adapter;
    api.defaults.adapter = async (config) => {
      await wait;
      return {
        config,
        status: 200,
        statusText: "OK",
        headers: {},
        data: { access_token: "late", refresh_token: "late", user: { id: 2 } },
      };
    };
    const pending = refreshSession().catch(() => {});
    clearSession();
    release?.();
    await pending;
    api.defaults.adapter = realAdapter;
    return [
      localStorage.getItem("token"),
      localStorage.getItem("refresh_token"),
      localStorage.getItem("ames_draft_2_refresh_test"),
    ];
  });
  expect(result).toEqual([null, null, "unsaved work"]);
});

test("a delayed expired request cannot retry under a different stored account", async ({
  page,
  request,
}) => {
  const sessions: SessionResponse[] = [];
  for (const name of ["adviser", "parent"]) {
    sessions.push(
      (await (
        await request.post(`${backend}/api/auth/login`, {
          data: { email: `${name}@example.com`, password: "Example123" },
        })
      ).json()) as SessionResponse,
    );
  }
  await seed(page, sessions[0]);
  await page.goto("/teacher/dashboard");
  const result = await page.evaluate(async (next) => {
    const modulePath = "/src/services/api.ts";
    const { default: api } = (await import(
      modulePath
    )) as typeof import("../src/services/api");
    const realAdapter = api.defaults.adapter;
    let attempts = 0;
    api.defaults.adapter = async (config) => {
      attempts += 1;
      // Simulate a different tab replacing shared localStorage while this call is in flight.
      localStorage.setItem("token", next.access_token);
      localStorage.setItem("refresh_token", next.refresh_token);
      localStorage.setItem("user", JSON.stringify(next.user));
      throw {
        isAxiosError: true,
        config,
        response: { status: 401, data: { code: "TOKEN_EXPIRED" } },
      };
    };
    await api
      .post("/api/refresh-test/stale-write", { value: "old account draft" })
      .catch(() => {});
    api.defaults.adapter = realAdapter;
    return {
      attempts,
      token: localStorage.getItem("token"),
      draft: localStorage.getItem("ames_draft_2_refresh_test"),
    };
  }, sessions[1]);
  expect(result.attempts).toBe(1);
  expect(result.token).toBe(sessions[1].access_token);
  expect(result.draft).toBe("unsaved work");
});

test("expired requests retry at most once and unknown 401s do not erase a renewable session", async ({
  page,
  request,
}) => {
  const session = (await (
    await request.post(`${backend}/api/auth/login`, {
      data: { email: "adviser@example.com", password: "Example123" },
    })
  ).json()) as SessionResponse;
  await seed(page, session);
  await page.goto("/teacher/dashboard");
  const result = await page.evaluate(async () => {
    const modulePath = "/src/services/api.ts";
    const { default: api } = (await import(
      modulePath
    )) as typeof import("../src/services/api");
    const snapshot = {
      token: localStorage.getItem("token") || "",
      refresh_token: localStorage.getItem("refresh_token") || "",
      user: JSON.parse(
        localStorage.getItem("user") || "null",
      ) as SessionResponse["user"],
    };
    const realAdapter = api.defaults.adapter;
    const attempts: string[] = [];
    let ended = 0;
    const expired = () => {
      ended += 1;
    };
    window.addEventListener("ames-session-expired", expired);
    api.defaults.adapter = async (config) => {
      attempts.push(config.url || "");
      if (config.url === "/api/auth/refresh") {
        return {
          config,
          status: 200,
          statusText: "OK",
          headers: {},
          data: { ...snapshot, access_token: snapshot.token },
        };
      }
      throw {
        isAxiosError: true,
        config,
        response: {
          status: 401,
          data: config.url?.endsWith("unknown")
            ? {}
            : { code: "TOKEN_EXPIRED" },
        },
      };
    };
    await api.get("/api/refresh-test/always-expired").catch(() => {});
    await api.get("/api/refresh-test/unknown").catch(() => {});
    window.removeEventListener("ames-session-expired", expired);
    api.defaults.adapter = realAdapter;
    return { attempts, ended };
  });
  expect(result.attempts).toEqual([
    "/api/refresh-test/always-expired",
    "/api/auth/refresh",
    "/api/refresh-test/always-expired",
    "/api/refresh-test/unknown",
  ]);
  expect(result.ended).toBe(0);
});

for (const [failure, status, retryAfter, wait] of [
  ["network loss", 0, "", 30000],
  ["timeout", 0, "", 30000],
  ["HTTP 503", 503, "", 30000],
  ["HTTP 429", 429, "90", 90000],
  ["HTTP 429 with a server date", 429, "date", 90000],
] as const) {
  test(`${failure} during renewal preserves the session and recovers automatically`, async ({
    page,
    request,
  }) => {
    const session = (await (
      await request.post(`${backend}/api/auth/login`, {
        data: { email: "adviser@example.com", password: "Example123" },
      })
    ).json()) as SessionResponse;
    await seed(page, session);
    await page.clock.install();
    let refreshes = 0;
    await page.route("**/api/auth/refresh", async (route) => {
      refreshes += 1;
      if (refreshes > 1) return route.continue();
      if (!status)
        return route.abort(failure === "timeout" ? "timedout" : "failed");
      const serverNow = Date.now();
      await route.fulfill({
        status,
        headers: {
          "Retry-After":
            retryAfter === "date"
              ? new Date(serverNow + wait).toUTCString()
              : retryAfter,
          Date: new Date(serverNow).toUTCString(),
          "Access-Control-Expose-Headers": "Retry-After, Date",
        },
        json: { message: "Temporarily unavailable" },
      });
    });
    await page.goto("/teacher/dashboard");
    await expect(
      page.getByRole("heading", { name: "Educational Overview" }),
    ).toBeVisible();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    if (retryAfter === "date")
      await page.clock.setSystemTime(new Date(Date.now() + 5 * 60000));
    const saved = await page.evaluate(async () => {
      const modulePath = "/src/services/api.ts";
      const { refreshSession, proactiveRefreshDelay } = (await import(
        modulePath
      )) as typeof import("../src/services/api");
      await refreshSession().catch(() => {});
      // Concurrent requests and clock/focus events must respect the same cooldown.
      await Promise.allSettled([refreshSession(), refreshSession()]);
      window.dispatchEvent(new Event("ames-server-clock-updated"));
      window.dispatchEvent(new Event("focus"));
      return {
        token: localStorage.getItem("token"),
        refresh: localStorage.getItem("refresh_token"),
        draft: localStorage.getItem("ames_draft_2_refresh_test"),
        delay: proactiveRefreshDelay(localStorage.getItem("token") || ""),
      };
    });
    expect(saved).toEqual({
      token: session.access_token,
      refresh: session.refresh_token,
      draft: "unsaved work",
      delay: wait,
    });
    expect(refreshes).toBe(1);
    await page.clock.runFor(wait - 1);
    expect(refreshes).toBe(1);
    const renewed = page.waitForResponse((response) =>
      response.url().endsWith("/api/auth/refresh"),
    );
    await page.clock.runFor(1);
    expect((await renewed).status()).toBe(200);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("refresh_token")))
      .not.toBe(session.refresh_token);
    await expect(page).toHaveURL(/\/teacher\/dashboard$/);
    expect(refreshes).toBe(2);
  });
}

test("repeated temporary failures back off to two minutes and logout cancels recovery", async ({
  page,
  request,
}) => {
  const session = (await (
    await request.post(`${backend}/api/auth/login`, {
      data: { email: "adviser@example.com", password: "Example123" },
    })
  ).json()) as SessionResponse;
  await seed(page, session);
  await page.clock.install();
  let refreshes = 0;
  await page.route("**/api/auth/refresh", async (route) => {
    refreshes += 1;
    await route.fulfill({
      status: 503,
      json: { message: "Temporarily unavailable" },
    });
  });
  await page.goto("/teacher/dashboard");
  await expect(
    page.getByRole("heading", { name: "Educational Overview" }),
  ).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.evaluate(async () => {
    const modulePath = "/src/services/api.ts";
    const { refreshSession } = (await import(
      modulePath
    )) as typeof import("../src/services/api");
    await refreshSession().catch(() => {});
  });
  for (const [delay, next] of [
    [30000, 60000],
    [60000, 120000],
    [120000, 120000],
  ]) {
    const failed = page.waitForResponse((response) =>
      response.url().endsWith("/api/auth/refresh"),
    );
    await page.clock.runFor(delay);
    expect((await failed).status()).toBe(503);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const modulePath = "/src/services/api.ts";
          const { proactiveRefreshDelay } = (await import(
            modulePath
          )) as typeof import("../src/services/api");
          return proactiveRefreshDelay(localStorage.getItem("token") || "");
        }),
      )
      .toBe(next);
  }
  expect(refreshes).toBe(4);
  await page.evaluate(async () => {
    const modulePath = "/src/services/api.ts";
    const { clearSession } = (await import(
      modulePath
    )) as typeof import("../src/services/api");
    clearSession();
    window.dispatchEvent(new Event("ames-session-updated"));
  });
  await page.clock.runFor(180000);
  expect(refreshes).toBe(4);
  const resetDelay = await page.evaluate(async (account) => {
    const modulePath = "/src/services/api.ts";
    const { saveSession, refreshSession, proactiveRefreshDelay } =
      (await import(modulePath)) as typeof import("../src/services/api");
    saveSession(account);
    await refreshSession().catch(() => {});
    return proactiveRefreshDelay(localStorage.getItem("token") || "");
  }, session);
  expect(resetDelay).toBe(30000);
  expect(refreshes).toBe(5);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("ames_draft_2_refresh_test"),
    ),
  ).toBe("unsaved work");
});

test("offline tabs preserve expired access credentials and renew after reconnection", async ({
  page,
  context,
  request,
}) => {
  const session = (await (
    await request.post(`${backend}/api/auth/login`, {
      data: { email: "adviser@example.com", password: "Example123" },
    })
  ).json()) as SessionResponse;
  await seed(page, session);
  await page.clock.install();
  let expireNextAccess = false;
  await page.route("**/api/teachers/access-controls", async (route) => {
    if (!expireNextAccess) return route.continue();
    expireNextAccess = false;
    // Server expiry is explicit: healthy responses can correct the simulated browser clock.
    await route.fulfill({ status: 401, json: { code: "TOKEN_EXPIRED" } });
  });
  let refreshes = 0;
  page.on("request", (req) => {
    if (req.url().endsWith("/api/auth/refresh")) refreshes += 1;
  });
  await page.goto("/teacher/dashboard");
  await expect(
    page.getByRole("heading", { name: "Educational Overview" }),
  ).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await context.setOffline(true);
  await page.clock.runFor(31 * 60000);
  expect(refreshes).toBe(0);
  expect(
    await page.evaluate(() => [
      localStorage.getItem("token"),
      localStorage.getItem("refresh_token"),
      localStorage.getItem("ames_draft_2_refresh_test"),
    ]),
  ).toEqual([session.access_token, session.refresh_token, "unsaved work"]);
  const renewed = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/refresh"),
  );
  expireNextAccess = true;
  await context.setOffline(false);
  await page.clock.runFor(100);
  expect((await renewed).status()).toBe(200);
  await expect(page).toHaveURL(/\/teacher\/dashboard$/);
});

test("an archived account's real 403 ends its browser session while ordinary 403s do not", async ({
  page,
  request,
}) => {
  const session = (await (
    await request.post(`${backend}/api/auth/login`, {
      data: { email: "adviser@example.com", password: "Example123" },
    })
  ).json()) as SessionResponse;
  const chairman = (await (
    await request.post(`${backend}/api/auth/login`, {
      data: { email: "chairman@example.com", password: "Example123" },
    })
  ).json()) as SessionResponse;
  await seed(page, session);
  let refreshes = 0;
  page.on("request", (req) => {
    if (req.url().endsWith("/api/auth/refresh")) refreshes += 1;
  });
  await page.goto("/teacher/dashboard");
  const forbidden = await page.evaluate(async () => {
    const modulePath = "/src/services/api.ts";
    const { default: api } = (await import(
      modulePath
    )) as typeof import("../src/services/api");
    return api.get("/api/chairman/teachers").then(
      () => false,
      () => Boolean(localStorage.getItem("token")),
    );
  });
  expect(forbidden).toBe(true);
  await expect(page).toHaveURL(/\/teacher\/dashboard$/);
  expect(
    (
      await request.put(`${backend}/api/teachers/2/archive`, {
        headers: { Authorization: `Bearer ${chairman.access_token}` },
      })
    ).status(),
  ).toBe(200);
  await page
    .evaluate(async () => {
      const modulePath = "/src/services/api.ts";
      const { default: api } = (await import(
        modulePath
      )) as typeof import("../src/services/api");
      void api.get("/api/students/all").catch(() => {});
    })
    .catch((error: unknown) => {
      // Revocation may navigate before this browser script returns.
      if (
        !(error instanceof Error) ||
        !error.message.includes("Execution context was destroyed")
      )
        throw error;
    });
  await expect(page).toHaveURL(/\/login\?session=revoked$/);
  await expect(
    page.getByText(
      "Your session was ended because your account credentials or permissions changed. Please sign in again.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(refreshes).toBe(0);
  expect(
    await page.evaluate(() => [
      localStorage.getItem("token"),
      localStorage.getItem("refresh_token"),
      localStorage.getItem("ames_draft_2_refresh_test"),
    ]),
  ).toEqual([null, null, "unsaved work"]);
});
