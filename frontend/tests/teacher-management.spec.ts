import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { Section, Teacher } from "../src/types";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

interface Fixture {
  teachers: Teacher[];
  sections: Section[];
}
async function prepare(page: Page): Promise<Fixture> {
  await page.addInitScript(() => {
    localStorage.setItem(
      "user",
      JSON.stringify({
        id: 1,
        username: "Chairman",
        role: "super-admin",
        is_first_login: 0,
        allow_eccd_question_management: false,
      }),
    );
    localStorage.setItem(
      "token",
      `reference.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.reference`,
    );
  });
  const fixture: Fixture = {
    teachers: [
      {
        teacher_id: 1,
        user_id: 2,
        username: "incumbent",
        email: "incumbent@example.com",
        first_name: "Incumbent",
        last_name: "Adviser",
        employee_id: "T001",
        section_id: 1,
        class_name: "Section A",
        section_name: "Section A",
        role: "Primary Adviser",
        is_active: true,
        allow_eccd_question_management: false,
      },
      {
        teacher_id: 2,
        user_id: 3,
        username: "incoming",
        email: "incoming@example.com",
        first_name: "Incoming",
        last_name: "Teacher",
        employee_id: "T002",
        section_id: 2,
        class_name: "Section B",
        section_name: "Section B",
        role: "Primary Adviser",
        is_active: true,
        allow_eccd_question_management: false,
      },
    ],
    sections: [
      {
        section_id: 1,
        section_name: "Section A",
        adviser_teacher_id: 1,
        first_name: "Incumbent",
        last_name: "Adviser",
        role: "Primary Adviser",
        status: "Active",
      },
      {
        section_id: 2,
        section_name: "Section B",
        adviser_teacher_id: 2,
        first_name: "Incoming",
        last_name: "Teacher",
        role: "Primary Adviser",
        status: "Active",
      },
      {
        section_id: 3,
        section_name: "Section C",
        adviser_teacher_id: null,
        first_name: null,
        last_name: null,
        role: null,
        status: null,
      },
    ],
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data =
      path === "/api/settings"
        ? {
            system_title: "AMES",
            school_name: "Example School",
            principal_name: "Example Principal",
            primary_color: "#2563eb",
            secondary_color: "#111827",
            logo_url: "",
            current_school_year: "2026-2027",
            school_year_start_month: 8,
          }
        : path === "/api/teachers/active"
          ? fixture.teachers
          : path === "/api/chairman/sections"
            ? fixture.sections
            : [];
    await route.fulfill({ json: data });
  });
  return fixture;
}
async function openNew(page: Page) {
  await page.goto("/super-admin/teachers");
  await page.getByRole("button", { name: "Add New Teacher" }).click();
}
async function chooseSection(
  page: Page,
  name: string,
  label = "Class Name / Section",
) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
}
async function fillNew(page: Page, section: string) {
  await page.getByLabel("First Name", { exact: true }).fill("New");
  await page.getByLabel("Last Name", { exact: true }).fill("Teacher");
  await page.getByLabel("Email", { exact: true }).fill("new@example.com");
  await page.getByLabel("Employee ID (optional)", { exact: true }).fill("T003");
  await page.getByLabel("Password", { exact: true }).fill("Teacher123!");
  await chooseSection(page, section);
}
function deferred() {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test("Teacher management switch persists immediately and blocks concurrent saves", async ({
  page,
}) => {
  const fixture = await prepare(page);
  const gate = deferred();
  let count = 0;
  await page.route("**/api/chairman/teachers/1/permissions", async (route) => {
    count++;
    expect(route.request().method()).toBe("PUT");
    expect(route.request().postDataJSON()).toEqual({
      allow_eccd_question_management: true,
    });
    await gate.promise;
    fixture.teachers[0].allow_eccd_question_management = true;
    await route.fulfill({
      json: {
        message: "Permission updated",
        teacher_id: 1,
        allow_eccd_question_management: true,
      },
    });
  });
  await page.goto("/super-admin/teachers");
  await page.getByRole("button", { name: "Manage Access" }).first().click();
  await expect(
    page.getByRole("button", { name: "Save question access" }),
  ).toHaveCount(0);
  const toggle = page.getByRole("switch", {
    name: "Enable ECCD Question Management",
  });
  await toggle.evaluate((element) => {
    (element as HTMLInputElement).click();
    (element as HTMLInputElement).click();
  });
  await expect(toggle).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Done", exact: true }),
  ).toBeDisabled();
  await expect.poll(() => count).toBe(1);
  const key = "ames_draft_1_teacher_question_permission_1";
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) || "null")?.request.data,
      key,
    ),
  ).toEqual({ allow_eccd_question_management: true });
  gate.release();
  await expect(toggle).toBeEnabled();
  await expect(toggle).toBeChecked();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), key),
  ).toBeNull();
});

test("Teacher management permission draft survives 403 and reload, and reconnect sync", async ({
  page,
}) => {
  const fixture = await prepare(page);
  let mode: "forbidden" | "offline" | "saved" = "forbidden";
  await page.route("**/api/chairman/teachers/1/permissions", async (route) => {
    if (mode === "forbidden")
      return route.fulfill({
        status: 403,
        json: { detail: "Permission change denied" },
      });
    if (mode === "offline") return route.abort("internetdisconnected");
    fixture.teachers[0].allow_eccd_question_management = route
      .request()
      .postDataJSON().allow_eccd_question_management;
    await route.fulfill({
      json: {
        message: "Permission updated",
        teacher_id: 1,
        allow_eccd_question_management:
          fixture.teachers[0].allow_eccd_question_management,
      },
    });
  });
  await page.goto("/super-admin/teachers");
  await page.getByRole("button", { name: "Manage Access" }).first().click();
  const toggle = page.getByRole("switch", {
    name: "Enable ECCD Question Management",
  });
  await toggle.check();
  await expect(page.getByRole("alert")).toContainText(
    "Permission change denied",
  );
  await page.reload();
  await page.getByRole("button", { name: "Manage Access" }).first().click();
  await expect(toggle).toBeChecked();
  mode = "offline";
  await toggle.uncheck();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved for reconnection." }),
  ).toBeVisible();
  const key = "ames_draft_1_teacher_question_permission_1";
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) || "null")?.is_pending_sync,
      key,
    ),
  ).toBe(true);
  mode = "saved";
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), key))
    .toBeNull();
  await expect(toggle).not.toBeChecked();
});

test("Teacher management create validates required fields and defaults username to email", async ({
  page,
}) => {
  await prepare(page);
  const gate = deferred();
  let count = 0;
  await page.route("**/api/teachers/", async (route) => {
    count++;
    expect(route.request().postDataJSON()).toEqual({
      first_name: "New",
      last_name: "Teacher",
      email: "new@example.com",
      username: "new@example.com",
      employee_id: "T003",
      section_id: 3,
      password: "Teacher123!",
    });
    await gate.promise;
    await route.fulfill({
      status: 201,
      json: {
        success: true,
        message: "Teacher account successfully provisioned.",
        user_id: 4,
        teacher_id: 3,
      },
    });
  });
  await openNew(page);
  await expect(
    page.getByLabel("Employee ID (optional)", { exact: true }),
  ).not.toHaveAttribute("required", "");
  await page
    .locator("#chairman-teacher-form")
    .evaluate((element) =>
      element.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
  await expect(page.getByRole("alert")).toContainText(
    "Please fill in all required fields",
  );
  expect(count).toBe(0);
  await fillNew(page, "Section C");
  await page.locator("#chairman-teacher-form").evaluate((element) => {
    element.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    element.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "New Teacher", exact: true }),
  ).toBeVisible();
  await expect.poll(() => count).toBe(1);
  gate.release();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("ames_draft_1_teacher_new")),
  ).toBeNull();
});

test("Teacher management create handover requires explicit confirmation and retains cancelled inputs", async ({
  page,
}) => {
  await prepare(page);
  let count = 0;
  await page.route("**/api/teachers/", (route) => {
    count++;
    return route.fulfill({
      status: 201,
      json: { success: true, message: "Created", user_id: 4, teacher_id: 3 },
    });
  });
  await openNew(page);
  await fillNew(page, "Section A");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const prompt = page.getByRole("dialog", {
    name: "Confirm Section Handover",
    exact: true,
  });
  await expect(prompt).toContainText("Incumbent Adviser");
  expect(count).toBe(0);
  await prompt.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("First Name", { exact: true })).toHaveValue(
    "New",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await prompt
    .getByRole("button", { name: "Confirm Handover", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(count).toBe(1);
});

test("Teacher management edit sends class_name and confirms only another incumbent", async ({
  page,
}) => {
  await prepare(page);
  let count = 0;
  await page.route("**/api/teachers/3", async (route) => {
    count++;
    expect(route.request().postDataJSON()).toEqual({
      first_name: "Incoming",
      last_name: "Teacher",
      username: "incoming",
      email: "incoming@example.com",
      employee_id: "T002",
      class_name: "Section A",
    });
    await route.fulfill({ json: { message: "Teacher successfully updated." } });
  });
  await page.goto("/super-admin/teachers");
  await page.getByTitle("Edit Teacher", { exact: true }).nth(1).click();
  await expect(page.getByLabel("Username", { exact: true })).toHaveAttribute(
    "required",
    "",
  );
  await expect(page.getByLabel("Last Name (optional)")).not.toHaveAttribute(
    "required",
    "",
  );
  await chooseSection(page, "Section A");
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Confirm Section Handover", exact: true }),
  ).toBeVisible();
  expect(count).toBe(0);
  await page
    .getByRole("button", { name: "Confirm Handover", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(count).toBe(1);
});

test("Teacher management section creation selects the result in new and edit forms", async ({
  page,
}) => {
  const fixture = await prepare(page);
  let count = 0;
  await page.route("**/api/chairman/sections", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const payload = route.request().postDataJSON() as { section_name: string };
    expect(Object.keys(payload)).toEqual(["section_name"]);
    count++;
    const created: Section = {
      section_id: count + 3,
      section_name: payload.section_name,
      adviser_teacher_id: null,
      first_name: null,
      last_name: null,
      role: null,
      status: null,
    };
    fixture.sections.push(created);
    await route.fulfill({
      status: 201,
      json: {
        section_id: created.section_id,
        section_name: created.section_name,
        adviser_teacher_id: null,
        created_at: "2026-10-12T00:00:00Z",
      },
    });
  });
  await openNew(page);
  for (const name of ["Mabini", "Rizal"]) {
    await page
      .getByRole("combobox", { name: "Class Name / Section", exact: true })
      .click();
    await page
      .getByRole("option", { name: "+ Add New Section", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Create New Section",
      exact: true,
    });
    await dialog
      .getByLabel("Section Identifier (e.g. A, B, Mabini)")
      .fill(` ${name} `);
    await expect(dialog.locator("footer button")).toHaveText([
      "Cancel",
      "Create Section",
    ]);
    await dialog
      .getByRole("button", { name: "Create Section", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("combobox", { name: "Class Name / Section", exact: true }),
    ).toHaveText(name);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    if (name === "Mabini")
      await page.getByTitle("Edit Teacher", { exact: true }).first().click();
  }
  expect(count).toBe(2);
});

test("Teacher management section menu deletion keeps selection unchanged and honors 409", async ({
  page,
}) => {
  const fixture = await prepare(page);
  let occupied = true;
  let count = 0;
  await page.route("**/api/chairman/sections/3", async (route) => {
    count++;
    expect(route.request().method()).toBe("DELETE");
    if (occupied)
      return route.fulfill({
        status: 409,
        json: { detail: "Transfer the section's students before deleting it." },
      });
    fixture.sections = fixture.sections.filter(
      (section) => section.section_id !== 3,
    );
    await route.fulfill({ json: { message: "Section deleted successfully" } });
  });
  await openNew(page);
  await chooseSection(page, "Section A");
  await page
    .getByRole("combobox", { name: "Class Name / Section", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete section Section C", exact: true })
    .click();
  const prompt = page.getByRole("dialog", {
    name: "Delete section?",
    exact: true,
  });
  await prompt.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(prompt.getByRole("alert")).toContainText(
    "Transfer the section's students",
  );
  expect(count).toBe(1);
  occupied = false;
  await prompt.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Class Name / Section", exact: true })
    .click();
  await expect(
    page.getByRole("option", { name: "Section C", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("option", { name: "Section A", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Class Name / Section", exact: true }),
  ).toHaveText("Section A");
});

for (const width of [320, 768, 1280]) {
  test(`Teacher management adviser takeover at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await prepare(page);
    const assignments: number[] = [];
    await page.route(
      "**/api/chairman/sections/1/assign-teacher",
      async (route) => {
        const data = route.request().postDataJSON() as { teacher_id: number };
        expect(data).toEqual({ teacher_id: 2 });
        assignments.push(data.teacher_id);
        await route.fulfill({
          json: {
            message: "Teacher successfully assigned to section.",
            section_id: 1,
          },
        });
      },
    );
    await page.goto("/super-admin/teachers");
    await page.getByRole("button", { name: "Manage Access" }).nth(1).click();
    await page.getByText("Section assignment", { exact: true }).click();
    await expect(
      page.getByRole("combobox", { name: "Assignment role" }),
    ).toHaveCount(0);
    await expect(page.getByText("Substitute", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("switch", { name: "Enable ECCD Question Management" }),
    ).toBeVisible();
    await chooseSection(page, "Section A", "Section");
    await expect(
      page.getByText(
        "Section Section A is currently assigned to Incumbent Adviser. Assigning this section will transfer the adviser role to this teacher.",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Assign teacher", exact: true })
      .click();
    const prompt = page.getByRole("dialog", {
      name: "Confirm Section Handover",
      exact: true,
    });
    await expect(prompt).toBeVisible();
    expect(assignments).toEqual([]);
    await prompt.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(assignments).toEqual([]);
    await page
      .getByRole("button", { name: "Assign teacher", exact: true })
      .click();
    await prompt
      .getByRole("button", { name: "Confirm Handover", exact: true })
      .click();
    await expect.poll(() => assignments.length).toBe(1);
    expect(assignments).toEqual([2]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("Teacher management unassigned section saves directly and retains failed assignment draft", async ({
  page,
}) => {
  await prepare(page);
  let fail = true;
  const assignments: number[] = [];
  await page.route(
    "**/api/chairman/sections/3/assign-teacher",
    async (route) => {
      expect(route.request().postDataJSON()).toEqual({ teacher_id: 2 });
      assignments.push(2);
      await route.fulfill(
        fail
          ? {
              status: 403,
              json: { detail: "Assignment is temporarily locked." },
            }
          : {
              json: {
                message: "Teacher successfully assigned to section.",
                section_id: 3,
              },
            },
      );
    },
  );
  await page.goto("/super-admin/teachers");
  await page.getByRole("button", { name: "Manage Access" }).nth(1).click();
  await page.getByText("Section assignment", { exact: true }).click();
  await chooseSection(page, "Section C", "Section");
  await page
    .getByRole("button", { name: "Assign teacher", exact: true })
    .click();
  await expect(
    page.getByText("Assignment is temporarily locked.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Confirm Section Handover", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Manage Access" }).nth(1).click();
  await page.getByText("Section assignment", { exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Section", exact: true }),
  ).toHaveText("Section C");
  fail = false;
  await page
    .getByRole("button", { name: "Assign teacher", exact: true })
    .click();
  await expect.poll(() => assignments.length).toBe(2);
});

test("Teacher management switch matches the legacy control in both states", async ({
  page,
  context,
}, info) => {
  const reference = await context.newPage();
  await prepare(page);
  await prepare(reference);
  await Promise.all([
    page.goto("/super-admin/teachers"),
    reference.goto("http://localhost:5187/chairman/teachers?role=super-admin"),
  ]);
  await page.getByRole("button", { name: "Manage Access" }).first().click();
  await reference
    .getByRole("button", { name: "Manage Access" })
    .first()
    .click();
  const actual = page.getByRole("switch").locator("..");
  const expected = reference.locator(".MuiSwitch-root");
  for (const state of ["off", "on"]) {
    if (state === "on") {
      await page.getByRole("switch").check();
      await reference.locator(".MuiSwitch-input").click();
      await expect(reference.locator(".MuiSwitch-input")).toBeChecked();
    }
    await page.mouse.move(0, 0);
    await reference.mouse.move(0, 0);
    for (const target of [page, reference])
      await target.evaluate(async () => {
        await Promise.allSettled(
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.effect?.getComputedTiming().iterations !== Infinity,
            )
            .map((animation) => animation.finished),
        );
      });
    const snapshot = `teacher-permission-${state}.png`;
    // Isolate the control at the same whole-pixel position in both dialogs.
    // Assignment controls intentionally make the current dialog taller.
    for (const control of [actual, expected])
      await control.evaluate((element) => {
        Object.assign((element as HTMLElement).style, {
          position: "fixed",
          left: `${Math.floor(innerWidth / 2)}px`,
          top: `${Math.floor(innerHeight / 2)}px`,
          transform: "none",
          margin: "0",
          backgroundColor: "white",
          zIndex: "1000",
        });
      });
    const baseline = info.snapshotPath(snapshot);
    await mkdir(dirname(baseline), { recursive: true });
    await writeFile(baseline, await expected.screenshot());
    expect(await actual.screenshot()).toMatchSnapshot(snapshot, {
      threshold: 0.1,
      maxDiffPixels: 0,
    });
  }
  await reference.close();
});

test("Teacher management own-adviser edit skips handover and failed edits recover after reload", async ({
  page,
}) => {
  await prepare(page);
  let failed = true;
  await page.route("**/api/teachers/2", (route) => {
    expect(route.request().postDataJSON().class_name).toBe("Section A");
    return route.fulfill({
      status: failed ? 403 : 200,
      json: failed
        ? { detail: "Teacher changes denied" }
        : { message: "Teacher successfully updated." },
    });
  });
  await page.goto("/super-admin/teachers");
  await page.getByTitle("Edit Teacher", { exact: true }).first().click();
  await page.getByLabel("First Name", { exact: true }).fill("Recovered");
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Confirm Section Handover", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("Teacher changes denied");
  await page.reload();
  await page.getByTitle("Edit Teacher", { exact: true }).first().click();
  await expect(page.getByLabel("First Name", { exact: true })).toHaveValue(
    "Recovered",
  );
  failed = false;
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("ames_draft_1_teacher_2")),
  ).toBeNull();
});

test("Teacher management pending section creation selects its result after reconnect", async ({
  page,
}) => {
  const fixture = await prepare(page);
  let offline = true;
  await page.route("**/api/chairman/sections", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    if (offline) return route.abort("internetdisconnected");
    fixture.sections.push({
      section_id: 4,
      section_name: "Mabini",
      adviser_teacher_id: null,
      first_name: null,
      last_name: null,
      role: null,
      status: null,
    });
    await route.fulfill({
      status: 201,
      json: {
        section_id: 4,
        section_name: "Mabini",
        adviser_teacher_id: null,
        created_at: "2026-10-12T00:00:00Z",
      },
    });
  });
  await openNew(page);
  await page
    .getByRole("combobox", { name: "Class Name / Section", exact: true })
    .click();
  await page
    .getByRole("option", { name: "+ Add New Section", exact: true })
    .click();
  await page
    .getByLabel("Section Identifier (e.g. A, B, Mabini)")
    .fill("Mabini");
  await page
    .getByRole("button", { name: "Create Section", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "Create New Section", exact: true })
      .getByRole("alert"),
  ).toContainText("Saved for reconnection.");
  offline = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    page.getByRole("dialog", { name: "Create New Section", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Class Name / Section", exact: true }),
  ).toHaveText("Mabini");
});

test("Teacher management forms and section menus remain usable across breakpoints", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/super-admin/teachers");
  for (const width of [320, 390, 599, 600, 899, 900, 1200, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
      `teacher table at ${width}px`,
    ).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Add New Teacher" }).click();
    await page
      .getByRole("combobox", { name: "Class Name / Section", exact: true })
      .click();
    await page
      .getByRole("option", { name: "+ Add New Section", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Create New Section",
      exact: true,
    });
    await expect(
      dialog.getByRole("button", { name: "Create Section", exact: true }),
    ).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
      `teacher/section dialogs at ${width}px`,
    ).toBeLessThanOrEqual(1);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("dialog", { name: "New Teacher", exact: true })
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
  }
});
