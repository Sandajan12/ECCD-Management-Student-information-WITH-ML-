import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import type { SessionResponse } from "../src/types";

const backend = "http://127.0.0.1:8775";

async function credentials(page: Page, name = "adviser") {
  await page.getByLabel("Email", { exact: true }).fill(`${name}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("Example123");
  await page.getByRole("checkbox", { name: /I have read and agree/ }).check();
}

async function logout(page: Page) {
  const menu = page.getByRole("button", { name: "Open navigation" });
  if ((page.viewportSize()?.width ?? 1280) < 900) {
    await expect(menu).toBeVisible();
    await menu.click();
  }
  await page
    .getByRole("button", { name: "Logout", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/login$/);
}

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${backend}/__test/reset`)).ok()).toBe(true);
});

test("real OTP login remembers this browser, skips OTP, then enforces expired trust", async ({
  page,
  request,
}) => {
  await request.post(`${backend}/__test/auth/mode`, {
    data: { enabled: true },
  });
  await page.goto("/login");
  await credentials(page);
  await page.getByRole("checkbox", { name: /Remember this device/ }).check();
  const challengeResponse = page.waitForResponse((res) =>
    res.url().endsWith("/api/auth/login"),
  );
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  const challenge = await challengeResponse;
  expect((await challenge.json()).requireOtp).toBe(true);
  expect(challenge.request().postDataJSON()).toMatchObject({
    rememberDevice: true,
    terms_accepted: true,
  });
  const { otp } = (await (
    await request.get(`${backend}/__test/auth/otp?email=adviser@example.com`)
  ).json()) as { otp: string };
  await page.getByLabel("Verification digit 1").fill(otp);
  const verifiedResponse = page.waitForResponse((res) =>
    res.url().endsWith("/api/auth/verify-otp"),
  );
  await page.getByRole("button", { name: "Verify & Log In" }).click();
  const verified = await verifiedResponse;
  expect(verified.status()).toBe(200);
  expect(verified.request().postDataJSON()).toMatchObject({
    terms_accepted: true,
  });
  await expect(page).toHaveURL(/\/teacher\/dashboard$/);
  const remembered = await page.evaluate(() =>
    localStorage.getItem("ames_device_token"),
  );
  expect(remembered).toBeTruthy();
  const cookies = await page.context().cookies(backend);
  expect(
    cookies
      .filter((cookie) => cookie.name.endsWith("device_token"))
      .every((cookie) => cookie.httpOnly),
  ).toBe(true);
  await logout(page);
  await credentials(page);
  const skipResponse = page.waitForResponse((res) =>
    res.url().endsWith("/api/auth/login"),
  );
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  const skip = await skipResponse;
  expect((await skip.json()).requireOtp).toBe(false);
  expect(skip.request().postDataJSON()).toMatchObject({
    deviceToken: remembered,
  });
  await expect(page).toHaveURL(/\/teacher\/dashboard$/);
  await logout(page);
  await request.post(`${backend}/__test/auth/mode`, {
    data: { enabled: true, expire_devices: true },
  });
  await credentials(page);
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await expect(page.getByLabel("Verification digit 1")).toBeVisible();
});

test("real OTP registration sends consent and activates a parent", async ({
  page,
  request,
}) => {
  await request.post(`${backend}/__test/auth/mode`, {
    data: { enabled: true },
  });
  await page.goto("/register-parent");
  await page.getByLabel("First name", { exact: true }).fill("Synthetic");
  await page.getByLabel("Last name", { exact: true }).fill("Parent");
  await page
    .getByLabel("Email", { exact: true })
    .fill("browser-parent@example.com");
  await page.getByLabel("Password", { exact: true }).fill("Example123");
  await page.getByLabel("Confirm password", { exact: true }).fill("Example123");
  await page.getByRole("checkbox", { name: /I have read and agree/ }).check();
  await page.getByRole("button", { name: "Sign Up", exact: true }).click();
  await expect(page.getByLabel("Verification digit 1")).toBeVisible();
  const { otp } = (await (
    await request.get(
      `${backend}/__test/auth/otp?email=browser-parent@example.com`,
    )
  ).json()) as { otp: string };
  await page.getByLabel("Verification digit 1").fill(otp);
  await page.getByRole("button", { name: "Verify & Activate Account" }).click();
  await expect(page).toHaveURL(/\/parent\/dashboard$/);
});

test("Axios timeout and actual interceptor isolate bearer destinations", async ({
  page,
}) => {
  await page.goto("/login");
  const result = await page.evaluate(async () => {
    const modulePath = "/src/services/api.ts";
    const { default: api } = (await import(modulePath)) as {
      default: AxiosInstance;
    };
    localStorage.setItem("token", "synthetic-bearer");
    const adapter = async (config: InternalAxiosRequestConfig) => ({
      status: 200,
      statusText: "OK",
      headers: {},
      config,
      data: config.headers.get("Authorization") || null,
    });
    const checks = [];
    for (const [url, baseURL] of [
      ["/api/probe", undefined],
      ["api/probe", undefined],
      ["http://127.0.0.1:8775/api/probe", undefined],
      ["https://outside.example/api/probe", undefined],
      ["//outside.example/api/probe", undefined],
      ["/api/probe", "https://outside.example"],
      ["https://127.0.0.1:8775/api/probe", undefined],
      ["http://127.0.0.1:8775@outside.example/api/probe", undefined],
    ]) {
      const response = await api.get<string | null>(url!, {
        adapter,
        ...(baseURL ? { baseURL } : {}),
        headers: { Authorization: "Bearer inherited" },
      });
      checks.push(response.data);
    }
    localStorage.removeItem("token");
    return { timeout: api.defaults.timeout, checks };
  });
  expect(result.timeout).toBe(60000);
  expect(result.checks).toEqual([
    "Bearer synthetic-bearer",
    "Bearer synthetic-bearer",
    "Bearer synthetic-bearer",
    null,
    null,
    null,
    null,
    null,
  ]);
});

test("queue retains non-ECCD drafts and replays only confirmed teacher ECCD work", async ({
  page,
  request,
}) => {
  const login = await request.post(`${backend}/api/auth/login`, {
    data: { email: "adviser@example.com", password: "Example123" },
  });
  expect(login.status()).toBe(200);
  const session = (await login.json()) as SessionResponse;
  expect(session.user.role).toBe("admin");
  await page.goto("/login");
  const result = await page.evaluate(async (account) => {
    const apiPath = "/src/services/api.ts";
    const draftsPath = "/src/utils/drafts.ts";
    const { default: api } = (await import(apiPath)) as {
      default: AxiosInstance;
    };
    const { isDraftRequest, syncDrafts } = (await import(draftsPath)) as
      typeof import("../src/utils/drafts");
    const owner = account.user.id;
    localStorage.setItem("token", account.token);
    localStorage.setItem("user", JSON.stringify(account.user));
    const attempted: string[] = [];
    let status = 202;
    api.defaults.adapter = async (config) => {
      attempted.push(`${config.method}:${config.url}`);
      return {
        status,
        statusText: "OK",
        headers: {},
        config,
        data: {},
      };
    };
    const requests = [
      { path: "https://outside.example/api/save", method: "post" },
      { path: "//outside.example/api/save", method: "put" },
      { path: "/\\outside.example/api/save", method: "post" },
      { path: "/api/../outside", method: "post" },
      { path: "/api/%2e%2e/outside", method: "post" },
      { path: "/api/save\n", method: "post" },
      { path: "/api/save", method: "get" },
      { path: "/api/save", method: "OPTIONS" },
      { path: "/api/save", method: 123 },
      { path: "/api/save", method: "post" },
      { path: "/api/update", method: "PUT" },
      { path: "/api/patch", method: "PATCH" },
      { path: "/api/delete", method: "DELETE" },
      { path: "/api/unconfirmed", method: "post" },
    ];
    requests.forEach((request, index) =>
      localStorage.setItem(
        `ames_draft_${owner}_security_${index}`,
        JSON.stringify({
          owner_id: owner,
          revision: String(index),
          values: { text: "keep input" },
          is_pending_sync: true,
          request: { ...request, data: {} },
        }),
      ),
    );
    localStorage.setItem(
      "ames_draft_88_other",
      JSON.stringify({
        owner_id: 88,
        revision: "other",
        values: { text: "other input" },
        is_pending_sync: true,
        request: { path: "/api/other", method: "post", data: {} },
      }),
    );
    await syncDrafts(owner);
    const nonEccdAttempts = [...attempted];
    const teacherKey = `eccd_draft_1_PRE_1_${owner}`;
    localStorage.setItem(
      teacherKey,
      JSON.stringify({
        owner_id: owner,
        revision: "teacher-revision",
        values: { answers: { 11: "KAYA" } },
        is_pending_sync: true,
        request: {
          path: "/api/eccd/evaluate",
          method: "post",
          data: {
            student_id: 1,
            testing_period: "PRE",
            assessment_date: "2026-11-05",
            evaluations: [
              { question_id: 11, testing_period: "PRE", answer: "KAYA" },
            ],
            edited_question_ids: [],
          },
        },
      }),
    );
    const teacherRetained: boolean[] = [];
    for (const responseStatus of [202, 204, 200]) {
      status = responseStatus;
      await syncDrafts(owner);
      teacherRetained.push(localStorage.getItem(teacherKey) !== null);
    }
    const retained = requests.map(
      (_, index) =>
        JSON.parse(
          localStorage.getItem(`ames_draft_${owner}_security_${index}`) || "null",
        ) as { values: { text: string }; is_pending_sync: boolean } | null,
    );
    return {
      nonEccdAttempts,
      validRequests: requests.map(isDraftRequest),
      attempted,
      retained,
      teacherRetained,
      other: localStorage.getItem("ames_draft_88_other"),
    };
  }, session);
  expect(result.nonEccdAttempts).toEqual([]);
  expect(result.validRequests).toEqual([
    ...Array<boolean>(9).fill(false),
    ...Array<boolean>(5).fill(true),
  ]);
  expect(result.attempted).toEqual([
    "post:/api/eccd/evaluate",
    "post:/api/eccd/evaluate",
    "post:/api/eccd/evaluate",
  ]);
  expect(
    result.retained.every(
      (draft) => draft?.values.text === "keep input" && draft.is_pending_sync,
    ),
  ).toBe(true);
  expect(result.teacherRetained).toEqual([true, true, false]);
  expect(result.other).toContain("other input");
});
