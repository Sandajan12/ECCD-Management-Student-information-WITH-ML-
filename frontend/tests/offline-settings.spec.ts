import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { Permissions, SessionUser } from "../src/types";
import type { Draft } from "../src/utils/drafts";

const teacher: SessionUser = {
  id: 2,
  first_name: "Test",
  last_name: "Teacher",
  full_name: "Test Teacher",
  email: "teacher@example.com",
  role: "admin",
  is_first_login: 0,
  section_id: 1,
  section_name: "Test A",
  allow_eccd_question_management: false,
};
const notice =
  "Your draft is saved on this device. Reconnect and submit again.";

const accessKey = "ames_draft_2_teacher_access";
async function setupAccess(page: Page, draft?: Draft<unknown>) {
  const access: Permissions = {
    allow_parent_view_student_info: true,
    allow_parent_view_eccd_pre: false,
    allow_parent_view_eccd_mid: false,
    allow_parent_view_eccd_post: false,
    allow_parent_view_eccd_marks: true,
    allow_parent_predictions: true,
    allow_parent_edit_student_info: true,
    allow_parent_edit_home_based_eccd: true,
  };
  const writes: Partial<Permissions>[] = [];
  await page.addInitScript(
    ({ user, saved, key }) => {
      const payload = btoa(JSON.stringify({ exp: Date.now() / 1000 + 3600 }));
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("token", `test.${payload}.test`);
      if (saved && !localStorage.getItem("acl-seeded")) {
        localStorage.setItem(key, JSON.stringify(saved));
        localStorage.setItem("acl-seeded", "true");
      }
    },
    { user: teacher, saved: draft, key: accessKey },
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (
      path === "/api/teachers/me/access" &&
      route.request().method() === "PUT"
    ) {
      const changes = route.request().postDataJSON() as Partial<Permissions>;
      writes.push(changes);
      Object.assign(access, changes);
    }
    let json: unknown = {};
    if (path === "/api/teachers/me/access") json = access;
    else if (path === "/api/teachers/access-controls")
      json = { ...access, ...teacher };
    else if (path === "/api/sections/")
      json = [{ section_id: 1, section_name: "Test A" }];
    else if (path === "/api/teachers/dashboard-filters")
      json = { sections: ["Test A"] };
    else if (path === "/api/teacher/settings/parent-assessment-access")
      json = {
        section_id: 1,
        pre_test_parent_editable: true,
        mid_test_parent_editable: false,
        post_test_parent_editable: false,
      };
    else if (path === "/api/messages/contacts")
      json = { myId: 2, contacts: [] };
    else if (path === "/api/messages/unread-count") json = { unreadCount: 0 };
    await route.fulfill({ json });
  });
  await page.goto("/teacher/settings");
  return { access, writes };
}

for (const scenario of [
  {
    name: "legacy partial",
    owner: 2,
    values: { allow_parent_view_eccd_pre: true },
    enabled: true,
  },
  {
    name: "explicit OFF",
    owner: 2,
    values: {
      allow_parent_view_eccd_marks: false,
      allow_parent_predictions: false,
    },
    enabled: false,
  },
  {
    name: "invalid fields",
    owner: 2,
    values: {
      allow_parent_view_eccd_marks: null,
      allow_parent_predictions: "false",
    },
    enabled: true,
  },
  {
    name: "different owner",
    owner: 9,
    values: {
      allow_parent_view_eccd_marks: false,
      allow_parent_predictions: false,
    },
    enabled: true,
  },
  {
    name: "legacy full",
    owner: 2,
    values: {
      allow_parent_predictions: true,
      allow_parent_view_student_info: true,
      allow_parent_view_eccd_pre: true,
      allow_parent_view_eccd_mid: false,
      allow_parent_view_eccd_post: false,
      allow_parent_view_eccd_marks: false,
      allow_parent_edit_student_info: true,
      allow_parent_edit_home_based_eccd: true,
    },
    enabled: false,
  },
]) {
  test(`ACL hydration preserves server values with ${scenario.name} drafts`, async ({
    page,
  }) => {
    const draft = {
      owner_id: scenario.owner,
      values: scenario.values,
      revision: "legacy",
      is_pending_sync: true,
    };
    const { writes } = await setupAccess(page, draft);
    const marks = page.getByRole("switch", {
      name: "Viewing of ECCD Marks",
      exact: true,
    });
    const prediction = page.getByRole("switch", {
      name: "Student Prediction",
      exact: true,
    });
    await expect(marks).toBeEnabled();
    await expect(marks).toBeChecked({ checked: scenario.enabled });
    await expect(prediction).toBeChecked({
      checked: scenario.name === "legacy full" || scenario.enabled,
    });
    await page.reload();
    await expect(marks).toBeEnabled();
    await expect(marks).toBeChecked({ checked: scenario.enabled });
    expect(writes).toEqual([]);
    expect(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) || "null"),
        accessKey,
      ),
    ).toEqual(draft);
  });
}

test("ACL drafts accumulate only pending booleans and retry with a partial PUT", async ({
  page,
}) => {
  const { access, writes } = await setupAccess(page);
  const marks = page.getByRole("switch", {
    name: "Viewing of ECCD Marks",
    exact: true,
  });
  const prediction = page.getByRole("switch", {
    name: "Student Prediction",
    exact: true,
  });
  const retry = page.getByRole("button", {
    name: "Retry parent access settings",
  });
  await expect(marks).toBeEnabled();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    }),
  );
  await marks.uncheck();
  await expect(retry).toBeEnabled();
  await prediction.uncheck();
  await expect(retry).toBeEnabled();
  const pending = {
    allow_parent_view_eccd_marks: false,
    allow_parent_predictions: false,
  };
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) || "null")?.values,
      accessKey,
    ),
  ).toEqual(pending);
  expect(writes).toEqual([]);
  await page.reload();
  await expect(marks).not.toBeChecked();
  await expect(prediction).not.toBeChecked();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(retry).toBeEnabled();
  expect(writes).toEqual([]);
  await retry.click();
  await expect(retry).toHaveCount(0);
  expect(writes).toEqual([pending]);
  expect(access.allow_parent_view_student_info).toBe(true);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), accessKey),
  ).toBeNull();
  await page.reload();
  await expect(marks).toBeEnabled();
  await expect(marks).not.toBeChecked();
  await expect(prediction).not.toBeChecked();
  await prediction.check();
  await expect(retry).toHaveCount(0);
  expect(writes).toEqual([pending, { allow_parent_predictions: true }]);
});

for (const status of [204, 500]) {
  test(`ACL drafts survive unconfirmed HTTP ${status} and reload until manual retry`, async ({
    page,
  }) => {
    const { writes } = await setupAccess(page);
    await page.route("**/api/teachers/me/access", (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      return route.fulfill({
        status,
        ...(status === 204 ? {} : { json: { detail: "Save failed" } }),
      });
    });
    const marks = page.getByRole("switch", {
      name: "Viewing of ECCD Marks",
      exact: true,
    });
    const retry = page.getByRole("button", {
      name: "Retry parent access settings",
    });
    await expect(marks).toBeEnabled();
    await marks.uncheck();
    await expect(retry).toBeEnabled();
    expect(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) || "null")?.values,
        accessKey,
      ),
    ).toEqual({ allow_parent_view_eccd_marks: false });
    await page.reload();
    await expect(marks).toBeEnabled();
    await expect(marks).not.toBeChecked();
    await page.unroute("**/api/teachers/me/access");
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(retry).toBeEnabled();
    expect(writes).toEqual([]);
    await retry.click();
    await expect(retry).toHaveCount(0);
    expect(writes).toEqual([{ allow_parent_view_eccd_marks: false }]);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), accessKey),
    ).toBeNull();
  });
}

test("ACL partial retry preserves unrelated server flags and newer draft revisions", async ({
  page,
}) => {
  const draft: Draft<Partial<Permissions>> = {
    owner_id: 2,
    values: { allow_parent_view_eccd_pre: true },
    revision: "old",
    is_pending_sync: true,
  };
  const { access, writes } = await setupAccess(page, draft);
  const retry = page.getByRole("button", {
    name: "Retry parent access settings",
  });
  await expect(retry).toBeEnabled();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/teachers/me/access", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    writes.push(route.request().postDataJSON() as Partial<Permissions>);
    await pending;
    await route.fulfill({ json: { message: "Access controls updated." } });
  });
  const sent = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/teachers/me/access") &&
      request.method() === "PUT",
  );
  await retry.click();
  await sent;
  const newer = {
    ...draft,
    values: { allow_parent_view_eccd_pre: false },
    revision: "newer",
  };
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: accessKey, value: newer },
  );
  release();
  await expect(retry).toBeEnabled();
  expect(writes).toEqual([{ allow_parent_view_eccd_pre: true }]);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) || "null"),
      accessKey,
    ),
  ).toEqual(newer);
  expect(access.allow_parent_view_eccd_marks).toBe(true);
  expect(access.allow_parent_predictions).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Viewing of ECCD Marks", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("switch", { name: "Student Prediction", exact: true }),
  ).toBeChecked();
});

test("teacher permission drafts require an explicit retry after reload and reconnect", async ({
  page,
}) => {
  let fail = true;
  const writes: string[] = [];
  const access = {
    allow_parent_view_student_info: true,
    allow_parent_view_eccd_pre: false,
    allow_parent_view_eccd_mid: false,
    allow_parent_view_eccd_post: false,
    allow_parent_view_eccd_marks: false,
    allow_parent_predictions: false,
    allow_parent_edit_student_info: true,
    allow_parent_edit_home_based_eccd: true,
  };
  const periods = {
    section_id: 1,
    pre_test_parent_editable: true,
    mid_test_parent_editable: false,
    post_test_parent_editable: false,
  };
  await page.addInitScript((user) => {
    const payload = btoa(JSON.stringify({ exp: Date.now() / 1000 + 3600 }));
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("token", `test.${payload}.test`);
  }, teacher);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "PUT") {
      writes.push(path);
      if (fail) return route.abort("failed");
      if (path === "/api/teachers/me/access")
        Object.assign(access, route.request().postDataJSON());
      else Object.assign(periods, route.request().postDataJSON());
    }
    let json: unknown = {};
    if (path === "/api/teachers/me/access") json = access;
    else if (path === "/api/teacher/settings/parent-assessment-access")
      json = periods;
    else if (path === "/api/sections/")
      json = [{ section_id: 1, section_name: "Test A" }];
    else if (path === "/api/teachers/dashboard-filters")
      json = { sections: ["Test A"] };
    else if (path === "/api/teachers/access-controls")
      json = { ...access, ...teacher };
    else if (path === "/api/messages/contacts")
      json = { myId: 2, contacts: [] };
    else if (path === "/api/messages/unread-count") json = { unreadCount: 0 };
    await route.fulfill({ json });
  });
  await page.goto("/teacher/settings");
  const prediction = page.getByRole("switch", {
    name: "Student Prediction",
    exact: true,
  });
  const mid = page.getByRole("switch", {
    name: "Mid-Test Home-Based Edit",
    exact: true,
  });
  await expect(prediction).toBeEnabled();
  await prediction.check();
  await expect(
    page.getByRole("button", { name: "Retry parent access settings" }),
  ).toBeEnabled();
  await expect(mid).toBeEnabled();
  await mid.check();
  await expect(
    page.getByRole("button", { name: "Retry period settings" }),
  ).toBeEnabled();
  await expect(page.getByText(notice).first()).toBeVisible();
  expect(writes).toHaveLength(2);
  await page.reload();
  await expect(prediction).toBeChecked();
  await expect(mid).toBeChecked();
  fail = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(mid).toBeEnabled();
  expect(writes).toHaveLength(2);
  await page
    .getByRole("button", { name: "Retry parent access settings" })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry period settings" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Retry period settings" }).click();
  await expect.poll(() => writes.length).toBe(4);
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("ames_draft_2_parent_assessment_access_1"),
      ),
    )
    .toBeNull();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("ames_draft_2_teacher_access"),
    ),
  ).toBeNull();
  expect(access.allow_parent_predictions).toBe(true);
  expect(periods.mid_test_parent_editable).toBe(true);
});

test("sandbox drafts wait for manual retry after offline edits and online reload", async ({
  page,
}) => {
  let submissions = 0;
  await page.addInitScript((user) => {
    const payload = btoa(JSON.stringify({ exp: Date.now() / 1000 + 3600 }));
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("token", `test.${payload}.test`);
  }, teacher);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/ml/predict/sandbox") {
      submissions++;
      return route.fulfill({
        status: 503,
        json: { detail: "Prediction unavailable" },
      });
    }
    let json: unknown = {};
    if (path === "/api/sections/")
      json = [{ section_id: 1, section_name: "Test A" }];
    else if (path === "/api/teachers/dashboard-filters")
      json = { sections: ["Test A"] };
    else if (path === "/api/teachers/access-controls") json = teacher;
    else if (path === "/api/ml/students") json = [];
    else if (path === "/api/messages/contacts")
      json = { myId: 2, contacts: [] };
    else if (path === "/api/messages/unread-count") json = { unreadCount: 0 };
    await route.fulfill({ json });
  });
  await page.goto("/teacher/ml-insights");
  await page.getByRole("tab", { name: "Sandbox Simulator" }).click();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    }),
  );
  for (const name of [
    "Gross Motor",
    "Fine Motor",
    "Self-Help",
    "Receptive Language",
    "Expressive Language",
    "Cognitive",
    "Socio-Emotional",
  ])
    await page.getByLabel(`${name} raw score`, { exact: true }).fill("1");
  await page
    .getByLabel("Age at PRE (completed months)", { exact: true })
    .fill("49");
  await expect(page.getByText(notice).first()).toBeVisible();
  expect(submissions).toBe(0);
  await page.reload();
  await page.getByRole("tab", { name: "Sandbox Simulator" }).click();
  await expect(page.getByText(notice).first()).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    page.getByLabel("Gross Motor raw score", { exact: true }),
  ).toHaveValue("1");
  expect(submissions).toBe(0);
  await page.getByRole("button", { name: "Retry prediction" }).click();
  await expect.poll(() => submissions).toBe(1);
  await expect(page.getByRole("alert")).toContainText("Prediction unavailable");
});

test("chairman queued switches remain drafts on login and have explicit retry buttons", async ({
  page,
}) => {
  const writes: string[] = [];
  let home = false;
  let permission = false;
  await page.addInitScript((account) => {
    const payload = btoa(JSON.stringify({ exp: Date.now() / 1000 + 3600 }));
    localStorage.setItem(
      "user",
      JSON.stringify({ ...account, id: 1, role: "super-admin" }),
    );
    localStorage.setItem("token", `test.${payload}.test`);
    if (!localStorage.getItem("test-switches-seeded")) {
      const draft = {
        owner_id: 1,
        is_pending_sync: true,
        revision: "legacy-queued",
      };
      localStorage.setItem(
        "ames_draft_1_question_home_11",
        JSON.stringify({
          ...draft,
          values: { is_home_based: true },
          request: {
            path: "/api/eccd-config/questions/11/home-based",
            method: "put",
            data: { is_home_based: true },
          },
        }),
      );
      localStorage.setItem(
        "ames_draft_1_teacher_question_permission_9",
        JSON.stringify({
          ...draft,
          values: { permission: true },
          request: {
            path: "/api/chairman/teachers/9/permissions",
            method: "put",
            data: { allow_eccd_question_management: true },
          },
        }),
      );
      localStorage.setItem("test-switches-seeded", "true");
    }
  }, teacher);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "PUT") {
      writes.push(path);
      if (path.includes("home-based"))
        home = route.request().postDataJSON().is_home_based;
      else
        permission = route
          .request()
          .postDataJSON().allow_eccd_question_management;
    }
    let json: unknown = {};
    if (path === "/api/eccd-config/")
      json = [
        {
          domain_id: 1,
          domain_name: "Motor",
          questions: [
            {
              question_id: 11,
              domain_id: 1,
              question_text: "Runs safely",
              sequence_order: 1,
              is_home_based: home,
            },
          ],
        },
      ];
    else if (path === "/api/teachers/active")
      json = [
        {
          teacher_id: 9,
          user_id: 9,
          first_name: "Sample",
          last_name: "Adviser",
          email: "sample@example.com",
          section_id: 1,
          section_name: "Test A",
          allow_eccd_question_management: permission,
        },
      ];
    else if (path === "/api/teachers/archived") json = [];
    else if (path === "/api/chairman/sections")
      json = [{ section_id: 1, section_name: "Test A" }];
    await route.fulfill({ json });
  });
  await page.goto("/super-admin/eccd-questions");
  await page.getByRole("button", { name: "Manage Questions" }).click();
  await expect(
    page.getByRole("button", { name: "Home-based assessment" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  expect(writes).toHaveLength(0);
  await page.getByRole("button", { name: "Retry home-based setting" }).click();
  await expect.poll(() => home).toBe(true);
  await expect(
    page.getByRole("button", { name: "Retry home-based setting" }),
  ).toHaveCount(0);
  await page.goto("/super-admin/teachers");
  await page.getByRole("button", { name: "Manage Access" }).click();
  await expect(
    page.getByRole("switch", { name: "Enable ECCD Question Management" }),
  ).toBeChecked();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  expect(writes).toHaveLength(1);
  await page
    .getByRole("button", { name: "Retry ECCD question permission" })
    .click();
  await expect.poll(() => permission).toBe(true);
  await expect(
    page.getByRole("button", { name: "Retry ECCD question permission" }),
  ).toHaveCount(0);
  expect(writes).toEqual([
    "/api/eccd-config/questions/11/home-based",
    "/api/chairman/teachers/9/permissions",
  ]);
});
