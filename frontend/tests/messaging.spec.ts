import { expect, test } from "@playwright/test";
import type {
  APIRequestContext,
  Browser,
  Page,
  WebSocket,
} from "@playwright/test";
import type { SessionResponse } from "../src/types";

const api = "http://127.0.0.1:8768";
async function session(
  request: APIRequestContext,
  email: string,
): Promise<SessionResponse> {
  const response = await request.post(`${api}/api/auth/login`, {
    data: { email: `${email}@example.com`, password: "Example123" },
  });
  expect(response.status()).toBe(200);
  return response.json() as Promise<SessionResponse>;
}
async function portal(
  browser: Browser,
  account: SessionResponse,
  role: "teacher" | "parent",
  mobile: boolean,
  disconnected = false,
  prepare?: (page: Page) => Promise<void>,
  waitForHistory = true,
) {
  const context = await browser.newContext({
    viewport: mobile
      ? { width: 375, height: 812 }
      : { width: 1280, height: 900 },
  });
  await context.addInitScript((data) => {
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("token", data.token);
  }, account);
  const page = await context.newPage();
  const sockets = new Set<WebSocket>();
  page.on("websocket", (socket) => {
    if (!new URL(socket.url()).pathname.startsWith("/socket.io/")) return;
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  const counts: Record<string, number> = {};
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/messages/"))
      counts[path] = (counts[path] || 0) + 1;
  });
  if (disconnected) {
    await page.clock.install();
    await page.route("**/socket.io/**", (route) => route.abort());
    await page.routeWebSocket("**/socket.io/**", (socket) => socket.close());
  }
  await prepare?.(page);
  const hydrated = waitForHistory
    ? page.waitForResponse((response) =>
        response.url().includes("/api/messages/history"),
      )
    : null;
  await page.goto(`/${role}/messages`);
  if (disconnected) await page.clock.runFor(1500);
  await expect.poll(() => counts["/api/messages/contacts"]).toBe(1);
  if (mobile)
    await page
      .getByRole("button", {
        name: role === "teacher" ? /Test Parent/ : /Teacher Test Adviser/,
      })
      .click();
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true }),
  ).toBeVisible();
  await expect.poll(() => counts["/api/messages/history"]).toBe(1);
  if (hydrated) await (await hydrated).finished();
  return { page, context, counts, sockets };
}
async function visibility(page: Page, state: "hidden" | "visible") {
  await page.evaluate((value) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => value,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}
test.beforeEach(async ({ request }) => {
  expect((await request.post(`${api}/__test/reset`)).ok()).toBeTruthy();
});

test("push survives delayed history, contact switches isolate drafts, and focus/sync events stay idle", async ({
  browser,
  request,
}, testInfo) => {
  let releaseHistory = () => {};
  const held = new Promise<void>((resolve) => {
    releaseHistory = resolve;
  });
  const parentAccount = await session(request, "parent");
  const view = await portal(
    browser,
    await session(request, "adviser"),
    "teacher",
    testInfo.project.name === "mobile",
    false,
    async (page) => {
      await page.route("**/api/messages/contacts", async (route) => {
        const response = await route.fetch();
        const data = (await response.json()) as {
          myId: number;
          contacts: { id: number; name: string }[];
        };
        await route.fulfill({
          json: {
            ...data,
            contacts: [...data.contacts, { id: 2, name: "Other Parent" }],
          },
        });
      });
      let first = true;
      await page.route("**/api/messages/history?**", async (route) => {
        if (
          new URL(route.request().url()).searchParams.get("parent_id") === "2"
        )
          return route.fulfill({ json: [] });
        if (!first) return route.continue();
        first = false;
        await held;
        await route.fulfill({ json: [] });
      });
    },
    false,
  );
  try {
    expect(
      (
        await request.post(`${api}/api/messages/send`, {
          headers: { Authorization: `Bearer ${parentAccount.token}` },
          data: { teacher_id: 1, parent_id: 1, body: "Arrived during history" },
        })
      ).status(),
    ).toBe(201);
    await expect(
      view.page.getByText("Arrived during history", { exact: true }),
    ).toHaveCount(1);
    releaseHistory();
    await view.page.waitForResponse((response) =>
      response.url().includes("/api/messages/history"),
    );
    await expect(
      view.page.getByText("Arrived during history", { exact: true }),
    ).toHaveCount(1);
    const input = view.page.getByRole("textbox", {
      name: "Message",
      exact: true,
    });
    await input.fill("First thread draft");
    const back = view.page.getByRole("button", {
      name: "Back to contacts list",
    });
    if (testInfo.project.name === "mobile") await back.click();
    await view.page.getByRole("button", { name: /Other Parent/ }).click();
    await expect(input).toHaveValue("");
    await expect(
      view.page.getByText("Arrived during history", { exact: true }),
    ).toHaveCount(0);
    await input.fill("Second thread draft");
    if (testInfo.project.name === "mobile") await back.click();
    await view.page.getByRole("button", { name: /Test Parent/ }).click();
    await expect(input).toHaveValue("First thread draft");
    await expect(
      view.page.getByText("Arrived during history", { exact: true }),
    ).toHaveCount(1);
    await view.page.waitForTimeout(750);
    const counts = { ...view.counts };
    await view.page.evaluate(() => {
      for (let index = 0; index < 10; index++) {
        window.dispatchEvent(new Event("focus"));
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(
          new CustomEvent("ames-record-synced", {
            detail: "ames_draft_2_unrelated",
          }),
        );
      }
    });
    await view.page.waitForTimeout(750);
    expect(view.counts).toEqual(counts);
    expect(view.sockets.size).toBe(1);
  } finally {
    releaseHistory();
    await view.context.close();
  }
});

test("socket rate feedback pauses HTTP and reconnects once after its cooldown", async ({
  browser,
  request,
}, testInfo) => {
  let sendPacket: ((packet: string) => void) | undefined;
  let connections = 0;
  const view = await portal(
    browser,
    await session(request, "adviser"),
    "teacher",
    testInfo.project.name === "mobile",
    false,
    async (page) => {
      await page.routeWebSocket("**/socket.io/**", (socket) => {
        socket.connectToServer();
        connections++;
        sendPacket = (packet) => socket.send(packet);
      });
    },
  );
  try {
    await expect.poll(() => connections).toBe(1);
    await view.page.clock.install();
    sendPacket!('42["rate_limit_error",{"status":429,"retryAfter":90}]');
    // Let the injected frame reach the client before advancing its clock.
    await view.page.waitForTimeout(100);
    await view.page.clock.runFor(89000);
    expect(connections).toBe(1);
    expect(view.counts["/api/messages/history"]).toBe(1);
    expect(view.counts["/api/messages/contacts"]).toBe(1);
    await view.page.clock.runFor(2500);
    await view.page.clock.resume();
    await expect.poll(() => connections).toBe(2);
    await expect.poll(() => view.counts["/api/messages/history"]).toBe(2);
    await expect.poll(() => view.counts["/api/messages/contacts"]).toBe(2);
    await view.page.waitForTimeout(750);
    expect(view.counts["/api/messages/history"]).toBe(2);
  } finally {
    await view.context.close();
  }
});

test("read receipts synchronize hidden tabs without duplicate mark-read requests", async ({
  browser,
  request,
}, testInfo) => {
  const teacherAccount = await session(request, "adviser");
  const parentAccount = await session(request, "parent");
  const mobile = testInfo.project.name === "mobile";
  const first = await portal(browser, parentAccount, "parent", mobile);
  const second = await portal(browser, parentAccount, "parent", mobile);
  try {
    await visibility(first.page, "hidden");
    await visibility(second.page, "hidden");
    const response = await request.post(`${api}/api/messages/send`, {
      headers: { Authorization: `Bearer ${teacherAccount.token}` },
      data: { teacher_id: 1, parent_id: 1, body: "Read across tabs" },
    });
    expect(response.status()).toBe(201);
    for (const view of [first, second]) {
      await expect(
        view.page.getByText("Read across tabs", { exact: true }),
      ).toHaveCount(1);
      await expect
        .poll(() => view.counts["/api/messages/unread-count"])
        .toBe(2);
      expect(view.counts["/api/messages/read"]).toBeUndefined();
    }
    await visibility(first.page, "visible");
    await expect.poll(() => first.counts["/api/messages/read"]).toBe(1);
    await expect
      .poll(() => second.counts["/api/messages/unread-count"])
      .toBe(3);
    await visibility(second.page, "visible");
    await second.page.waitForTimeout(750);
    expect(second.counts["/api/messages/read"]).toBeUndefined();
    expect(second.counts["/api/messages/history"]).toBe(1);
    const unread = await request.get(`${api}/api/messages/unread-count`, {
      headers: { Authorization: `Bearer ${parentAccount.token}` },
    });
    expect(await unread.json()).toEqual({ unreadCount: 0 });
  } finally {
    await first.context.close();
    await second.context.close();
  }
});

test("two portals stay idle for two minutes and receive committed sends without history polling", async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(160000);
  const teacherAccount = await session(request, "adviser");
  const parentAccount = await session(request, "parent");
  const mobile = testInfo.project.name === "mobile";
  const teacher = await portal(browser, teacherAccount, "teacher", mobile);
  const parent = await portal(browser, parentAccount, "parent", mobile);
  try {
    const expected = {
      "/api/messages/unread-count": 1,
      "/api/messages/contacts": 1,
      "/api/messages/history": 1,
    };
    expect(teacher.counts).toEqual(expected);
    expect(parent.counts).toEqual(expected);
    expect(teacher.sockets.size).toBe(1);
    expect(parent.sockets.size).toBe(1);
    // Real time and real Socket.IO: transport heartbeats are excluded above.
    await Promise.all([
      teacher.page.waitForTimeout(120000),
      parent.page.waitForTimeout(120000),
    ]);
    expect(teacher.counts).toEqual(expected);
    expect(parent.counts).toEqual(expected);
    expect(teacher.sockets.size).toBe(1);
    expect(parent.sockets.size).toBe(1);
    const input = teacher.page.getByRole("textbox", {
      name: "Message",
      exact: true,
    });
    await testInfo.attach("idle-request-counts.json", {
      body: JSON.stringify(
        {
          seconds: 120,
          teacher: teacher.counts,
          parent: parent.counts,
          teacherSockets: teacher.sockets.size,
          parentSockets: parent.sockets.size,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    await input.fill("Live teacher message");
    await teacher.page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      parent.page.getByText("Live teacher message", { exact: true }),
    ).toHaveCount(1);
    await expect(input).toHaveValue("");
    await parent.page
      .getByRole("textbox", { name: "Message", exact: true })
      .fill("Live parent reply");
    await parent.page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      teacher.page.getByText("Live parent reply", { exact: true }),
    ).toHaveCount(1);
    // A REST-only notification also arrives without any sender socket event.
    expect(
      (
        await request.post(`${api}/api/messages/notify-student`, {
          headers: { Authorization: `Bearer ${teacherAccount.token}` },
          data: { student_id: 1 },
        })
      ).status(),
    ).toBe(201);
    await expect(
      parent.page.getByText(/The official profile for Test has been updated/),
    ).toBeVisible();
    for (const view of [teacher, parent]) {
      expect(view.counts["/api/messages/history"]).toBe(1);
      expect(view.counts["/api/messages/contacts"]).toBe(1);
      await expect(view.page.getByText(/Too many requests/)).toHaveCount(0);
    }
  } finally {
    await teacher.context.close();
    await parent.context.close();
  }
});

test("failed sends survive reload and reconnect until a manual send persists one message", async ({
  browser,
  request,
}, testInfo) => {
  const teacher = await portal(
    browser,
    await session(request, "adviser"),
    "teacher",
    testInfo.project.name === "mobile",
  );
  const parent = await portal(
    browser,
    await session(request, "parent"),
    "parent",
    testInfo.project.name === "mobile",
  );
  const key = "ames_draft_2_message_1_1";
  try {
    await teacher.page.route("**/api/messages/send", (route) =>
      route.abort("internetdisconnected"),
    );
    await teacher.page
      .getByRole("textbox", { name: "Message", exact: true })
      .fill("Offline durable message");
    await teacher.page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect
      .poll(() =>
        teacher.page.evaluate(
          (draftKey) =>
            JSON.parse(localStorage.getItem(draftKey) || "null")
              ?.is_pending_sync,
          key,
        ),
      )
      .toBe(true);
    await teacher.page.reload();
    if (testInfo.project.name === "mobile")
      await teacher.page.getByRole("button", { name: /Test Parent/ }).click();
    await expect(
      teacher.page.getByRole("textbox", { name: "Message", exact: true }),
    ).toHaveValue("Offline durable message");
    await teacher.page.unroute("**/api/messages/send");
    await teacher.page.evaluate(() =>
      window.dispatchEvent(new Event("online")),
    );
    await expect(
      teacher.page.getByRole("textbox", { name: "Message", exact: true }),
    ).toHaveValue("Offline durable message");
    await expect(
      parent.page.getByText("Offline durable message", { exact: true }),
    ).toHaveCount(0);
    await teacher.page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      parent.page.getByText("Offline durable message", { exact: true }),
    ).toHaveCount(1);
    await expect(
      teacher.page.getByRole("textbox", { name: "Message", exact: true }),
    ).toHaveValue("");
    expect(
      await teacher.page.evaluate(
        (draftKey) => localStorage.getItem(draftKey),
        key,
      ),
    ).toBeNull();
    expect(parent.counts["/api/messages/history"]).toBe(1);
    expect(parent.counts["/api/messages/contacts"]).toBe(1);
  } finally {
    await teacher.context.close();
    await parent.context.close();
  }
});

test("HTTP 429 keeps the draft, respects Retry-After, and never resubmits automatically", async ({
  browser,
  request,
}, testInfo) => {
  const view = await portal(
    browser,
    await session(request, "adviser"),
    "teacher",
    testInfo.project.name === "mobile",
    true,
  );
  try {
    await view.page.route("**/api/messages/send", (route) =>
      route.fulfill({
        status: 429,
        headers: {
          "Retry-After": "90",
          "Access-Control-Expose-Headers": "Retry-After",
        },
        json: { message: "Too many messages" },
      }),
    );
    await view.page
      .getByRole("textbox", { name: "Message", exact: true })
      .fill("Keep rejected message");
    await view.page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      view.page.getByText("Too many messages", { exact: true }),
    ).toBeVisible();
    await view.page.clock.runFor(89000);
    expect(view.counts["/api/messages/history"]).toBe(1);
    expect(view.counts["/api/messages/contacts"]).toBe(1);
    expect(view.counts["/api/messages/send"]).toBe(1);
    await view.page.clock.runFor(1500);
    await expect.poll(() => view.counts["/api/messages/history"]).toBe(2);
    await view.page.evaluate(() => window.dispatchEvent(new Event("online")));
    expect(view.counts["/api/messages/send"]).toBe(1);
    await expect(
      view.page.getByRole("textbox", { name: "Message", exact: true }),
    ).toHaveValue("Keep rejected message");
    const draft = await view.page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem("ames_draft_2_message_1_1") || "null",
        ) as { is_pending_sync: boolean },
    );
    expect(draft.is_pending_sync).toBe(false);
  } finally {
    await view.context.close();
  }
});

test("disconnected fallback waits thirty seconds, pauses hidden/offline, and backs off failures", async ({
  browser,
  request,
}, testInfo) => {
  const view = await portal(
    browser,
    await session(request, "adviser"),
    "teacher",
    testInfo.project.name === "mobile",
    true,
  );
  try {
    const recovery = await view.page.evaluateHandle(async () => {
      const modulePath = "/src/services/messaging.ts";
      const { MessagingClient } = (await import(modulePath)) as
        typeof import("../src/services/messaging");
      let client: { recovery: Promise<unknown> | null } | undefined;
      const original = MessagingClient.prototype.request;
      MessagingClient.prototype.request = function <T>(
        ...args: Parameters<typeof original>
      ): Promise<T> {
        MessagingClient.prototype.request = original;
        client = this as unknown as typeof client;
        return original.apply(this, args) as Promise<T>;
      };
      return {
        wait: async () => {
          if (!client) throw new Error("Expected a messaging recovery request");
          // The next fallback is scheduled by this promise's finally handler.
          await client.recovery;
        },
      };
    });
    await view.page.clock.runFor(28000);
    expect(view.counts["/api/messages/history"]).toBe(1);
    await view.page.clock.runFor(2500);
    await expect.poll(() => view.counts["/api/messages/history"]).toBe(2);
    await recovery.evaluate((state) => state.wait());
    await visibility(view.page, "hidden");
    await view.page.clock.runFor(120000);
    expect(view.counts["/api/messages/history"]).toBe(2);
    await visibility(view.page, "visible");
    await view.page.clock.runFor(29000);
    expect(view.counts["/api/messages/history"]).toBe(2);
    await view.page.route("**/api/messages/history?**", (route) =>
      route.fulfill({ status: 503, json: { message: "Unavailable" } }),
    );
    await view.page.clock.runFor(1100);
    await expect.poll(() => view.counts["/api/messages/history"]).toBe(3);
    await recovery.evaluate((state) => state.wait());
    await view.page.clock.runFor(59000);
    expect(view.counts["/api/messages/history"]).toBe(3);
    await view.page.clock.runFor(1100);
    await expect.poll(() => view.counts["/api/messages/history"]).toBe(4);
    await recovery.evaluate((state) => state.wait());
    await view.page.clock.runFor(119000);
    expect(view.counts["/api/messages/history"]).toBe(4);
    await view.page.clock.runFor(1100);
    await expect.poll(() => view.counts["/api/messages/history"]).toBe(5);
    await recovery.evaluate((state) => state.wait());
    await view.page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", {
        configurable: true,
        get: () => false,
      });
      window.dispatchEvent(new Event("offline"));
    });
    await view.page.clock.runFor(180000);
    expect(view.counts["/api/messages/history"]).toBe(5);
  } finally {
    await view.context.close();
  }
});

test("an older send confirmation cannot erase a newer thread draft", async ({
  browser,
  request,
}, testInfo) => {
  let release = () => {};
  let saved = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const committed = new Promise<void>((resolve) => {
    saved = resolve;
  });
  const mobile = testInfo.project.name === "mobile";
  const view = await portal(
    browser,
    await session(request, "adviser"),
    "teacher",
    mobile,
    false,
    async (page) => {
      await page.route("**/api/messages/contacts", async (route) => {
        const response = await route.fetch();
        const data = (await response.json()) as {
          myId: number;
          contacts: { id: number; name: string }[];
        };
        await route.fulfill({
          json: {
            ...data,
            contacts: [...data.contacts, { id: 2, name: "Other Parent" }],
          },
        });
      });
      await page.route("**/api/messages/history?**parent_id=2", (route) =>
        route.fulfill({ json: [] }),
      );
      await page.route("**/api/messages/send", async (route) => {
        const response = await route.fetch();
        saved();
        await held;
        await route.fulfill({ response });
      });
    },
  );
  try {
    const input = view.page.getByRole("textbox", {
      name: "Message",
      exact: true,
    });
    await input.fill("Older submitted draft");
    await view.page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await committed;
    if (mobile)
      await view.page
        .getByRole("button", { name: "Back to contacts list" })
        .click();
    await view.page.getByRole("button", { name: /Other Parent/ }).click();
    if (mobile)
      await view.page
        .getByRole("button", { name: "Back to contacts list" })
        .click();
    await view.page.getByRole("button", { name: /Test Parent/ }).click();
    await input.fill("Newer unsent draft");
    const confirmed = view.page.waitForResponse("**/api/messages/send");
    release();
    await confirmed;
    await expect(input).toHaveValue("Newer unsent draft");
    expect(
      await view.page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("ames_draft_2_message_1_1") || "null")
            ?.values.body,
      ),
    ).toBe("Newer unsent draft");
  } finally {
    release();
    await view.context.close();
  }
});

test("offline message drafts require explicit submission, including after a rate limit", async ({
  browser,
  request,
}, testInfo) => {
  const view = await portal(
    browser,
    await session(request, "adviser"),
    "teacher",
    testInfo.project.name === "mobile",
    true,
  );
  const key = "ames_draft_2_message_1_1";
  try {
    await view.page.route("**/api/messages/send", (route) =>
      route.abort("internetdisconnected"),
    );
    await view.page
      .getByRole("textbox", { name: "Message", exact: true })
      .fill("Rejected queued message");
    await view.page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect
      .poll(() =>
        view.page.evaluate(
          (draftKey) =>
            JSON.parse(localStorage.getItem(draftKey) || "null")
              ?.is_pending_sync,
          key,
        ),
      )
      .toBe(true);
    await view.page.unroute("**/api/messages/send");
    await view.page.route("**/api/messages/send", (route) =>
      route.fulfill({
        status: 429,
        headers: {
          "Retry-After": "90",
          "Access-Control-Expose-Headers": "Retry-After",
        },
        json: { message: "Queued send rate limited" },
      }),
    );
    await view.page.evaluate(() => window.dispatchEvent(new Event("online")));
    expect(view.counts["/api/messages/send"]).toBe(1);
    await view.page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect
      .poll(() =>
        view.page.evaluate(
          (draftKey) =>
            JSON.parse(localStorage.getItem(draftKey) || "null")
              ?.is_pending_sync,
          key,
        ),
      )
      .toBe(false);
    await expect(
      view.page.getByText("Queued send rate limited", { exact: true }),
    ).toBeVisible();
    await view.page.evaluate(() => {
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("online"));
    });
    await view.page.clock.runFor(89000);
    expect(view.counts["/api/messages/send"]).toBe(2);
    expect(view.counts["/api/messages/history"]).toBe(1);
    await expect(
      view.page.getByRole("textbox", { name: "Message", exact: true }),
    ).toHaveValue("Rejected queued message");
  } finally {
    await view.context.close();
  }
});

test("a rejected socket handshake respects Retry-After before hydration and reconnect", async ({
  browser,
  request,
}, testInfo) => {
  const account = await session(request, "adviser");
  const context = await browser.newContext({
    viewport:
      testInfo.project.name === "mobile"
        ? { width: 375, height: 812 }
        : { width: 1280, height: 900 },
  });
  await context.addInitScript((data) => {
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("token", data.token);
  }, account);
  const page = await context.newPage();
  let handshakes = 0;
  let reads = 0;
  await page.clock.install();
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/messages/")) reads++;
  });
  await page.route("**/socket.io/**", (route) => {
    if (!new URL(route.request().url()).searchParams.has("sid")) {
      handshakes++;
      if (handshakes === 1)
        return route.fulfill({
          status: 429,
          headers: {
            "Retry-After": "90",
            "Access-Control-Expose-Headers": "Retry-After",
          },
          json: { message: "Connection limit", retryAfter: 90 },
        });
    }
    return route.continue();
  });
  try {
    await page.goto("/teacher/messages");
    await expect.poll(() => handshakes).toBe(1);
    // Let the asynchronous XHR error reach Socket.IO before advancing timers.
    await page.waitForTimeout(100);
    await page.clock.runFor(88000);
    expect(handshakes).toBe(1);
    expect(reads).toBe(0);
    await page.clock.runFor(2500);
    await page.clock.resume();
    await expect.poll(() => handshakes).toBe(2);
    await expect(
      page.getByRole("button", { name: /Test Parent/ }),
    ).toBeVisible();
    await expect
      .poll(() => reads)
      .toBe(testInfo.project.name === "mobile" ? 2 : 3);
  } finally {
    await context.close();
  }
});

test("account changes replace the connection, isolate drafts, and logout closes chat", async ({
  browser,
  request,
}, testInfo) => {
  const parentAccount = await session(request, "parent");
  const mobile = testInfo.project.name === "mobile";
  const view = await portal(
    browser,
    await session(request, "adviser"),
    "teacher",
    mobile,
  );
  try {
    await view.page
      .getByRole("textbox", { name: "Message", exact: true })
      .fill("Teacher-owned draft");
    await view.page.evaluate((account) => {
      localStorage.setItem("token", account.token);
      localStorage.setItem("user", JSON.stringify(account.user));
      window.dispatchEvent(new StorageEvent("storage", { key: "token" }));
    }, parentAccount);
    await expect(view.page).toHaveURL(/\/parent\/dashboard/);
    await view.page.evaluate(() => {
      window.history.pushState({}, "", "/parent/messages");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(
      view.page.getByRole("button", { name: /Teacher Test Adviser/ }),
    ).toBeVisible();
    if (mobile)
      await view.page
        .getByRole("button", { name: /Teacher Test Adviser/ })
        .click();
    await expect(
      view.page.getByRole("textbox", { name: "Message", exact: true }),
    ).toHaveValue("");
    await expect.poll(() => view.sockets.size).toBe(1);
    expect(
      await view.page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("ames_draft_2_message_1_1") || "null")
            ?.values.body,
      ),
    ).toBe("Teacher-owned draft");
    // Equivalent to another authenticated tab logging out; no page reload.
    await view.page.evaluate(() => {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.dispatchEvent(new StorageEvent("storage", { key: "token" }));
    });
    await expect(view.page).toHaveURL(/\/login/);
    await expect.poll(() => view.sockets.size).toBe(0);
    expect(
      await view.page.evaluate(() =>
        localStorage.getItem("ames_draft_2_message_1_1"),
      ),
    ).not.toBeNull();
  } finally {
    await view.context.close();
  }
});
