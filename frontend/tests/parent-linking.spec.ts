import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { ParentLinkInfo, Student } from "../src/types";

const parent: ParentLinkInfo = {
  parent_id: 11,
  full_name: "Jamie Reyes",
  email: "jamie@example.test",
  relationship: "Mother",
  linked_at: "2026-09-02T12:00:00Z",
  requested_at: "2026-09-01T12:00:00Z",
};
function learner(id: number, status: "NONE" | "PENDING" | "SYNCED"): Student {
  return {
    student_id: id,
    first_name: id === 1 ? "Avery" : id === 2 ? "Blair" : "Casey",
    middle_name: "Lee",
    last_name: "Reyes",
    full_name: null,
    masked_lrn: "••••••••1234",
    date_of_birth: "2021-04-01",
    gender: "Female",
    section_id: 1,
    section_name: "Section A",
    school_year: "2026-2027",
    decimal_age: 5.3,
    is_active: true,
    address: null,
    emergency_contact: null,
    handedness: null,
    num_of_siblings: null,
    birth_order: null,
    profile_completeness: 75,
    parent_names: status === "SYNCED" ? parent.full_name : null,
    parents: [],
    parent_link_status: status,
    parent_info:
      status === "NONE"
        ? null
        : {
            ...parent,
            parent_id: id + 10,
            linked_at: status === "PENDING" ? null : parent.linked_at,
          },
  };
}
async function setup(page: Page) {
  let roster = [
    learner(1, "SYNCED"),
    learner(2, "PENDING"),
    learner(3, "NONE"),
  ];
  const changes: { path: string; parent_id: number }[] = [];
  await page.addInitScript(() => {
    localStorage.setItem(
      "user",
      JSON.stringify({
        id: 7,
        username: "Teacher",
        email: "teacher@example.test",
        role: "admin",
        is_first_login: false,
        section_id: 1,
      }),
    );
    localStorage.setItem(
      "token",
      `test.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`,
    );
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, "");
    if (route.request().method() === "POST" && /parent/.test(path)) {
      const body = route.request().postDataJSON() as { parent_id: number };
      changes.push({ path, parent_id: body.parent_id });
      const approved = path.endsWith("approve-parent-link");
      const id = Number(path.split("/")[4]);
      roster = roster.map((row) =>
        row.student_id === id ? learner(id, approved ? "SYNCED" : "NONE") : row,
      );
      const message = approved
        ? "Parent link approved successfully."
        : path.endsWith("unlink-parent")
          ? "Parent account successfully unlinked."
          : "Parent link request declined.";
      await route.fulfill({ json: { success: true, message } });
      return;
    }
    const data =
      path === "/api/students"
        ? roster
        : path === "/api/settings"
          ? {
              school_name: "Test School",
              school_year_start_month: 8,
              current_school_year: "2026-2027",
            }
          : path === "/api/sections"
            ? [{ section_id: 1, section_name: "Section A" }]
            : path.endsWith("dashboard-filters")
              ? { sections: ["Section A"], domains: [] }
              : /unread/.test(path)
                ? { unreadCount: 0 }
                : path.endsWith("me/access")
                  ? {}
                  : [];
    await route.fulfill({ json: data });
  });
  await page.goto("/teacher/students");
  await expect(
    page.getByRole("button", { name: "Synced Parent", exact: true }),
  ).toBeVisible();
  return changes;
}

test("linked account details and explicit unlink confirmation", async ({
  page,
}, info) => {
  const changes = await setup(page);
  await expect(page.getByText("No Parent", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Synced Parent", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Linked Parent Account" });
  await expect(
    dialog.getByText("jamie@example.test", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText("09/02/2026", { exact: true })).toBeVisible();
  await expect(dialog).not.toContainText(/phone|mobile/i);
  await page.screenshot({
    path: info.outputPath("linked-parent.png"),
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Unlink Parent", exact: true })
    .click();
  await expect(dialog.getByText(/immediately lose access/)).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(changes).toHaveLength(0);
  await dialog
    .getByRole("button", { name: "Unlink Parent", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Yes, Unlink Parent", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText("Parent account successfully unlinked."),
  ).toBeVisible();
  await expect(page.getByText("No Parent", { exact: true })).toHaveCount(2);
  expect(changes).toEqual([
    { path: "/api/teachers/students/1/unlink-parent", parent_id: 11 },
  ]);
});

test("pending request accepts and becomes a synced parent", async ({
  page,
}, info) => {
  const changes = await setup(page);
  await page.getByRole("button", { name: "Pending", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Parent Link Request" });
  await expect(dialog).toContainText("Blair Lee Reyes");
  await expect(dialog.getByText("09/01/2026", { exact: true })).toBeVisible();
  await expect(dialog).not.toContainText(/phone|mobile/i);
  await page.screenshot({
    path: info.outputPath("pending-parent.png"),
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Accept Link" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Synced Parent", exact: true }),
  ).toHaveCount(2);
  expect(changes).toEqual([
    { path: "/api/teachers/students/2/approve-parent-link", parent_id: 12 },
  ]);
});

test("decline clears the pending row", async ({ page }) => {
  const changes = await setup(page);
  await page.getByRole("button", { name: "Pending", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Decline", exact: true })
    .click();
  await expect(page.getByText("Parent link request declined.")).toBeVisible();
  await expect(page.getByText("No Parent", { exact: true })).toHaveCount(2);
  expect(changes).toEqual([
    { path: "/api/teachers/students/2/reject-parent-link", parent_id: 12 },
  ]);
});

test("network failure preserves modal, permits retry, and locks controls while waiting", async ({
  page,
}) => {
  const changes = await setup(page);
  let fail = true;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/api/teachers/students/2/approve-parent-link",
    async (route) => {
      if (fail) {
        await route.abort("internetdisconnected");
        return;
      }
      await gate;
      await route.fallback();
    },
  );
  await page.getByRole("button", { name: "Pending", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Parent Link Request" });
  await dialog.getByRole("button", { name: "Accept Link" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Cannot reach the server",
  );
  expect(changes).toHaveLength(0);
  fail = false;
  await dialog.getByRole("button", { name: "Accept Link" }).click();
  await expect(
    dialog.getByRole("button", { name: "Accept Link" }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Decline", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Close", exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByLabel("Processing parent link")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  release?.();
  await expect(dialog).not.toBeVisible();
  expect(changes).toHaveLength(1);
});

test("stale request shows server error without changing the badge", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/teachers/students/2/reject-parent-link", (route) =>
    route.fulfill({
      status: 409,
      json: {
        detail:
          "The parent link has changed. Refresh the student list and try again.",
      },
    }),
  );
  await page.getByRole("button", { name: "Pending", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Decline", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "parent link has changed",
  );
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pending", exact: true }),
  ).toBeVisible();
});
