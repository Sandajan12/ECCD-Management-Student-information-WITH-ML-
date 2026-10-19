import { expect, test } from "@playwright/test";
import type { SessionResponse } from "../src/types";

const backend = "http://127.0.0.1:8769";
interface AssessmentDomain {
  domain_id: number;
  questions: { question_id: number }[];
}

test.beforeEach(async ({ page, request }, info) => {
  await page.setViewportSize({
    width: info.project.name === "mobile" ? 320 : 1280,
    height: 900,
  });
  expect((await request.post(`${backend}/__test/reset`)).ok()).toBeTruthy();
  const response = await request.post(`${backend}/api/auth/login`, {
    data: { username: "adviser", password: "Example123" },
  });
  expect(response.status()).toBe(200);
  const session = (await response.json()) as SessionResponse;
  await page.goto("/login");
  await page.evaluate((value) => {
    localStorage.setItem("user", JSON.stringify(value.user));
    localStorage.setItem("token", value.token);
  }, session);
});

test("completed student PRE runs the actual forest, shows support activities and fits the viewport", async ({
  page,
  request,
}, info) => {
  const token = await page.evaluate(() => localStorage.getItem("token"));
  const headers = { Authorization: `Bearer ${token}` };
  const assessmentResponse = await request.get(
    `${backend}/api/eccd/assessment/1`,
    { headers },
  );
  expect(assessmentResponse.ok()).toBeTruthy();
  const assessment = (await assessmentResponse.json()) as {
    domains: AssessmentDomain[];
  };
  const answers = Object.fromEntries(
    assessment.domains.flatMap((domain) =>
      domain.questions.map((question) => [
        String(question.question_id),
        domain.domain_id === 1 ? 0 : 1,
      ]),
    ),
  );
  const save = await request.post(`${backend}/api/eccd/evaluate`, {
    headers,
    data: {
      student_id: 1,
      period: "PRE",
      evaluation_date: "2026-08-10",
      answers,
    },
  });
  expect(save.status(), await save.text()).toBe(200);
  await page.goto("/teacher/ml-insights");
  await expect(
    page.getByRole("heading", {
      name: "Early Performance Analytics & ML Insights",
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Research prototype notice")).toContainText(
    "not a formal clinical diagnosis",
  );
  const selector = page.getByRole("combobox", {
    name: "Learner in your active section",
  });
  await expect(selector).toBeEnabled();
  await selector.selectOption("1");
  await expect(page.getByText("PRE complete ·")).toBeVisible();
  const response = page.waitForResponse(
    (value) =>
      value.url().endsWith("/api/ml/predict/student/1") &&
      value.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Run Prediction" }).click();
  expect((await response).status()).toBe(200);
  const prediction = page.getByLabel("Student prediction", { exact: true });
  await expect(
    prediction.getByRole("heading", { name: "Baseline profile" }),
  ).toBeVisible();
  await expect(prediction.getByRole("img")).toHaveAttribute(
    "aria-label",
    /Average:.*Slight Delay:.*Significant Delay:/,
  );
  await prediction
    .locator("summary")
    .filter({ hasText: "Gross Motor" })
    .click();
  await expect(
    prediction.getByRole("heading", { name: "In the classroom" }).first(),
  ).toBeVisible();
  await expect(
    prediction.getByText(/Observed DI-KAYA items/).first(),
  ).toContainText("1, 2, 3");
  for (const width of info.project.name === "mobile" ? [320, 768] : [1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.screenshot({
    path: test.info().outputPath("student-insights.png"),
    fullPage: true,
  });
});

test("incomplete PRE is gated and sandbox inputs survive offline reload and retry on reconnect", async ({
  page,
  context,
}) => {
  await page.goto("/teacher/ml-insights");
  const selector = page.getByRole("combobox", {
    name: "Learner in your active section",
  });
  await expect(selector).toBeEnabled();
  await selector.selectOption("1");
  await expect(
    page.getByRole("button", { name: "Run Prediction" }),
  ).toBeDisabled();
  await page.getByRole("tab", { name: "Sandbox Simulator" }).click();
  await expect(
    page.getByLabel("Sandbox prediction", { exact: true }),
  ).toBeVisible();
  const motor = page.getByRole("spinbutton", {
    name: "Gross Motor scaled score",
    exact: true,
  });
  expect((await motor.boundingBox())!.width).toBeGreaterThan(180);
  await motor.fill("2");
  await expect(
    page
      .getByLabel("Sandbox prediction", { exact: true })
      .getByText("Gross Motor", { exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("spinbutton", {
      name: "PRE total scaled (calculated)",
      exact: true,
    }),
  ).toHaveValue("44");
  await context.setOffline(true);
  await motor.fill("3");
  await expect(
    page.getByRole("alert").filter({ hasText: "offline" }),
  ).toBeVisible();
  const stored = await page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem("ames_draft_2_ml_sandbox_v1") || "null",
      ) as { is_pending_sync: boolean; values: { gm_pre_scaled: string } },
  );
  expect(stored.values.gm_pre_scaled).toBe("3");
  expect(stored.is_pending_sync).toBe(true);
  await context.setOffline(false);
  await expect(
    page.getByLabel("Sandbox prediction", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Sandbox Simulator" }).click();
  await expect(motor).toHaveValue("3");
  await expect(
    page.getByLabel("Sandbox prediction", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: test.info().outputPath("sandbox-insights.png"),
    fullPage: true,
  });
});
