import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
const TEST_API = "http://127.0.0.1:8767";
const PASSWORD = "Example123";
async function bridge(page: Page) {
  // Point the served API module at the disposable database server. Requests,
  // including browser multipart uploads and Socket.IO, then use real transports.
  await page.route("**/src/services/api.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replaceAll(
        "http://localhost:8000",
        TEST_API,
      ),
    });
  });
}
async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(`${username}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}
async function session(page: Page) {
  return page.evaluate(() => localStorage.getItem("token"));
}
test.beforeEach(async ({ page, request }) => {
  const reset = await request.post(`${TEST_API}/__test/reset`);
  expect(reset.ok()).toBeTruthy();
  await bridge(page);
});

test("local parent registration signs in immediately and mobile navigation fits", async ({
  page,
}, info) => {
  await page.goto("/register-parent");
  await page.getByLabel("First name", { exact: true }).fill("Example");
  await page.getByLabel("Last name", { exact: true }).fill("Parent");
  await page
    .getByLabel("Email", { exact: true })
    .fill("new-parent@example.com");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/parent\/dashboard/);
  await expect(
    page.getByRole("heading", { name: "Your child’s learning journey" }),
  ).toBeVisible();
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("link", { name: "Child Information" }).click();
    await expect(
      page.getByRole("heading", { name: "Child Information" }),
    ).toBeVisible();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: `test-results/${info.project.name}-parent.png`,
    fullPage: true,
  });
});

test("assessment drafts survive reload and reconnect using IDs", async ({
  page,
}) => {
  await login(page, "adviser");
  await page.goto("/teacher/eccdassessment");
  await expect(
    page.getByRole("heading", { name: "Gross Motor Domain", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Assessment date").fill("2026-08-10");
  await page.getByRole("radio").first().check();
  await page.reload();
  await expect(page.getByRole("radio").first()).toBeChecked();
  await expect(page.getByLabel("Assessment date")).toHaveValue("2026-08-10");
  let failing = true;
  await page.route("**/api/eccd/evaluate", async (route) => {
    if (failing) return route.abort("connectionfailed");
    const response = await route.fetch({
      url: `${TEST_API}/api/eccd/evaluate`,
    });
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Save assessment" }).click();
  await expect(
    page.getByText("Saved on this device and queued for reconnection."),
  ).toBeVisible();
  const draftKey = await page.evaluate(() =>
    Object.keys(localStorage).find((key) =>
      key.startsWith("eccd_draft_1_PRE_"),
    ),
  );
  expect(draftKey).toBeTruthy();
  failing = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key!), draftKey))
    .toBeNull();
  const token = await session(page);
  const record = await page.request.get(`${TEST_API}/api/eccd/assessment/1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await record.json();
  expect(data.periodDates.PRE).toBe("2026-08-10");
  expect(data.domains[0].questions[0].answers.PRE).toBe("KAYA");
});

test("an in-flight save cannot erase newer assessment answers", async ({
  page,
}) => {
  await login(page, "adviser");
  await page.goto("/teacher/eccdassessment");
  await page.getByRole("radio").first().check();
  await page.getByLabel("Assessment date").fill("2026-08-10");
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/eccd/evaluate", async (route) => {
    await wait;
    const response = await route.fetch({
      url: `${TEST_API}/api/eccd/evaluate`,
    });
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Save assessment" }).click();
  // The date remains editable while the previous snapshot is being committed.
  await page.getByLabel("Assessment date").fill("2026-08-11");
  release();
  await expect(page.getByText("Assessment saved successfully.")).toBeVisible();
  const retained = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith("eccd_draft_1_PRE_"))
      .map((k) => JSON.parse(localStorage.getItem(k)!)),
  );
  expect(retained[0].values.evaluation_date).toBe("2026-08-11");
});

test("unreleased parent results and editing stay locked; six permissions release them", async ({
  page,
  request,
}) => {
  await login(page, "parent");
  await page.goto("/parent/eccdassessment");
  await expect(page.getByText("Results Pending Adviser Release")).toHaveCount(
    3,
  );
  await page.getByRole("button", { name: "Home-Based Checklist" }).click();
  await expect(
    page.getByRole("button", { name: "Save assessment" }),
  ).toBeDisabled();
  await page.goto("/parent/childinformation");
  await expect(page.getByLabel("Address", { exact: true })).toHaveCount(0);
  const response = await request.post(`${TEST_API}/api/auth/login`, {
    data: { email: "adviser@example.com", password: PASSWORD },
  });
  const { token } = await response.json();
  await request.put(`${TEST_API}/api/teachers/access-controls`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      allow_parent_view_student_info: true,
      allow_parent_view_eccd_pre: true,
      allow_parent_view_eccd_mid: false,
      allow_parent_view_eccd_post: false,
      allow_parent_edit_student_info: false,
      allow_parent_edit_home_based_eccd: true,
    },
  });
  await page.goto("/parent/childinformation");
  await expect(
    page.getByText("Student information is read-only."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
  await page.goto("/parent/eccdassessment");
  await page.getByRole("button", { name: "Home-Based Checklist" }).click();
  await expect(page.getByRole("radio").first()).toBeEnabled();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Save assessment" }).click();
  await expect(page.getByText("Assessment saved successfully.")).toBeVisible();
});

test("teacher creation enforces first-login password before school APIs mount", async ({
  page,
}) => {
  await login(page, "chairman");
  await page.goto("/super-admin/teachers");
  await page.getByRole("button", { name: "+ Add teacher" }).click();
  await page.getByLabel("First name", { exact: true }).fill("New");
  await page.getByLabel("Last name", { exact: true }).fill("Teacher");
  await page
    .getByLabel("Email", { exact: true })
    .fill("newteacher@example.com");
  await page.getByLabel("Temporary password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create teacher account" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  });
  await login(page, "newteacher");
  await expect(
    page.getByRole("heading", { name: "First-time login security setup" }),
  ).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill("Changed123");
  await page.getByLabel("Confirm new password").fill("Changed123");
  await page.getByRole("button", { name: "Save password & continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
});

test("chat uses authenticated rooms and broadcasts a persisted message once", async ({
  page,
  browser,
}, info) => {
  await login(page, "adviser");
  await page.goto("/teacher/messages");
  const parentContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const parent = await parentContext.newPage();
  await bridge(parent);
  await login(parent, "parent");
  await parent.goto("/parent/messages");
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: /Test Parent/ }).click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect(parent.getByText("Connected", { exact: true })).toBeVisible();
  await page
    .getByLabel("Message", { exact: true })
    .fill("Let’s practice together.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    parent.getByText("Let’s practice together.", { exact: true }),
  ).toHaveCount(1);
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");
  await expect(
    parent.getByText("Let’s practice together.", { exact: true }),
  ).toBeVisible();
  await parentContext.close();
});

test("student transfer uses IDs and preserves evaluations", async ({
  page,
  request,
}) => {
  const loginRes = await request.post(`${TEST_API}/api/auth/login`, {
    data: { email: "adviser@example.com", password: PASSWORD },
  });
  const { token } = await loginRes.json();
  await request.post(`${TEST_API}/api/eccd/evaluate`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      student_id: 1,
      period: "PRE",
      evaluation_date: "2026-08-10",
      answers: { "1": 1 },
    },
  });
  await login(page, "chairman");
  await page.goto("/super-admin/students");
  await page.getByRole("checkbox", { name: "Select Student, Test M." }).check();
  await page.getByRole("button", { name: "Transfer students" }).click();
  await page.getByLabel("Destination section").selectOption("2");
  await page.getByRole("button", { name: "Confirm transfer" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const chairmanToken = await session(page);
  const res = await request.get(`${TEST_API}/api/eccd/assessment/1`, {
    headers: { Authorization: `Bearer ${chairmanToken}` },
  });
  expect((await res.json()).domains[0].questions[0].answers.PRE).toBe("KAYA");
});

test("school branding, rollover undo, and backups use the migrated contracts", async ({
  page,
}, info) => {
  await login(page, "chairman");
  await page.goto("/super-admin/settings");
  await page.getByLabel("School name", { exact: true }).fill("Example School");
  await page.getByRole("button", { name: "Save school settings" }).click();
  await expect(page.getByText("School settings saved.")).toBeVisible();
  await page.getByRole("button", { name: "Start next school year" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Undo rollover/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Undo rollover/ }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("button", { name: /Undo rollover/ })).toHaveCount(
    0,
  );
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download encrypted backup" }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toMatch(/\.enc$/);
  const path = await file.path();
  const bytes = await readFile(path!);
  expect(bytes.toString("utf8").startsWith("gAAAA")).toBeTruthy();
  await page.getByLabel("Restore .enc backup").setInputFiles(path!);
  await page
    .getByRole("button", { name: "Restore backup", exact: true })
    .click();
  const restoreResponse = page.waitForResponse("**/api/backup/restore");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  const result = await restoreResponse;
  expect(result.status(), await result.text()).toBe(200);
  await expect(page.getByText(/Backup restored successfully/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: `test-results/${info.project.name}-settings.png`,
    fullPage: true,
  });
});
