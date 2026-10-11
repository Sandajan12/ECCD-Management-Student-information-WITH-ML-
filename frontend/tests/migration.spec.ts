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
  await page.getByRole("button", { name: "Log In", exact: true }).click();
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

async function screenshot(page: Page, path: string) {
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    document
      .querySelector("[data-layout-content]")
      ?.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.locator("aside").evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished),
    );
  });
  await page.screenshot({ path, fullPage: true });
}

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
  await page.getByRole("button", { name: "Sign Up", exact: true }).click();
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
  await screenshot(page, `test-results/${info.project.name}-parent.png`);
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
  await page.getByRole("button", { name: "Add New Teacher" }).click();
  await page.getByLabel("Full Name", { exact: true }).fill("New Teacher");
  await page
    .getByLabel("Email", { exact: true })
    .fill("newteacher@example.com");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  });
  await login(page, "newteacher");
  await expect(
    page.getByRole("heading", { name: "First-Time Login Security Setup" }),
  ).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill("Changed123");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("Changed123");
  await page.getByRole("button", { name: "Save Password & Continue" }).click();
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
  await page.getByRole("button", { name: /Transfer Selected/ }).click();
  await page.getByRole("combobox", { name: "Destination Section" }).click();
  await page.getByRole("option", { name: /Test B/ }).click();
  await page.getByRole("button", { name: "Confirm Transfer" }).click();
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
  await page.getByLabel("School Name:", { exact: true }).fill("Example School");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("School settings saved.")).toBeVisible();
  await page.getByRole("button", { name: /Advance System to/ }).click();
  await page
    .getByRole("button", { name: "Yes, Advance Year", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Revert to/ })).toBeVisible();
  await page.getByRole("button", { name: /Revert to/ }).click();
  await page
    .getByRole("button", { name: "Yes, Revert School Year", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Revert to/ })).toHaveCount(0);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Encrypted Backup" }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toMatch(/\.enc$/);
  const path = await file.path();
  const bytes = await readFile(path!);
  expect(bytes.toString("utf8").startsWith("gAAAA")).toBeTruthy();
  await page.getByLabel("Restore .enc backup").setInputFiles(path!);
  await page
    .getByRole("button", { name: "Restore System", exact: true })
    .click();
  const restoreResponse = page.waitForResponse("**/api/backup/restore");
  await page
    .getByRole("button", { name: "Yes, Overwrite Data", exact: true })
    .click();
  const result = await restoreResponse;
  expect(result.status(), await result.text()).toBe(200);
  await expect(page.getByText(/Backup restored successfully/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBeTruthy();
  await screenshot(page, `test-results/${info.project.name}-settings.png`);
});

test("student profile drafts persist through reload and save only allowed fields", async ({
  page,
}) => {
  await login(page, "adviser");
  await page.goto("/teacher/students");
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await page.getByLabel("Home address").fill("Example Street");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await expect(page.getByLabel("Home address")).toHaveValue("Example Street");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const token = await session(page);
  const row = await page.request.get(`${TEST_API}/api/students/1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect((await row.json()).address).toBe("Example Street");
});

test("question configuration restores drafts and assigns home-based items", async ({
  page,
}) => {
  await login(page, "chairman");
  await page.goto("/super-admin/eccd-questions");
  await page.getByRole("button", { name: "Manage Questions" }).first().click();
  await page.getByRole("button", { name: "Add Question" }).click();
  await page.getByLabel("Question Text").fill("Example practice item.");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Manage Questions" }).first().click();
  await page.getByRole("button", { name: "Add Question" }).click();
  await expect(page.getByLabel("Question Text")).toHaveValue(
    "Example practice item.",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const row = page.locator("tr").filter({ hasText: "Example practice item." });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Home-based assessment" }).click();
  await expect(
    row.getByRole("button", { name: "Home-based assessment" }),
  ).toHaveAttribute("aria-pressed", "true");
  await row.getByRole("button", { name: "Home-based assessment" }).click();
  await expect(
    row.getByRole("button", { name: "Home-based assessment" }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("account changes replace the token and wrong current passwords retain inputs", async ({
  page,
}) => {
  await login(page, "chairman");
  await page.goto("/super-admin/settings");
  const oldToken = await session(page);
  await page.getByLabel("Current Password (Required):").fill("Incorrect123");
  await page
    .getByLabel("New Email (Optional):")
    .fill("changed-chairman@example.com");
  await page.getByRole("button", { name: "Update Account" }).click();
  await expect(page.getByText("Incorrect current password.")).toBeVisible();
  await expect(page).toHaveURL(/super-admin\/settings/);
  await page.reload();
  await expect(page.getByLabel("New Email (Optional):")).toHaveValue(
    "changed-chairman@example.com",
  );
  await page.getByLabel("Current Password (Required):").fill(PASSWORD);
  await page.getByRole("button", { name: "Update Account" }).click();
  await expect(page.getByText("Account updated successfully.")).toBeVisible();
  expect(await session(page)).not.toBe(oldToken);
  const token = await session(page);
  const data = await page.request.get(`${TEST_API}/api/chairman/students`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(data.ok()).toBeTruthy();
});

test("selected upload files survive reload and background upload reconnects", async ({
  page,
}) => {
  await login(page, "chairman");
  await page.goto("/super-admin/settings");
  await page
    .getByText("Additional appearance settings", { exact: true })
    .click();
  await page.getByLabel("Login background image").setInputFiles({
    name: "example.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBYkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByText("Selected image: example.png")).toBeVisible();
  await page.reload();
  await page
    .getByText("Additional appearance settings", { exact: true })
    .click();
  await expect(page.getByText("Selected image: example.png")).toBeVisible();
  let fail = true;
  await page.route("**/api/settings/upload-background", async (route) => {
    if (fail) return route.abort("connectionfailed");
    return route.continue();
  });
  await page.getByRole("button", { name: "Upload background" }).click();
  await expect(
    page.getByText("Image saved on this device and queued for reconnection."),
  ).toBeVisible();
  fail = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    page.getByRole("button", { name: "Upload background" }),
  ).toBeDisabled();
  const settings = await page.request.get(`${TEST_API}/api/settings`);
  expect((await settings.json()).login_background).toMatch(
    /^data:image\/png;base64,/,
  );
});

test("Excel import reports partial row failures and retains the workbook", async ({
  page,
}) => {
  await login(page, "adviser");
  await page.goto("/teacher/students");
  await page.getByRole("button", { name: "Import Excel" }).click();
  const response = await page.request.get(`${TEST_API}/__test/import-workbook`);
  expect(response.ok()).toBeTruthy();
  await page.getByLabel("Excel workbook").setInputFiles({
    name: "example.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await response.body(),
  });
  await page.getByRole("button", { name: "Import workbook" }).click();
  await expect(page.getByText("1 imported • 1 failed")).toBeVisible();
  await expect(page.getByText(/Row 4:/)).toBeVisible();
  await expect(page.getByText("Selected workbook: example.xlsx")).toBeVisible();
});
