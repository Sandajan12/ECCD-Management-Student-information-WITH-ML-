import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import type { SessionResponse } from "../src/types";

const backend = "http://127.0.0.1:8771";
let teacher: SessionResponse;
let parent: SessionResponse;
const headers = () => ({ Authorization: `Bearer ${teacher.token}` });

async function login(page: Page, session: SessionResponse, url: string) {
  await page.goto("/login");
  await page.evaluate(value => {
    localStorage.setItem("user", JSON.stringify(value.user));
    localStorage.setItem("token", value.token);
  }, session);
  await page.goto(url);
}
async function permissions(request: APIRequestContext, changes: Record<string, boolean>) {
  const response = await request.put(`${backend}/api/teachers/me/access`, { headers: headers(), data: changes });
  expect(response.status(), await response.text()).toBe(200);
}
async function completePre(request: APIRequestContext) {
  const response = await request.get(`${backend}/api/eccd/assessment/1`, { headers: headers(), maxRetries: 2 });
  const assessment = await response.json() as { domains: { domain_id: number; questions: { question_id: number }[] }[] };
  const answers = Object.fromEntries(assessment.domains.flatMap(domain => domain.questions.map(question => [question.question_id, domain.domain_id === 1 ? 0 : 1])));
  const save = await request.post(`${backend}/api/eccd/evaluate`, { headers: headers(), data: { student_id: 1, period: "PRE", evaluation_date: "2026-08-10", answers } });
  expect(save.status(), await save.text()).toBe(200);
}
test.beforeEach(async ({ page, request }, info) => {
  await page.setViewportSize({ width: info.project.name === "mobile" ? 320 : 1280, height: 900 });
  expect((await request.post(`${backend}/__test/reset`)).ok()).toBeTruthy();
  teacher = await (await request.post(`${backend}/api/auth/login`, { data: { email: "adviser@example.com", password: "Example123" } })).json() as SessionResponse;
  parent = await (await request.post(`${backend}/api/auth/login`, { data: { email: "parent@example.com", password: "Example123" } })).json() as SessionResponse;
});

test("teacher switch persists, enables real parent prediction, and revocation hides results", async ({ page, context, request }) => {
  await login(page, teacher, "/teacher/settings");
  const toggle = page.getByRole("switch", { name: "Student Prediction", exact: true });
  await expect(toggle).toBeEnabled();
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(page.getByText("Parent access settings saved successfully!", { exact: true })).toBeVisible();
  await page.reload();
  await expect(toggle).toBeChecked();
  await completePre(request);
  await permissions(request, { allow_parent_view_eccd_pre: true });
  // Each page uses its own context below: shared localStorage would sign the teacher out.
  const parentContext = await context.browser()!.newContext({ viewport: page.viewportSize()!, baseURL: "http://127.0.0.1:5183" });
  const childPage = await parentContext.newPage();
  try {
    await login(childPage, parent, "/parent/ml-insights");
    await expect(childPage.getByText("Ready for Prediction", { exact: true })).toBeVisible();
    await expect(childPage.getByRole("combobox", { name: "Select child" })).toHaveCount(0);
    await childPage.getByRole("button", { name: "Predict Post-Test Outcome" }).click();
    const results = childPage.getByLabel("Child prediction", { exact: true });
    await expect(results.getByRole("heading", { name: "Baseline Development Profile" })).toBeVisible();
    await expect(results.getByText("At home", { exact: true }).first()).toBeVisible();
    await expect(results.getByRole("img")).toHaveAttribute("aria-label", /Average:.*Slight Delay:.*Significant Delay:/);
    await expect(results.getByText("Social-Emotional", { exact: true })).toBeVisible();
    expect(await childPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await childPage.screenshot({ path: test.info().outputPath("parent-insights.png"), fullPage: true });
    await toggle.uncheck();
    await expect(page.getByText("Parent access settings saved successfully!", { exact: true })).toBeVisible();
    await childPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(childPage.getByText(/Adviser Access Restricted: Post-test/)).toBeVisible();
    await expect(results).toHaveCount(0);
    await expect(childPage.getByRole("button", { name: "Predict Post-Test Outcome" })).toBeDisabled();
  } finally { await parentContext.close(); }
});

test("incomplete and unreleased PRE stay gated before ready prompt and model errors", async ({ page, request }) => {
  await permissions(request, { allow_parent_predictions: true });
  await login(page, parent, "/parent/ml-insights");
  await expect(page.getByText("Not Ready · PRE Incomplete", { exact: true })).toBeVisible();
  await expect(page.getByText(/The baseline PRE assessment for Test Middle Student/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Predict Post-Test Outcome" })).toBeDisabled();
  await completePre(request);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Results Pending Adviser Release", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Predict Post-Test Outcome" })).toBeDisabled();
  await permissions(request, { allow_parent_view_eccd_pre: true });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText(/baseline assessment is complete. Click/)).toBeVisible();
  await page.route("**/api/ml/parent/predict/1", route => route.fulfill({ status: 503, json: { detail: "The research model is unavailable. Please contact the administrator." } }));
  await page.getByRole("button", { name: "Predict Post-Test Outcome" }).click();
  await expect(page.getByText("The research model is unavailable. Please contact the administrator.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Predict Post-Test Outcome" })).toBeEnabled();
});

test("multiple synced children can switch while a prediction is in flight", async ({ page, request }) => {
  await completePre(request);
  await permissions(request, { allow_parent_predictions: true, allow_parent_view_eccd_pre: true });
  await page.route("**/api/students/my-child", async route => {
    const response = await route.fetch();
    const rows = await response.json() as { student_id: number; first_name: string; last_name: string; middle_name: string }[];
    await route.fulfill({ json: [...rows, { ...rows[0], student_id: 3, first_name: "Sibling", middle_name: "", last_name: "Child" }] });
  });
  await page.route("**/api/ml/parent/readiness/3", route => route.fulfill({ json: { student_id: 3, student_name: "Sibling Child", pre_complete: false, allow_parent_predictions: true, is_published: true, readiness_note: "PRE incomplete" } }));
  let release: (() => void) | undefined;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/ml/parent/predict/1", async route => {
    const response = await route.fetch();
    await pending;
    await route.fulfill({ response }).catch(() => {});
  });
  await login(page, parent, "/parent/ml-insights");
  await expect(page.getByRole("button", { name: "Predict Post-Test Outcome" })).toBeEnabled();
  const sent = page.waitForRequest("**/api/ml/parent/predict/1");
  await page.getByRole("button", { name: "Predict Post-Test Outcome" }).click();
  await sent;
  await expect(page.getByRole("button", { name: "Predicting..." })).toBeDisabled();
  await page.getByRole("combobox", { name: "Select child" }).click();
  await page.getByRole("option", { name: "Sibling Child" }).click();
  release!();
  await expect(page.getByText(/baseline PRE assessment for Sibling Child/)).toBeVisible();
  await expect(page.getByLabel("Child prediction", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/baseline PRE assessment for Sibling Child/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test("teacher prediction preference survives offline reload and syncs on reconnect", async ({ page, context }) => {
  await login(page, teacher, "/teacher/settings");
  const toggle = page.getByRole("switch", { name: "Student Prediction", exact: true });
  await expect(toggle).toBeEnabled();
  // Simulate the browser's offline signal while keeping Vite available for reload.
  await page.evaluate(() => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false }));
  await context.route("**/api/teachers/me/access", route => route.request().method() === "PUT" ? route.abort("internetdisconnected") : route.continue());
  await toggle.check();
  await expect(page.getByText(/Saved locally on device/).first()).toBeVisible();
  await page.reload();
  await expect(toggle).toBeChecked();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ames_draft_2_teacher_access") || "null")?.is_pending_sync)).toBe(true);
  await context.unroute("**/api/teachers/me/access");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("ames_draft_2_teacher_access"))).toBeNull();
  await page.reload();
  await expect(toggle).toBeChecked();
});
