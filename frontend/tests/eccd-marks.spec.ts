import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { PERIODS, type Assessment, type SessionResponse } from "../src/types";

const backend = "http://127.0.0.1:8769";
const accessPath = "/api/teachers/me/access";
const marksTitle = "Viewing of ECCD Marks";

async function login(
  request: APIRequestContext,
  username: string,
): Promise<SessionResponse> {
  const response = await request.post(`${backend}/api/auth/login`, {
    data: { username, password: "Example123" },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as SessionResponse;
}
async function session(page: Page, value: SessionResponse, path: string) {
  await page.goto("/login");
  await page.evaluate((data) => {
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("token", data.token);
  }, value);
  await page.goto(path);
}
test.beforeEach(async ({ page, request }, info) => {
  await page.setViewportSize({
    width: info.project.name === "mobile" ? 320 : 1280,
    height: 900,
  });
  expect((await request.post(`${backend}/__test/reset`)).ok()).toBeTruthy();
});

test("marks toggle persists across all seven domains independently of scores and editing", async ({
  page,
  request,
}) => {
  const teacher = await login(request, "adviser");
  const parent = await login(request, "parent");
  const headers = { Authorization: `Bearer ${teacher.token}` };
  const parentHeaders = { Authorization: `Bearer ${parent.token}` };
  const assessment = (await (
    await request.get(`${backend}/api/eccd/assessment/1`, { headers })
  ).json()) as Assessment;
  expect(assessment.domains).toHaveLength(7);
  for (const [index, period] of PERIODS.entries()) {
    const response = await request.post(`${backend}/api/eccd/evaluate`, {
      headers,
      data: {
        student_id: 1,
        testing_period: period,
        assessment_date: `2026-${String(8 + index).padStart(2, "0")}-10`,
        evaluations: assessment.domains.flatMap((d) =>
          d.questions.map((q) => ({
            question_id: q.question_id,
            testing_period: period,
            answer: q.question_id % 2 ? "KAYA" : "DI-KAYA",
          })),
        ),
      },
    });
    expect(response.status(), await response.text()).toBe(200);
  }
  await session(page, teacher, "/teacher/settings");
  const toggle = page.getByRole("switch", { name: marksTitle, exact: true });
  await expect(toggle).toBeEnabled();
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(toggle).toBeEnabled();
  await page.reload();
  await expect(toggle).toBeChecked();
  for (const period of ["Pre", "Mid", "Post"]) {
    await expect(
      page.getByRole("switch", {
        name: `${period}-Test Scores Visibility`,
        exact: true,
      }),
    ).not.toBeChecked();
  }
  await session(page, parent, "/parent/eccdassessment");
  await expect(
    page.getByText("Results Pending Adviser Release").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: /Home-Based Checklist/ }).click();
  const periods = page.getByRole("combobox", { name: "Testing period" });
  await expect(periods.locator("option")).toHaveText([
    "Pre-Test",
    "Mid-Test",
    "Post-Test",
  ]);
  await expect(
    page.getByRole("button", { name: "Save Assessment", exact: true }),
  ).toBeDisabled();
  for (const domain of assessment.domains) {
    await page
      .getByRole("button", {
        name: `${domain.questions.some((q) => q.is_home_based) ? "Assess" : "View"} ${domain.domain_name}`,
        exact: true,
      })
      .click();
    for (const period of PERIODS) {
      await periods.selectOption(period);
      for (const question of domain.questions.filter((q) => !q.is_home_based)) {
        const row = page.getByRole("group", {
          name: question.question_text,
          exact: true,
        });
        await expect(
          row.getByText("Teacher Assessed — View Only", { exact: true }),
        ).toBeVisible();
        await expect(
          row.getByText(question.question_id % 2 ? "KAYA" : "DI-KAYA", {
            exact: true,
          }),
        ).toBeVisible();
        await expect(row.getByRole("button")).toHaveCount(0);
      }
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Back to Domains", exact: true })
      .click();
  }
  await session(page, teacher, "/teacher/settings");
  await expect(toggle).toBeEnabled();
  await toggle.uncheck();
  await expect(toggle).toBeEnabled();
  await page.reload();
  await expect(toggle).not.toBeChecked();
  expect(
    (
      await request.put(`${backend}${accessPath}`, {
        headers,
        data: {
          allow_parent_view_eccd_pre: true,
          allow_parent_edit_home_based_eccd: true,
        },
      })
    ).status(),
  ).toBe(200);
  const home = assessment.domains
    .flatMap((d) => d.questions)
    .find((q) => q.is_home_based)!;
  expect(
    (
      await request.post(`${backend}/api/eccd/parent/evaluate`, {
        headers: parentHeaders,
        data: {
          student_id: 1,
          testing_period: "PRE",
          evaluations: [
            {
              question_id: home.question_id,
              testing_period: "PRE",
              answer: "KAYA",
            },
          ],
        },
      })
    ).status(),
  ).toBe(200);
  const data = (await (
    await request.get(`${backend}/api/eccd/parent/assessment/1`, {
      headers: parentHeaders,
    })
  ).json()) as Assessment;
  expect(data.allow_parent_view_eccd_marks).toBe(false);
  expect(data.summary?.PRE.standardScore).not.toBeNull();
  expect(data.summary?.MID.standardScore).toBeNull();
  for (const question of data.domains.flatMap((d) => d.questions)) {
    expect(question.answers.PRE).toBe(
      question.question_id === home.question_id ? "KAYA" : null,
    );
    expect(question.answers.MID).toBeNull();
    expect(question.answers.POST).toBeNull();
  }
  await session(page, parent, "/parent/eccdassessment");
  await page.getByRole("button", { name: /Home-Based Checklist/ }).click();
  for (const domain of assessment.domains) {
    await page
      .getByRole("button", {
        name: `${domain.questions.some((q) => q.is_home_based) ? "Assess" : "View"} ${domain.domain_name}`,
        exact: true,
      })
      .click();
    for (const question of domain.questions.filter((q) => !q.is_home_based)) {
      const row = page.getByRole("group", {
        name: question.question_text,
        exact: true,
      });
      await expect(
        row.getByText("Marks hidden by class adviser", { exact: true }),
      ).toBeVisible();
      await expect(row.getByText(/^(KAYA|DI-KAYA)$/)).toHaveCount(0);
    }
    await page
      .getByRole("button", { name: "Back to Domains", exact: true })
      .click();
  }
});

test("failed marks auto-save survives reload and syncs on reconnection", async ({
  page,
  request,
}) => {
  const teacher = await login(request, "adviser");
  const headers = { Authorization: `Bearer ${teacher.token}` };
  await session(page, teacher, "/teacher/settings");
  const toggle = page.getByRole("switch", { name: marksTitle, exact: true });
  await expect(toggle).toBeEnabled();
  await page.route(`**${accessPath}`, async (route) => {
    if (route.request().method() === "PUT")
      await route.abort("internetdisconnected");
    else await route.continue();
  });
  await toggle.check();
  await expect(toggle).toBeEnabled();
  await page.reload();
  await expect(toggle).toBeChecked();
  const key = `ames_draft_${teacher.user.id}_teacher_access`;
  const pending = await page.evaluate(
    (name) =>
      JSON.parse(localStorage.getItem(name) || "null") as {
        is_pending_sync: boolean;
        values: { allow_parent_view_eccd_marks: boolean };
      },
    key,
  );
  expect(pending.values.allow_parent_view_eccd_marks).toBe(true);
  expect(pending.is_pending_sync).toBe(true);
  expect(
    (await (await request.get(`${backend}${accessPath}`, { headers })).json())
      .allow_parent_view_eccd_marks,
  ).toBe(false);
  await page.unroute(`**${accessPath}`);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(`${backend}${accessPath}`, { headers })
          ).json()
        ).allow_parent_view_eccd_marks as boolean,
    )
    .toBe(true);
  await expect
    .poll(() => page.evaluate((name) => localStorage.getItem(name), key))
    .toBeNull();
  await page.reload();
  await expect(toggle).toBeChecked();
});
