import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { Section, SessionResponse, Teacher } from "../src/types";

const backend = "http://127.0.0.1:8772";
const errors: string[] = [];

async function chooseSection(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Class Name / Section" }).click();
  await page
    .getByRole("dialog", { name: "Select a Section", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
}
async function fillNew(page: Page) {
  await page.getByRole("button", { name: "Add New Teacher" }).click();
  await page.getByLabel("First Name", { exact: true }).fill("Incoming");
  await page.getByLabel("Last Name", { exact: true }).fill("Teacher");
  await page.getByLabel("Email", { exact: true }).fill("incoming@example.com");
  await page.getByLabel("Password", { exact: true }).fill("temporary");
  await chooseSection(page, "Test A");
}
async function pauseWrite(page: Page, path: string) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**${path}`, async (route) => {
    if (route.request().method() === "GET") return route.continue();
    await gate;
    await route.continue();
  });
  return release;
}

test.beforeEach(async ({ page, request }) => {
  errors.length = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  expect((await request.post(`${backend}/__test/reset`)).ok()).toBeTruthy();
  const response = await request.post(`${backend}/api/auth/login`, {
    data: { email: "chairman@example.com", password: "Example123" },
  });
  expect(response.ok()).toBeTruthy();
  const session = (await response.json()) as SessionResponse;
  await page.goto("/login");
  await page.evaluate((value) => {
    localStorage.setItem("user", JSON.stringify(value.user));
    localStorage.setItem("token", value.token);
  }, session);
  await page.goto("/super-admin/teachers");
  await expect(
    page.getByRole("cell", { name: "Test Adviser", exact: true }),
  ).toBeVisible();
});
test.afterEach(async ({ page }) => {
  // Saves trigger a directory refresh. Finish intercepted responses before
  // Playwright disposes the request context during page teardown.
  await page.unrouteAll({ behavior: "wait" });
  expect(errors).toEqual([]);
});

test("section picker pins header and footer, scrolls long lists, and isolates rename/delete actions", async ({
  page,
  request,
}, info) => {
  const token = await page.evaluate(() => localStorage.getItem("token"));
  for (let index = 1; index <= 12; index++) {
    const created = await request.post(`${backend}/api/chairman/sections`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { section_name: `Extra ${String(index).padStart(2, "0")}` },
    });
    expect(created.status()).toBe(201);
  }
  await page.reload();
  await page.getByRole("button", { name: "Add New Teacher" }).click();
  const selector = page.getByRole("combobox", {
    name: "Class Name / Section",
    includeHidden: true,
  });
  await selector.click();
  const picker = page.getByRole("dialog", {
    name: "Select a Section",
    exact: true,
  });
  const list = picker.getByRole("group", { name: "Sections", exact: true });
  const header = picker.getByRole("heading", { name: "Select a Section" });
  const add = picker.getByRole("button", {
    name: "+ Add New Section",
    exact: true,
  });
  await expect(list).toHaveCSS("overflow-y", "auto");
  await expect(list).toHaveCSS("overscroll-behavior-y", "contain");
  const before = {
    header: await header.boundingBox(),
    add: await add.boundingBox(),
  };
  expect(
    await list.evaluate((element) => element.clientHeight),
  ).toBeLessThanOrEqual(224);
  await page.keyboard.press("End");
  await expect(
    picker.getByRole("button", { name: "Test B", exact: true }),
  ).toBeFocused();
  expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(
    0,
  );
  expect((await header.boundingBox())!.y).toBeCloseTo(before.header!.y, 0);
  expect((await add.boundingBox())!.y).toBeCloseTo(before.add!.y, 0);
  await page.keyboard.press("Home");
  await expect(
    picker.getByRole("button", { name: "Extra 01", exact: true }),
  ).toBeFocused();
  await page.setViewportSize({
    width: page.viewportSize()!.width,
    height: 600,
  });
  await expect(header).toBeInViewport({ ratio: 1 });
  await expect(add).toBeInViewport({ ratio: 1 });
  const bounds = await picker.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await picker.screenshot({
    path: info.outputPath("scrollable-section-picker.png"),
  });
  await picker
    .getByRole("button", { name: "Edit section Extra 01", exact: true })
    .click();
  const input = picker.getByRole("textbox", {
    name: "Section name for Extra 01",
  });
  await expect(input).toBeFocused();
  await expect(selector).toHaveText(/Select a Section/);
  await input.fill("   ");
  await input.press("Enter");
  await expect(picker.getByRole("alert")).toContainText(
    "Enter a section name.",
  );
  await input.fill(" test b ");
  await picker.getByRole("button", { name: "Save section name" }).click();
  await expect(picker.getByRole("alert")).toContainText("already exists");
  await input.fill("  Acacia  ");
  const release = await pauseWrite(page, "/api/sections/3");
  await input.press("Enter");
  await expect(
    picker.getByRole("status", { name: "Saving section name" }),
  ).toBeVisible();
  await expect(
    picker.getByRole("button", { name: "Cancel section rename" }),
  ).toBeDisabled();
  await expect(
    page.locator('button[form="chairman-teacher-form"]'),
  ).toBeDisabled();
  release();
  await expect(
    picker.getByRole("button", { name: "Acacia", exact: true }),
  ).toBeVisible();
  await expect(selector).toHaveText(/Select a Section/);
  const rows = (await (
    await request.get(`${backend}/api/chairman/sections`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json()) as Section[];
  expect(rows.find((row) => row.section_id === 3)!.section_name).toBe("Acacia");
  await picker
    .getByRole("button", { name: "Edit section Acacia", exact: true })
    .click();
  const renamedInput = picker.getByRole("textbox");
  await renamedInput.fill("Do not save");
  await renamedInput.press("Escape");
  await expect(picker).toBeVisible();
  await expect(
    picker.getByRole("button", { name: "Acacia", exact: true }),
  ).toBeFocused();
  await expect(selector).toHaveText(/Select a Section/);
  await picker
    .getByRole("button", { name: "Delete section Acacia", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Delete section?",
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(selector).toHaveText(/Select a Section/);
  await selector.click();
  await picker.getByRole("button", { name: "Acacia", exact: true }).click();
  await expect(selector).toHaveText(/Acacia/);
  await selector.click();
  await expect(
    picker.getByRole("button", { name: "Acacia", exact: true }),
  ).toBeFocused();
  await expect(
    picker.getByRole("button", { name: "Acacia", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await add.click();
  await expect(
    page.getByRole("dialog", { name: "Create New Section", exact: true }),
  ).toBeVisible();
});

test("section rename handles server conflicts and retains drafts through reload and offline sync", async ({
  page,
  request,
}) => {
  await page.getByRole("button", { name: "Add New Teacher" }).click();
  const selector = page.getByRole("combobox", {
    name: "Class Name / Section",
    includeHidden: true,
  });
  await selector.click();
  const picker = page.getByRole("dialog", {
    name: "Select a Section",
    exact: true,
  });
  await picker
    .getByRole("button", { name: "Edit section Test A", exact: true })
    .click();
  let input = picker.getByRole("textbox");
  await input.fill("Recovered section");
  await page.route("**/api/sections/1", (route) =>
    route.fulfill({
      status: 409,
      json: { detail: "Section name already exists." },
    }),
  );
  await input.press("Enter");
  await expect(picker.getByRole("alert")).toContainText("already exists");
  await expect(input).toHaveValue("Recovered section");
  await page.unroute("**/api/sections/1");
  await page.reload();
  await page.getByRole("button", { name: "Add New Teacher" }).click();
  await selector.click();
  await picker
    .getByRole("button", { name: "Edit section Test A", exact: true })
    .click();
  input = picker.getByRole("textbox");
  await expect(input).toHaveValue("Recovered section");
  await page.context().setOffline(true);
  await input.press("Enter");
  await expect(picker.getByRole("alert")).toContainText("after reconnection");
  const draftKey = "ames_draft_1_section_rename_1";
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).is_pending_sync,
      draftKey,
    ),
  ).toBe(true);
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    picker.getByRole("button", { name: "Recovered section", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), draftKey),
  ).toBeNull();
  const token = await page.evaluate(() => localStorage.getItem("token"));
  const rows = (await (
    await request.get(`${backend}/api/chairman/sections`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json()) as Section[];
  expect(rows.find((row) => row.section_id === 1)!.section_name).toBe(
    "Recovered section",
  );
  await expect(selector).toHaveText(/Select a Section/);
});

test("balanced forms, real creation handover and archive restore refresh both tables", async ({
  page,
}, info) => {
  await fillNew(page);
  await expect(page.getByLabel("Username", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Last Name")).toHaveAttribute("required");
  const positions = await Promise.all(
    ["First Name", "Last Name", "Email", "Employee ID (optional)"].map((name) =>
      page.getByLabel(name, { exact: true }).boundingBox(),
    ),
  );
  if (info.project.name === "desktop") {
    expect(positions[0]!.y).toBe(positions[1]!.y);
    expect(positions[2]!.y).toBe(positions[3]!.y);
    expect(positions[0]!.x).toBe(positions[2]!.x);
  } else {
    expect(positions[1]!.y).toBeGreaterThan(positions[0]!.y);
  }
  await page
    .getByRole("dialog", { name: "New Teacher", exact: true })
    .screenshot({ path: info.outputPath("new-teacher.png") });
  const release = await pauseWrite(page, "/api/teachers/");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const handover = page.getByRole("dialog", {
    name: "Confirm Section Handover",
  });
  await expect(handover).toContainText("Test A");
  await expect(handover).toContainText("Test Adviser");
  await handover.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await handover.getByRole("button", { name: "Confirm Handover" }).click();
  await expect(handover.getByRole("status")).toBeVisible();
  await expect(handover.getByRole("button", { name: "Cancel" })).toBeDisabled();
  release();
  await expect(
    page.getByRole("dialog", { name: "New Teacher", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: "incoming@example.com" }),
  ).toContainText("Test A");
  await expect(
    page.getByRole("cell", { name: "Test Adviser", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "View Archive" }).click();
  const archive = page.getByRole("dialog", {
    name: "Archived Teacher Accounts",
  });
  await expect(
    archive.getByRole("cell", { name: "Test Adviser", exact: true }),
  ).toBeVisible();
  await archive.getByRole("button", { name: "Restore Test" }).click();
  const restore = page.getByRole("dialog", {
    name: "Restore Teacher Account",
    exact: true,
  });
  await expect(restore).toContainText("manually assigned");
  const restoreButton = restore.getByRole("button", {
    name: "Restore Account",
    exact: true,
  });
  await expect(restoreButton).toHaveCSS("background-color", "rgb(79, 70, 229)");
  await restore.screenshot({
    path: info.outputPath("restore-confirmation.png"),
  });
  const releaseRestore = await pauseWrite(page, "/api/teachers/2/unarchive");
  await restoreButton.click();
  await expect(restore.getByRole("status")).toBeVisible();
  releaseRestore();
  await expect(restore).toHaveCount(0);
  await expect(
    archive.getByRole("cell", { name: "Test Adviser", exact: true }),
  ).toHaveCount(0);
  // The background active table updates even while the archive remains open.
  await expect(
    page
      .locator("table")
      .first()
      .getByRole("cell", { name: "Test Adviser", exact: true }),
  ).toHaveCount(1);
  await archive.getByRole("button", { name: "Close", exact: true }).click();
  const restoredRow = page.getByRole("row").filter({
    has: page.getByRole("cell", { name: "Test Adviser", exact: true }),
  });
  await expect(restoredRow.locator("td").nth(1)).toBeEmpty();
  await page.screenshot({
    path: info.outputPath("restored-table.png"),
    fullPage: true,
  });
});

test("edit transfer uses email and archive failures remain retryable", async ({
  page,
  request,
}) => {
  await page
    .getByRole("button", { name: "Edit Test", exact: true })
    .first()
    .click();
  const form = page.getByRole("dialog", { name: "Edit Teacher", exact: true });
  await expect(form.getByLabel("Username", { exact: true })).toHaveCount(0);
  await expect(form.getByLabel("Last Name")).toHaveAttribute("required");
  await form.getByLabel("Last Name").fill("Updated");
  await form.getByLabel("Email", { exact: true }).fill("edited@example.com");
  await chooseSection(page, "Test B");
  await form.getByRole("button", { name: "Save Changes" }).click();
  const handover = page.getByRole("dialog", {
    name: "Confirm Section Handover",
  });
  await expect(handover).toContainText("Other Teacher");
  await handover.getByRole("button", { name: "Confirm Handover" }).click();
  await expect(form).toHaveCount(0);
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "edited@example.com" })
      .locator("td")
      .nth(1),
  ).toHaveText("Test B");
  const token = await page.evaluate(() => localStorage.getItem("token"));
  const teachers = (await (
    await request.get(`${backend}/api/teachers/active`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json()) as { user_id: number; email: string }[];
  const teacher = teachers.find((row) => row.user_id === 2);
  expect(teacher?.email).toBe("edited@example.com");
  expect(teacher).not.toHaveProperty("username");
  await expect(
    page.getByRole("cell", { name: "Other Teacher", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Archive Test", exact: true })
    .first()
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Archive Teacher Account",
    exact: true,
  });
  await expect(confirmation).toContainText("revoke active access");
  await expect(confirmation).toContainText("release their assigned section");
  await page.route("**/api/teachers/2/archive", (route) =>
    route.fulfill({ status: 500, json: { detail: "Please retry archiving." } }),
  );
  await confirmation
    .getByRole("button", { name: "Archive Account", exact: true })
    .click();
  await expect(confirmation).toContainText("Please retry archiving.");
  await page.unroute("**/api/teachers/2/archive");
  const release = await pauseWrite(page, "/api/teachers/2/archive");
  await confirmation
    .getByRole("button", { name: "Archive Account", exact: true })
    .click();
  await expect(confirmation.getByRole("status")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(confirmation).toBeVisible();
  release();
  await expect(confirmation).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "edited@example.com", exact: true }),
  ).toHaveCount(0);
});

test("failed creation retains inputs and password across reload", async ({
  page,
}) => {
  await fillNew(page);
  await page.route("**/api/teachers/", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 500,
          json: { detail: "Creation temporarily unavailable." },
        })
      : route.continue(),
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Confirm Handover" }).click();
  await expect(
    page.getByRole("dialog", { name: "New Teacher", exact: true }),
  ).toContainText("Creation temporarily unavailable.");
  await page.reload();
  await expect(
    page.getByRole("cell", { name: "Test Adviser", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add New Teacher" }).click();
  await expect(page.getByLabel("First Name", { exact: true })).toHaveValue(
    "Incoming",
  );
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    "incoming@example.com",
  );
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
    "temporary",
  );
  await page.unroute("**/api/teachers/");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Confirm Handover" }).click();
  await expect(
    page.getByRole("cell", { name: "incoming@example.com", exact: true }),
  ).toBeVisible();
});

test("handover tolerates missing incumbent names", async ({ page }) => {
  await page.route("**/api/chairman/sections", async (route) => {
    const response = await route.fetch();
    const sections = (await response.json()) as Record<string, unknown>[];
    await route.fulfill({
      json: sections.map((section) => ({
        ...section,
        first_name: null,
        last_name: null,
      })),
    });
  });
  await page.reload();
  await fillNew(page);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const handover = page.getByRole("dialog", {
    name: "Confirm Section Handover",
  });
  await expect(handover).toContainText("another teacher");
  await handover.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("First Name", { exact: true })).toHaveValue(
    "Incoming",
  );
});

test("moving a teacher vacates the old section for direct assignment without archiving them", async ({
  page,
  request,
}) => {
  await page
    .getByRole("button", { name: "Edit Test", exact: true })
    .first()
    .click();
  await chooseSection(page, "Test B");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await page.getByRole("button", { name: "Confirm Handover" }).click();
  await expect(
    page.getByRole("dialog", { name: "Edit Teacher", exact: true }),
  ).toHaveCount(0);
  const token = await page.evaluate(() => localStorage.getItem("token"));
  const headers = { Authorization: `Bearer ${token}` };
  const sections = (await (
    await request.get(`${backend}/api/chairman/sections`, { headers })
  ).json()) as Section[];
  const vacated = sections.find((section) => section.section_name === "Test A");
  expect(vacated?.adviser_teacher_id).toBeNull();
  expect(vacated?.status).toBeNull();

  await page
    .getByRole("row")
    .filter({
      has: page.getByRole("cell", { name: "Test Substitute", exact: true }),
    })
    .getByRole("button", { name: "Edit Test", exact: true })
    .click();
  await chooseSection(page, "Test A");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(
    page.getByRole("dialog", { name: "Edit Teacher", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Confirm Section Handover" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("row").filter({
      has: page.getByRole("cell", { name: "Test Adviser", exact: true }),
    }),
  ).toContainText("Test B");
  await expect(
    page.getByRole("row").filter({
      has: page.getByRole("cell", { name: "Test Substitute", exact: true }),
    }),
  ).toContainText("Test A");
  const archived = (await (
    await request.get(`${backend}/api/teachers/archived`, { headers })
  ).json()) as Teacher[];
  expect(archived.some((teacher) => teacher.teacher_id === 1)).toBe(false);
});

test("editing the current adviser does not ask for a handover", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Edit Test", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(
    page.getByRole("dialog", { name: "Edit Teacher", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Confirm Section Handover" }),
  ).toHaveCount(0);
});

for (const ownership of ["null", "zero", "inactive"] as const) {
  test(`add teacher ignores ${ownership} section ownership in handover check`, async ({
    page,
  }) => {
    await page.route("**/api/chairman/sections", async (route) => {
      const response = await route.fetch();
      const sections = (await response.json()) as Section[];
      await route.fulfill({
        json: sections.map((section) =>
          section.section_name !== "Test A"
            ? section
            : {
                ...section,
                adviser_teacher_id:
                  ownership === "null"
                    ? null
                    : ownership === "zero"
                      ? 0
                      : section.adviser_teacher_id,
                status: ownership === "inactive" ? "Inactive" : "Active",
              },
        ),
      });
    });
    await page.reload();
    await fillNew(page);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "New Teacher", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("dialog", { name: "Confirm Section Handover" }),
    ).toHaveCount(0);
  });
}
