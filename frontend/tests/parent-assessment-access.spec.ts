import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import type {
  Assessment,
  ParentAssessmentAccess,
  Period,
  SessionResponse,
  Student,
} from "../src/types";

const backend = "http://127.0.0.1:8769";
const path = "/api/teacher/settings/parent-assessment-access?section_id=1";
const flags: ParentAssessmentAccess = {
  pre_test_parent_editable: true,
  mid_test_parent_editable: false,
  post_test_parent_editable: false,
};
const periodControls = [
  {
    period: "PRE",
    field: "pre_test_parent_editable",
    label: "Pre-Test Home-Based Edit",
  },
  {
    period: "MID",
    field: "mid_test_parent_editable",
    label: "Mid-Test Home-Based Edit",
  },
  {
    period: "POST",
    field: "post_test_parent_editable",
    label: "Post-Test Home-Based Edit",
  },
] as const;

test.beforeEach(async ({ page }, info) => {
  await page.setViewportSize({
    width: info.project.name === "mobile" ? 320 : 1280,
    height: 900,
  });
});

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
async function session(page: Page, data: SessionResponse, url: string) {
  await page.goto("/login");
  await page.evaluate((value) => {
    localStorage.setItem("user", JSON.stringify(value.user));
    localStorage.setItem("token", value.token);
  }, data);
  await page.goto(url);
}
async function setup(request: APIRequestContext) {
  expect((await request.post(`${backend}/__test/reset`)).ok()).toBeTruthy();
  const teacher = await login(request, "adviser");
  const parent = await login(request, "parent");
  const headers = { Authorization: `Bearer ${teacher.token}` };
  expect(
    (
      await request.put(`${backend}/api/teachers/me/access`, {
        headers,
        data: { allow_parent_edit_home_based_eccd: true },
      })
    ).ok(),
  ).toBeTruthy();
  return { teacher, parent, headers };
}
async function openHomeDomain(page: Page) {
  await page
    .getByRole("button", { name: /^Assess / })
    .first()
    .click();
  return page
    .getByRole("region", { name: "Home-Based Questions", exact: true })
    .getByRole("group")
    .first();
}

test("teacher switches gate parent periods and real database saves", async ({
  page,
  request,
}) => {
  const { teacher, parent, headers } = await setup(request);
  await session(page, teacher, "/teacher/settings");
  const pre = page.getByRole("switch", { name: "Pre-Test Home-Based Edit" });
  const mid = page.getByRole("switch", { name: "Mid-Test Home-Based Edit" });
  const post = page.getByRole("switch", { name: "Post-Test Home-Based Edit" });
  await expect(pre).toBeEnabled();
  await expect(pre).toBeChecked();
  await expect(mid).not.toBeChecked();
  await expect(post).not.toBeChecked();
  await mid.click();
  await expect(
    page.getByText("Parent access settings saved successfully!"),
  ).toBeVisible();
  await expect(mid).toBeEnabled();
  await mid.click();
  await expect(mid).toBeEnabled();
  const settings = await request.get(`${backend}${path}`, { headers });
  expect(await settings.json()).toEqual({ section_id: 1, ...flags });
  await session(page, parent, "/parent/eccdassessment");
  await page.getByRole("button", { name: /Home-Based Checklist/ }).click();
  const periodSelector = page.getByRole("combobox", { name: "Testing period" });
  await expect(periodSelector.locator("option")).toHaveText(["Pre-Test"]);
  const row = await openHomeDomain(page);
  await expect(
    row.getByRole("button", { name: "KAYA", exact: true }).nth(0),
  ).toBeEnabled();
  await row.getByRole("button", { name: "KAYA", exact: true }).first().click();
  const response = page.waitForResponse(
    (value) =>
      value.url().endsWith("/api/eccd/parent/evaluate") &&
      value.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Save Assessment", exact: true })
    .first()
    .click();
  const saved = await response;
  expect(saved.status()).toBe(200);
  const payload = saved.request().postDataJSON() as {
    evaluations: { question_id: number; testing_period: string }[];
  };
  expect(
    payload.evaluations.every((answer) => answer.testing_period === "PRE"),
  ).toBeTruthy();
  for (const period of ["MID", "POST"]) {
    const blocked = await request.post(`${backend}/api/eccd/parent/evaluate`, {
      headers: { Authorization: `Bearer ${parent.token}` },
      data: {
        student_id: 1,
        evaluations: [
          {
            question_id: payload.evaluations[0].question_id,
            testing_period: period,
            answer: "KAYA",
          },
        ],
      },
    });
    expect(blocked.status()).toBe(403);
  }
  await page.screenshot({
    path: test.info().outputPath("parent-period-access.png"),
    fullPage: true,
  });
});

test("closed drafts survive reload and all-closed windows disable save", async ({
  page,
  request,
}) => {
  const { parent, headers } = await setup(request);
  await session(page, parent, "/parent/eccdassessment");
  await page.getByRole("button", { name: /Home-Based Checklist/ }).click();
  await (
    await openHomeDomain(page)
  )
    .getByRole("button", { name: "DI-KAYA", exact: true })
    .first()
    .click();
  const drafts = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) => key.startsWith("eccd_draft_")),
  );
  expect(drafts).toHaveLength(1);
  expect(
    (
      await request.put(`${backend}${path}`, {
        headers,
        data: { ...flags, pre_test_parent_editable: false },
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await page.getByRole("button", { name: /Home-Based Checklist/ }).click();
  const closedRow = await openHomeDomain(page);
  await expect(
    page.getByRole("combobox", { name: "Testing period" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Save Assessment", exact: true }).first(),
  ).toBeDisabled();
  await expect(
    closedRow.getByRole("button", { name: "DI-KAYA", exact: true }).first(),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) || "null") as unknown,
      drafts[0],
    ),
  ).toBeTruthy();
  expect(
    (await request.put(`${backend}${path}`, { headers, data: flags })).status(),
  ).toBe(200);
  await page.reload();
  await page.getByRole("button", { name: /Home-Based Checklist/ }).click();
  const reopenedRow = await openHomeDomain(page);
  await expect(
    reopenedRow.getByRole("button", { name: "DI-KAYA", exact: true }).first(),
  ).toHaveClass(/bg-rose-600/);
});

test("teacher window changes queue offline and sync on reconnection", async ({
  page,
  context,
  request,
}) => {
  const { teacher, headers } = await setup(request);
  await session(page, teacher, "/teacher/settings");
  const post = page.getByRole("switch", { name: "Post-Test Home-Based Edit" });
  await expect(post).toBeEnabled();
  await context.setOffline(true);
  await post.click();
  await expect(post).toBeChecked();
  await expect(post).toBeEnabled();
  const draftKey = `ames_draft_${teacher.user.id}_parent_assessment_access_1`;
  const draft = await page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key) || "null") as {
        is_pending_sync: boolean;
        values: ParentAssessmentAccess;
      } | null,
    draftKey,
  );
  expect(draft?.is_pending_sync).toBe(true);
  expect(draft?.values.post_test_parent_editable).toBe(true);
  await context.setOffline(false);
  await expect
    .poll(async () => {
      const response = await request.get(`${backend}${path}`, { headers });
      return ((await response.json()) as ParentAssessmentAccess)
        .post_test_parent_editable;
    })
    .toBe(true);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), draftKey))
    .toBeNull();
  await expect(post).toBeChecked();
});

test("each legacy home-based toggle independently gates only its parent period", async ({
  page,
  request,
}) => {
  const { teacher, parent, headers } = await setup(request);
  const parentHeaders = { Authorization: `Bearer ${parent.token}` };
  const assessment = await request.get(
    `${backend}/api/eccd/parent/assessment/1`,
    { headers: parentHeaders },
  );
  expect(assessment.status()).toBe(200);
  const home = ((await assessment.json()) as Assessment)
    .homeBasedChecklist?.[0];
  expect(home?.is_home_based).toBe(true);
  if (!home)
    throw new Error(
      "The disposable fixture must contain a home-based question.",
    );
  await session(page, teacher, "/teacher/settings");
  const setWindow = async (label: string, checked: boolean) => {
    const control = page.getByRole("switch", { name: label, exact: true });
    await expect(control).toBeEnabled();
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes(path) && response.request().method() === "PUT",
    );
    await control.setChecked(checked);
    expect((await saved).status()).toBe(200);
    await expect(control).toBeEnabled();
  };
  await setWindow(periodControls[0].label, false);
  for (const active of periodControls) {
    await setWindow(active.label, true);
    const windows = {
      ...flags,
      pre_test_parent_editable: false,
      [active.field]: true,
    };
    expect(
      await (await request.get(`${backend}${path}`, { headers })).json(),
    ).toEqual({ section_id: 1, ...windows });
    for (const control of periodControls) {
      const response = await request.post(
        `${backend}/api/eccd/parent/evaluate`,
        {
          headers: parentHeaders,
          data: {
            student_id: 1,
            evaluations: [
              {
                question_id: home.question_id,
                testing_period: control.period,
                answer: "DI-KAYA",
              },
            ],
          },
        },
      );
      expect(response.status()).toBe(
        control.period === active.period ? 200 : 403,
      );
    }
    await setWindow(active.label, false);
  }
  await page.reload();
  for (const control of periodControls) {
    await expect(
      page.getByRole("switch", { name: control.label }),
    ).toBeEnabled();
    await expect(
      page.getByRole("switch", { name: control.label }),
    ).not.toBeChecked();
  }
});

test("legacy master control blocks all periods without erasing the period choices", async ({
  page,
  request,
}) => {
  const { teacher, parent, headers } = await setup(request);
  await session(page, teacher, "/teacher/settings");
  const master = page.getByRole("switch", {
    name: "Home-Based Checklist Edit",
    exact: true,
  });
  await expect(master).toBeEnabled();
  for (const control of periodControls.slice(1)) {
    const toggle = page.getByRole("switch", { name: control.label });
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes(path) && response.request().method() === "PUT",
    );
    await toggle.check();
    expect((await saved).status()).toBe(200);
    await expect(toggle).toBeEnabled();
  }
  const allEnabled = {
    section_id: 1,
    pre_test_parent_editable: true,
    mid_test_parent_editable: true,
    post_test_parent_editable: true,
  };
  const masterSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/teachers/me/access") &&
      response.request().method() === "PUT",
  );
  await master.uncheck();
  expect((await masterSaved).status()).toBe(200);
  await expect(master).toBeEnabled();
  for (const control of periodControls) {
    await expect(
      page.getByRole("switch", { name: control.label }),
    ).toBeChecked();
    await expect(
      page.getByRole("switch", { name: control.label }),
    ).toBeEnabled();
  }
  expect(
    await (await request.get(`${backend}${path}`, { headers })).json(),
  ).toEqual(allEnabled);
  await session(page, parent, "/parent/eccdassessment");
  await page.getByRole("button", { name: /Home-Based Checklist/ }).click();
  const row = await openHomeDomain(page);
  await expect(
    page.getByRole("combobox", { name: "Testing period" }),
  ).toBeDisabled();
  await expect(
    row.getByRole("button", { name: "KAYA", exact: true }),
  ).toBeDisabled();
  const response = await request.get(
    `${backend}/api/eccd/parent/assessment/1`,
    { headers: { Authorization: `Bearer ${parent.token}` } },
  );
  const home = ((await response.json()) as Assessment).homeBasedChecklist?.[0];
  if (!home)
    throw new Error(
      "The disposable fixture must contain a home-based question.",
    );
  for (const period of ["PRE", "MID", "POST"] as Period[]) {
    const blocked = await request.post(`${backend}/api/eccd/parent/evaluate`, {
      headers: { Authorization: `Bearer ${parent.token}` },
      data: {
        student_id: 1,
        evaluations: [
          {
            question_id: home.question_id,
            testing_period: period,
            answer: "KAYA",
          },
        ],
      },
    });
    expect(blocked.status()).toBe(403);
  }
  await session(page, teacher, "/teacher/settings");
  const saved = page.waitForResponse(
    (value) =>
      value.url().endsWith("/api/teachers/me/access") &&
      value.request().method() === "PUT",
  );
  await master.check();
  expect((await saved).status()).toBe(200);
  await expect(master).toBeEnabled();
  expect(
    await (await request.get(`${backend}${path}`, { headers })).json(),
  ).toEqual(allEnabled);
});

async function parentData(request: APIRequestContext, parent: SessionResponse) {
  const response = await request.get(
    `${backend}/api/eccd/parent/assessment/1`,
    {
      headers: { Authorization: `Bearer ${parent.token}` },
    },
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as Assessment;
}
async function draftsOnDevice(page: Page) {
  return page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage)
        .filter((key) => key.startsWith("eccd_draft_"))
        .map((key) => [key, localStorage.getItem(key)]),
    ),
  );
}

test("Phase 4 delivers all domains, home-first cards and marks-permitted school answers", async ({
  page,
  request,
}) => {
  const { parent, headers } = await setup(request);
  const data = await parentData(request, parent);
  expect(data.domains).toHaveLength(7);
  const mixed = data.domains.find(
    (domain) =>
      domain.questions.some((q) => q.is_home_based) &&
      domain.questions.some((q) => !q.is_home_based),
  );
  if (!mixed)
    throw new Error("The reference fixture needs a mixed home/school domain.");
  const school = mixed.questions.find((q) => !q.is_home_based)!;
  expect(
    (
      await request.post(`${backend}/api/eccd/evaluate`, {
        headers,
        data: {
          student_id: 1,
          testing_period: "PRE",
          assessment_date: "2026-08-10",
          evaluations: [
            {
              question_id: school.question_id,
              testing_period: "PRE",
              answer: "DI-KAYA",
            },
          ],
        },
      })
    ).status(),
  ).toBe(200);
  await session(page, parent, "/parent/eccdassessment");
  await page.getByRole("button", { name: /Home-Based Checklist/ }).click();
  const ordered = [...data.domains].sort(
    (a, b) =>
      Number(b.questions.some((q) => q.is_home_based)) -
        Number(a.questions.some((q) => q.is_home_based)) ||
      a.domain_id - b.domain_id,
  );
  await expect(page.getByRole("heading", { level: 3 })).toHaveText(
    ordered.map((d) => d.domain_name),
  );
  await expect(
    page.getByText("Contains Home Questions", { exact: true }),
  ).toHaveCount(
    ordered.filter((d) => d.questions.some((q) => q.is_home_based)).length,
  );
  await expect(
    page.getByText("Teacher Assessed / View Only", { exact: true }),
  ).toHaveCount(
    ordered.filter((d) => !d.questions.some((q) => q.is_home_based)).length,
  );
  await page
    .getByRole("button", { name: `Assess ${mixed.domain_name}`, exact: true })
    .click();
  const schoolGroup = page.getByRole("region", {
    name: "School-Administered Questions · View Only",
  });
  const row = schoolGroup.getByRole("group", {
    name: school.question_text,
    exact: true,
  });
  await expect(
    row.getByText("Marks hidden by class adviser", { exact: true }),
  ).toBeVisible();
  await expect(schoolGroup.getByRole("button")).toHaveCount(0);
  await expect(
    row.getByText("Teacher Assessed — View Only", { exact: true }),
  ).toBeVisible();
  expect(
    await page
      .getByRole("region")
      .evaluateAll((regions) =>
        regions.map((r) => r.getAttribute("aria-label")),
      ),
  ).toEqual([
    "Home-Based Questions",
    "School-Administered Questions · View Only",
  ]);
  expect(
    (
      await request.put(`${backend}/api/teachers/me/access`, {
        headers,
        data: {
          allow_parent_view_eccd_pre: true,
          allow_parent_view_eccd_marks: true,
        },
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await page.getByRole("button", { name: /Home-Based Checklist/ }).click();
  const card = page.locator("div.group").filter({
    has: page.getByRole("heading", { name: mixed.domain_name, exact: true }),
  });
  await expect(
    card.getByText(`${Math.round(100 / mixed.questions.length)}%`, {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Assess ${mixed.domain_name}`, exact: true })
    .click();
  await expect(row.getByText("DI-KAYA", { exact: true })).toBeVisible();
  await expect(schoolGroup.getByRole("button")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("phase4-parent-domain.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Back to Domains", exact: true })
    .click();
  const schoolOnly = ordered.find(
    (d) => !d.questions.some((q) => q.is_home_based),
  )!;
  await page
    .getByRole("button", {
      name: `View ${schoolOnly.domain_name}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("region", { name: "Home-Based Questions", exact: true }),
  ).toHaveCount(0);
  await expect(schoolGroup.getByRole("group")).toHaveCount(
    schoolOnly.questions.length,
  );
  await expect(schoolGroup.getByRole("button")).toHaveCount(0);
});

test("Phase 4 saves only the selected period and retains other drafts during live window fallback", async ({
  page,
  request,
}) => {
  const { parent, headers } = await setup(request);
  expect(
    (
      await request.put(`${backend}${path}`, {
        headers,
        data: { ...flags, mid_test_parent_editable: true },
      })
    ).status(),
  ).toBe(200);
  await session(page, parent, "/parent/eccdassessment");
  await page.getByRole("button", { name: /Home-Based Checklist/ }).click();
  const row = await openHomeDomain(page);
  const selector = page.getByRole("combobox", { name: "Testing period" });
  await expect(selector.locator("option")).toHaveText(["Pre-Test", "Mid-Test"]);
  await row.getByRole("button", { name: "DI-KAYA", exact: true }).click();
  const pre = await draftsOnDevice(page);
  expect(Object.keys(pre)).toHaveLength(1);
  await selector.selectOption("MID");
  await expect(
    row.getByRole("button", { name: "DI-KAYA", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await row.getByRole("button", { name: "KAYA", exact: true }).click();
  expect(Object.keys(await draftsOnDevice(page))).toHaveLength(2);
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/eccd/parent/evaluate") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Save Assessment", exact: true })
    .first()
    .click();
  const response = await saved;
  expect(response.status()).toBe(200);
  const payload = response.request().postDataJSON() as {
    testing_period: string;
    evaluations: { testing_period: string; question_id: number }[];
  };
  expect(payload.testing_period).toBe("MID");
  expect(payload.evaluations.every((e) => e.testing_period === "MID")).toBe(
    true,
  );
  const data = await parentData(request, parent);
  const homeIds = new Set(data.homeBasedChecklist?.map((q) => q.question_id));
  expect(payload.evaluations.every((e) => homeIds.has(e.question_id))).toBe(
    true,
  );
  await expect.poll(() => draftsOnDevice(page)).toEqual(pre);
  // Confirmation evicts only MID's exact revision. Own editable answers remain visible.
  await expect(
    row.getByRole("button", { name: "KAYA", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    data.domains
      .flatMap((d) => d.questions)
      .filter((q) => q.answers.MID !== null)
      .map((q) => q.question_id),
  ).toEqual(payload.evaluations.map((row) => row.question_id));
  expect(
    (
      await request.put(`${backend}${path}`, {
        headers,
        data: {
          pre_test_parent_editable: false,
          mid_test_parent_editable: false,
          post_test_parent_editable: true,
        },
      })
    ).status(),
  ).toBe(200);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(selector).toHaveValue("POST");
  await expect(selector.locator("option")).toHaveText(["Post-Test"]);
  await row.getByRole("button", { name: "DI-KAYA", exact: true }).click();
  const beforeClosing = await draftsOnDevice(page);
  expect(Object.keys(beforeClosing)).toHaveLength(2);
  expect(
    (
      await request.put(`${backend}${path}`, {
        headers,
        data: {
          pre_test_parent_editable: false,
          mid_test_parent_editable: false,
          post_test_parent_editable: false,
        },
      })
    ).status(),
  ).toBe(200);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(selector).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Save Assessment", exact: true }).first(),
  ).toBeDisabled();
  expect(await draftsOnDevice(page)).toEqual(beforeClosing);
});

test("Phase 4 offline parent observations survive teacher closure and retry after reopening", async ({
  page,
  context,
  request,
}) => {
  const { parent, headers } = await setup(request);
  await session(page, parent, "/parent/eccdassessment");
  await page.getByRole("button", { name: /Home-Based Checklist/ }).click();
  const row = await openHomeDomain(page);
  await row.getByRole("button", { name: "DI-KAYA", exact: true }).click();
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "Save Assessment", exact: true })
    .first()
    .click();
  const stored = await draftsOnDevice(page);
  const key = Object.keys(stored)[0];
  expect(JSON.parse(stored[key] || "null").is_pending_sync).toBe(true);
  expect(
    (
      await request.put(`${backend}${path}`, {
        headers,
        data: {
          ...flags,
          pre_test_parent_editable: false,
          mid_test_parent_editable: true,
        },
      })
    ).status(),
  ).toBe(200);
  await context.setOffline(false);
  await expect
    .poll(() =>
      page.evaluate(
        (k) =>
          JSON.parse(localStorage.getItem(k) || "null")?.error as
            string | undefined,
        key,
      ),
    )
    .toContain("Editing for Pre-Test is currently closed");
  await expect(
    page.getByRole("combobox", { name: "Testing period" }),
  ).toHaveValue("MID");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Retry sync", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (k) =>
        JSON.parse(localStorage.getItem(k) || "null")?.values
          .answers as unknown,
      key,
    ),
  ).toBeTruthy();
  expect(
    (await request.put(`${backend}${path}`, { headers, data: flags })).status(),
  ).toBe(200);
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/api/eccd/parent/evaluate") && r.status() === 200,
  );
  await page.getByRole("button", { name: "Retry sync", exact: true }).click();
  const response = await saved;
  const payload = response.request().postDataJSON() as {
    testing_period: string;
    evaluations: { testing_period: string }[];
  };
  expect(payload.testing_period).toBe("PRE");
  expect(payload.evaluations.every((e) => e.testing_period === "PRE")).toBe(
    true,
  );
  await expect
    .poll(() => page.evaluate((k) => localStorage.getItem(k), key))
    .toBeNull();
});

test("Phase 4 uses virtual saved-only carry-over without erasing independent period drafts", async ({
  page,
  request,
}) => {
  const { parent, headers } = await setup(request);
  expect(
    (
      await request.put(`${backend}${path}`, {
        headers,
        data: {
          pre_test_parent_editable: true,
          mid_test_parent_editable: true,
          post_test_parent_editable: true,
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.put(`${backend}/api/teachers/me/access`, {
        headers,
        data: {
          allow_parent_view_eccd_pre: true,
          allow_parent_view_eccd_mid: true,
          allow_parent_view_eccd_post: true,
        },
      })
    ).status(),
  ).toBe(200);
  await session(page, parent, "/parent/eccdassessment");
  await page.getByRole("button", { name: /Home-Based Checklist/ }).click();
  const row = await openHomeDomain(page);
  const selector = page.getByRole("combobox", { name: "Testing period" });
  const kaya = row.getByRole("button", { name: "KAYA", exact: true });
  const di = row.getByRole("button", { name: "DI-KAYA", exact: true });
  await kaya.click();
  await selector.selectOption("MID");
  await expect(kaya).toHaveAttribute("aria-pressed", "false");
  await selector.selectOption("PRE");
  await page
    .getByRole("button", { name: "Save Assessment", exact: true })
    .first()
    .click();
  await expect.poll(() => draftsOnDevice(page)).toEqual({});
  for (const period of ["MID", "POST"]) {
    await selector.selectOption(period);
    await expect(kaya).toHaveAttribute("aria-pressed", "true");
  }
  expect(await draftsOnDevice(page)).toEqual({});
  await selector.selectOption("MID");
  await kaya.click(); // an independent, explicit draft
  const mid = await draftsOnDevice(page);
  await selector.selectOption("PRE");
  await di.click();
  await selector.selectOption("MID");
  await expect(kaya).toHaveAttribute("aria-pressed", "true");
  await selector.selectOption("POST");
  await expect(kaya).toHaveAttribute("aria-pressed", "false");
  const after = await draftsOnDevice(page);
  expect(after[Object.keys(mid)[0]]).toBe(Object.values(mid)[0]);
  expect(Object.keys(after).some((key) => key.includes("_POST_"))).toBe(false);
  // Hidden intermediate records cannot become an inference channel.
  await selector.selectOption("PRE");
  await kaya.click();
  await page
    .getByRole("button", { name: "Save Assessment", exact: true })
    .first()
    .click();
  await expect
    .poll(async () =>
      Object.keys(await draftsOnDevice(page)).filter((k) =>
        k.includes("_PRE_"),
      ),
    )
    .toEqual([]);
  await selector.selectOption("POST");
  await expect(kaya).toHaveAttribute("aria-pressed", "true");
  expect(
    (
      await request.put(`${backend}/api/teachers/me/access`, {
        headers,
        data: { allow_parent_view_eccd_mid: false },
      })
    ).status(),
  ).toBe(200);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(kaya).toHaveAttribute("aria-pressed", "true");
  // Closing the home window masks the intermediate observations; score
  // release alone no longer controls the question-level inference boundary.
  expect(
    (
      await request.put(`${backend}${path}`, {
        headers,
        data: {
          pre_test_parent_editable: true,
          mid_test_parent_editable: false,
          post_test_parent_editable: true,
        },
      })
    ).status(),
  ).toBe(200);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(kaya).toHaveAttribute("aria-pressed", "false");
});

test("Phase 4 restores older single-period queued requests without losing newer revisions", async ({
  page,
  request,
}) => {
  const { parent } = await setup(request);
  const data = await parentData(request, parent);
  const home = data.homeBasedChecklist![0];
  const key = `eccd_draft_1_PRE_${home.domain_id}_home_${parent.user.id}`;
  await session(page, parent, "/parent/eccdassessment");
  const revision = "old-offline-request";
  await page.evaluate(
    ({ key, owner, question, revision }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          owner_id: owner,
          revision,
          is_pending_sync: true,
          values: { answers: { [question]: "DI-KAYA" } },
          request: {
            path: "/api/eccd/parent/evaluate",
            method: "post",
            data: {
              student_id: 1,
              evaluations: [
                {
                  question_id: question,
                  testing_period: "PRE",
                  answer: "DI-KAYA",
                },
              ],
            },
          },
        }),
      ),
    { key, owner: parent.user.id, question: home.question_id, revision },
  );
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let received: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    received = resolve;
  });
  await page.route("**/api/eccd/parent/evaluate", async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    received();
    await held;
    await route.fulfill({ response });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await started;
  await page.evaluate((key) => {
    const draft = JSON.parse(localStorage.getItem(key) || "null") as {
      revision: string;
      is_pending_sync: boolean;
      values: { answers: Record<string, string> };
    };
    draft.revision = "newer-manual-work";
    draft.is_pending_sync = false;
    for (const question of Object.keys(draft.values.answers))
      draft.values.answers[question] = "KAYA";
    localStorage.setItem(key, JSON.stringify(draft));
    window.dispatchEvent(new Event("ames-drafts-changed"));
  }, key);
  let confirmed: () => void = () => {};
  const synced = new Promise<void>((resolve) => {
    confirmed = resolve;
  });
  await page.exposeFunction("phase4RecordConfirmed", confirmed);
  await page.evaluate(() => {
    window.addEventListener(
      "ames-record-synced",
      () => {
        const target = window as Window & {
          phase4RecordConfirmed: () => Promise<void>;
        };
        void target.phase4RecordConfirmed();
      },
      { once: true },
    );
  });
  release();
  await synced;
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key) || "null")?.revision as
            string | undefined,
        key,
      ),
    )
    .toBe("newer-manual-work");
  await page.getByRole("button", { name: /Home-Based Checklist/ }).click();
  const domain = data.domains.find((d) => d.domain_id === home.domain_id)!;
  await page
    .getByRole("button", { name: `Assess ${domain.domain_name}`, exact: true })
    .click();
  await expect(
    page
      .getByRole("group", { name: home.question_text, exact: true })
      .getByRole("button", { name: "KAYA", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("Phase 4 isolates drafts by child and account during switching and reload", async ({
  page,
  request,
}) => {
  const { parent } = await setup(request);
  const data = await parentData(request, parent);
  const source = (await (
    await request.get(`${backend}/api/students/my-child`, {
      headers: { Authorization: `Bearer ${parent.token}` },
    })
  ).json()) as Student[];
  const sibling = {
    ...source[0],
    student_id: 999,
    first_name: "Sibling",
    masked_lrn: "********9999",
  };
  await page.route("**/api/students/my-child", (route) =>
    route.fulfill({ json: [source[0], sibling] }),
  );
  // Synthetic reads let the browser exercise a second account/child without
  // granting that account access to any real evaluation or sending it a write.
  await page.route("**/api/eccd/parent/assessment/1", (route) =>
    route.fulfill({ json: data }),
  );
  await page.route("**/api/eccd/parent/assessment/999", (route) =>
    route.fulfill({ json: { ...data, student_id: 999, student: sibling } }),
  );
  await session(page, parent, "/parent/eccdassessment");
  await page.getByRole("button", { name: /Home-Based Checklist/ }).click();
  await (
    await openHomeDomain(page)
  )
    .getByRole("button", { name: "DI-KAYA", exact: true })
    .click();
  const original = await draftsOnDevice(page);
  await page
    .getByRole("combobox")
    .filter({ has: page.locator('option[value="1"]', { hasText: "Sibling" }) })
    .selectOption("1");
  const siblingRow = await openHomeDomain(page);
  await expect(
    siblingRow.getByRole("button", { name: "DI-KAYA", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await siblingRow.getByRole("button", { name: "KAYA", exact: true }).click();
  const both = await draftsOnDevice(page);
  expect(Object.keys(both)).toHaveLength(2);
  expect(Object.keys(both).some((k) => k.startsWith("eccd_draft_999_"))).toBe(
    true,
  );
  await page.reload();
  await page.getByRole("button", { name: /Home-Based Checklist/ }).click();
  await expect(
    (await openHomeDomain(page)).getByRole("button", {
      name: "KAYA",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  const stranger = await login(request, "stranger");
  await session(page, stranger, "/parent/eccdassessment");
  await page.getByRole("button", { name: /Home-Based Checklist/ }).click();
  await expect(
    (await openHomeDomain(page)).getByRole("button", {
      name: "DI-KAYA",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "false");
  expect(await draftsOnDevice(page)).toEqual(both);
  await session(page, parent, "/parent/eccdassessment");
  await page.getByRole("button", { name: /Home-Based Checklist/ }).click();
  const current = await openHomeDomain(page);
  await expect(
    current.getByRole("button", { name: "KAYA", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect((await draftsOnDevice(page))[Object.keys(original)[0]]).toBe(
    Object.values(original)[0],
  );
});

test("Phase 4 late save confirmation cannot clear another child's work or show its success feedback", async ({
  page,
  request,
}) => {
  const { parent } = await setup(request);
  const data = await parentData(request, parent);
  const source = (await (
    await request.get(`${backend}/api/students/my-child`, {
      headers: { Authorization: `Bearer ${parent.token}` },
    })
  ).json()) as Student[];
  const sibling = {
    ...source[0],
    student_id: 999,
    first_name: "Sibling",
    masked_lrn: "********9999",
  };
  await page.route("**/api/students/my-child", (route) =>
    route.fulfill({ json: [source[0], sibling] }),
  );
  await page.route("**/api/eccd/parent/assessment/999", (route) =>
    route.fulfill({ json: { ...data, student_id: 999, student: sibling } }),
  );
  await session(page, parent, "/parent/eccdassessment");
  await page.getByRole("button", { name: /Home-Based Checklist/ }).click();
  await (
    await openHomeDomain(page)
  )
    .getByRole("button", { name: "DI-KAYA", exact: true })
    .click();
  const childSelector = page
    .getByRole("combobox")
    .filter({ has: page.locator('option[value="1"]', { hasText: "Sibling" }) });
  await childSelector.selectOption("1");
  await (
    await openHomeDomain(page)
  )
    .getByRole("button", { name: "KAYA", exact: true })
    .click();
  const stored = await draftsOnDevice(page);
  const siblingKey = Object.keys(stored).find((k) =>
    k.startsWith("eccd_draft_999_"),
  )!;
  const originalKey = Object.keys(stored).find((k) =>
    k.startsWith("eccd_draft_1_"),
  )!;
  await childSelector.selectOption("0");
  await openHomeDomain(page);
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let received: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    received = resolve;
  });
  await page.route("**/api/eccd/parent/evaluate", async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    received();
    await held;
    await route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: "Save Assessment", exact: true })
    .first()
    .click();
  await started;
  await childSelector.selectOption("1");
  const row = await openHomeDomain(page);
  await expect(
    row.getByRole("button", { name: "KAYA", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  release();
  await expect(
    row.getByRole("button", { name: "KAYA", exact: true }),
  ).toBeEnabled();
  await expect
    .poll(() => page.evaluate((k) => localStorage.getItem(k), originalKey))
    .toBeNull();
  expect((await draftsOnDevice(page))[siblingKey]).toBe(stored[siblingKey]);
  await expect(
    page.getByText("Home-based evaluation saved successfully!", {
      exact: true,
    }),
  ).toHaveCount(0);
});
