import { mockSession, expectNoStoredCredentials } from "./helpers/session";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { SessionUser, Student } from "../src/types";
import type { ParentProfileValues } from "../src/utils/parentProfile";

const key = "ames_draft_7_parent_profile_1";
const otherKey = "ames_draft_7_parent_profile_2";
interface StoredProfile {
  values: ParentProfileValues;
  baseline?: ParentProfileValues;
  revision: string;
  is_pending_sync: boolean;
  error?: string;
  request?: { data: unknown };
}
interface PortalState {
  child: Student;
  requests: Record<string, unknown>[];
  status: number;
  network: boolean;
  reads: number;
  rosterReads: number;
  wait?: Promise<void>;
}

async function portal(page: Page, teacher = false) {
  const state: PortalState = {
    status: 200,
    network: false,
    requests: [],
    reads: 0,
    rosterReads: 0,
    child: {
      student_id: 1,
      masked_lrn: "********7890",
      first_name: "Sample",
      middle_name: null,
      last_name: "Child",
      full_name: "Sample Child",
      date_of_birth: "2021-01-10",
      gender: "Female",
      section_id: 1,
      section_name: "Test A",
      school_year: "2026-2027",
      decimal_age: 5.5,
      is_active: true,
      address: "Old address",
      emergency_contact: null,
      handedness: "Right",
      num_of_siblings: 1,
      birth_order: "First",
      profile_completeness: 90,
      parent_names: "Test Mother",
      parents: [],
      mother_name: "Test Mother",
      mother_age: 35,
      mother_occ: "Teacher",
      mother_educ: "College",
      allow_parent_view_student_info: true,
      allow_parent_edit_student_info: true,
    },
  };
  const user: SessionUser = {
    id: teacher ? 2 : 7,
    first_name: "Sample",
    last_name: teacher ? "Teacher" : "Parent",
    full_name: teacher ? "Sample Teacher" : "Sample Parent",
    email: "sample@example.com",
    role: teacher ? "admin" : "user",
    is_first_login: 0,
    section_id: teacher ? 1 : null,
    section_name: teacher ? "Test A" : null,
    allow_eccd_question_management: false,
  };
  await page.addInitScript(
    ({ unrelated }) => {
      if (!localStorage.getItem(unrelated))
        localStorage.setItem(unrelated, "another child's unsaved edits");
    },
    { unrelated: otherKey },
  );
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "PUT" && path === "/api/parents/children/1") {
      const data = request.postDataJSON() as Record<string, unknown>;
      state.requests.push(data);
      if (state.wait) await state.wait;
      if (state.network) return route.abort("failed");
      if (state.status === 200) Object.assign(state.child, data);
      return route.fulfill({
        status: state.status,
        json:
          state.status === 200
            ? { message: "Updated" }
            : { detail: "Save rejected by server" },
      });
    }
    if (path === "/api/students/my-child")
      return route.fulfill({ json: [state.child] });
    if (path === "/api/students/1") {
      state.reads++;
      return route.fulfill({ json: state.child });
    }
    if (path === "/api/students/") {
      state.rosterReads++;
      return route.fulfill({ json: [state.child] });
    }
    if (path === "/api/students/archived") return route.fulfill({ json: [] });
    if (path === "/api/sections/")
      return route.fulfill({
        json: [{ section_id: 1, section_name: "Test A" }],
      });
    if (path === "/api/teachers/dashboard-filters")
      return route.fulfill({ json: { sections: ["Test A"] } });
    if (path === "/api/teachers/active")
      return route.fulfill({
        json: [{ user_id: 2, first_name: "Sample", last_name: "Teacher" }],
      });
    if (path === "/api/messages/contacts")
      return route.fulfill({ json: { myId: user.id, contacts: [] } });
    if (path === "/api/messages/unread-count")
      return route.fulfill({ json: { unreadCount: 0 } });
    return route.fulfill({ json: {} });
  });
  await mockSession(page, user);
  await page.goto(teacher ? "/teacher/students" : "/parent/childinformation");
  await expect(
    teacher
      ? page.getByTitle("Edit Student")
      : page.locator('input[name="address"]'),
  ).toBeVisible();
  await expectNoStoredCredentials(page);
  return state;
}
const address = (page: Page) => page.locator('input[name="address"]');
const save = (page: Page) =>
  page
    .getByRole("button", { name: "Save Changes", exact: true })
    .first()
    .click();
const stored = (page: Page) =>
  page.evaluate(
    (k) =>
      JSON.parse(localStorage.getItem(k) || "null") as StoredProfile | null,
    key,
  );

test("address-only save excludes guardians and clears only the confirmed draft", async ({
  page,
}) => {
  const state = await portal(page);
  await address(page).fill("Updated address");
  await save(page);
  await expect(
    page.getByText("Child details successfully updated!"),
  ).toBeVisible();
  expect(state.requests).toEqual([{ address: "Updated address" }]);
  expect(await stored(page)).toBeNull();
  expect(await page.evaluate((k) => localStorage.getItem(k), otherKey)).toBe(
    "another child's unsaved edits",
  );
  await save(page);
  await expect(page.getByText("No changes to save.")).toBeVisible();
  expect(state.requests).toHaveLength(1);
});

test("baseline survives reload and concurrent guardian changes are excluded", async ({
  page,
}) => {
  const state = await portal(page);
  await address(page).fill("Draft address");
  expect((await stored(page))?.baseline?.mother_name).toBe("Test Mother");
  state.child.mother_name = "Newer Mother";
  await page.reload();
  await expect(address(page)).toHaveValue("Draft address");
  await save(page);
  await expect(
    page.getByText("Child details successfully updated!"),
  ).toBeVisible();
  expect(state.requests).toEqual([{ address: "Draft address" }]);
  await expect(page.locator('input[name="mother_name"]')).toHaveValue(
    "Newer Mother",
  );
});

for (const status of [400, 403, 422]) {
  test(`HTTP ${status} retains inputs and an honest error after reload`, async ({
    page,
  }) => {
    const state = await portal(page);
    state.status = status;
    await address(page).fill("Rejected address");
    await save(page);
    await expect(
      page.getByText("Child details successfully updated!"),
    ).toHaveCount(0);
    await expect
      .poll(async () => (await stored(page))?.error)
      .toBe("Save rejected by server");
    expect((await stored(page))?.is_pending_sync).toBe(false);
    await page.reload();
    await expect(address(page)).toHaveValue("Rejected address");
    await expect(
      page.getByRole("alert").filter({ hasText: "Save rejected by server" }),
    ).toBeVisible();
    expect(state.requests).toHaveLength(1);
  });
}

for (const mode of ["network", "server", "offline"] as const) {
  test(`${mode} save retains the draft and requires manual submission after reconnect`, async ({
    page,
  }) => {
    const state = await portal(page);
    state.network = mode === "network";
    state.status = mode === "server" ? 503 : 200;
    if (mode === "offline")
      await page.evaluate(() =>
        Object.defineProperty(navigator, "onLine", {
          configurable: true,
          value: false,
        }),
      );
    await address(page).fill("Pending address");
    await save(page);
    await expect(
      page.getByText("Child details successfully updated!"),
    ).toHaveCount(0);
    await expect
      .poll(async () => (await stored(page))?.is_pending_sync)
      .toBe(true);
    await expect(
      page
        .getByText(
          "Your draft is saved on this device. Reconnect and submit again.",
        )
        .first(),
    ).toBeVisible();
    if (mode !== "offline") {
      await page.reload();
      await expect(address(page)).toHaveValue("Pending address");
    }
    state.network = false;
    state.status = 200;
    const submissions = state.requests.length;
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", {
        configurable: true,
        value: true,
      });
      window.dispatchEvent(new Event("online"));
    });
    await expect(address(page)).toHaveValue("Pending address");
    expect(await stored(page)).not.toBeNull();
    expect(state.requests).toHaveLength(submissions);
    await save(page);
    await expect.poll(() => stored(page)).toBeNull();
    await expect(address(page)).toHaveValue("Pending address");
    expect(state.child.address).toBe("Pending address");
    expect(
      state.requests.every((data) => Object.keys(data).join() === "address"),
    ).toBe(true);
  });
}

test("an older HTTP confirmation preserves newer edits and their baseline", async ({
  page,
}) => {
  const state = await portal(page);
  let release = () => {};
  state.wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  await address(page).fill("First edit");
  await save(page);
  await expect.poll(() => state.requests.length).toBe(1);
  await address(page).fill("Newer edit");
  release();
  await expect(
    page.getByText("Child details successfully updated!"),
  ).toBeVisible();
  await expect(address(page)).toHaveValue("Newer edit");
  expect((await stored(page))?.values.address).toBe("Newer edit");
  expect((await stored(page))?.baseline?.address).toBe("First edit");
});

test("guardian age-only edit excludes other fields and a required name stays in the draft", async ({
  page,
}) => {
  const state = await portal(page);
  await page.locator('input[name="mother_age"]').fill("36");
  await save(page);
  await expect(
    page.getByText("Child details successfully updated!"),
  ).toBeVisible();
  expect(state.requests).toEqual([{ mother_age: 36 }]);
  await page.locator('input[name="mother_age"]').fill("");
  await save(page);
  await expect.poll(() => state.requests.length).toBe(2);
  expect(state.requests[1]).toEqual({ mother_age: null });
  await expect.poll(() => stored(page)).toBeNull();
  await page.locator('input[name="mother_name"]').fill("");
  await save(page);
  await expect(
    page.getByText(
      "Mother name is required when updating guardian information.",
    ),
  ).toBeVisible();
  expect(state.requests).toHaveLength(2);
  await page.reload();
  await expect(page.locator('input[name="mother_name"]')).toHaveValue("");
});

test("legacy drafts remain readable and queued payloads wait for manual review", async ({
  page,
}) => {
  const state = await portal(page);
  await address(page).fill("Legacy address");
  await page.evaluate((k) => {
    const draft = JSON.parse(
      localStorage.getItem(k) || "null",
    ) as StoredProfile;
    delete draft.baseline;
    localStorage.setItem(k, JSON.stringify(draft));
  }, key);
  await page.reload();
  await expect(address(page)).toHaveValue("Legacy address");
  await save(page);
  await expect(
    page.getByText("Child details successfully updated!"),
  ).toBeVisible();
  expect(state.requests).toEqual([{ address: "Legacy address" }]);
  await address(page).fill("Queued address");
  const queued = {
    address: "Queued address",
    mother_name: "Original queued name",
  };
  await page.evaluate(
    ({ k, request }) => {
      const draft = JSON.parse(
        localStorage.getItem(k) || "null",
      ) as StoredProfile;
      delete draft.baseline;
      localStorage.setItem(
        k,
        JSON.stringify({
          ...draft,
          is_pending_sync: true,
          request: {
            path: "/api/parents/children/1",
            method: "put",
            data: request,
          },
        }),
      );
    },
    { k: key, request: queued },
  );
  await page.reload();
  await expect(address(page)).toHaveValue("Queued address");
  expect(state.requests).toHaveLength(1);
  expect((await stored(page))?.request?.data).toEqual(queued);
  await save(page);
  await expect.poll(() => state.requests.length).toBe(2);
  expect(state.requests[1]).toEqual({ address: "Queued address" });
  await expect.poll(() => stored(page)).toBeNull();
});

test("teacher open and focus fetch fresh details while unsaved edits remain intact", async ({
  page,
}) => {
  const state = await portal(page, true);
  state.child.address = "Parent update before open";
  await page.getByTitle("Edit Student").click();
  const dialog = page.getByRole("dialog");
  const input = dialog.locator('input[name="address"]');
  await expect(input).toHaveValue("Parent update before open");
  const reads = state.reads;
  state.child.address = "Parent update on focus";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(input).toHaveValue("Parent update on focus");
  expect(state.reads).toBeGreaterThan(reads);
  await input.fill("Unsaved teacher address");
  const draftReads = state.reads;
  state.child.address = "Later parent update";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(input).toHaveValue("Unsaved teacher address");
  await expect(dialog.getByText(/Showing your unsaved edits/)).toBeVisible();
  expect(state.reads).toBe(draftReads);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByTitle("Edit Student").click();
  await expect(input).toHaveValue("Unsaved teacher address");
  await expect.poll(() => state.reads).toBeGreaterThan(draftReads);
});
