import { mockSession, expectNoStoredCredentials } from "./helpers/session";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { ParentLinkResponse, SessionUser, Student } from "../src/types";

const draftKey = "ames_draft_7_parent_link";
const otherDraftKey = "ames_draft_7_student_profile_99";
const lrn = "001555555555";
const connected = "Your child is now connected to your account.";
const pending =
  "Link request submitted. Your child's teacher must approve it before records become available.";

interface PortalState {
  linked: boolean;
  failLink: boolean;
  rosterReads: number;
  submissions: number;
}

async function portal(page: Page, status: ParentLinkResponse["status"]) {
  const state: PortalState = {
    linked: false,
    failLink: false,
    rosterReads: 0,
    submissions: 0,
  };
  const user: SessionUser = {
    id: 7,
    first_name: "Sample",
    last_name: "Parent",
    full_name: "Sample Parent",
    email: "sample@example.com",
    role: "user",
    is_first_login: 0,
    section_id: null,
    section_name: null,
    allow_eccd_question_management: false,
  };
  await page.addInitScript(
    ({ profileKey }) => {
      localStorage.setItem(profileKey, "unrelated unsaved profile");
    },
    { profileKey: otherDraftKey },
  );
  const child: Student = {
    student_id: 3,
    masked_lrn: "********5555",
    first_name: "Sample",
    middle_name: null,
    last_name: "Child",
    full_name: "Sample Child",
    date_of_birth: null,
    gender: null,
    section_id: 1,
    section_name: "Sample Class",
    school_year: "2026-2027",
    decimal_age: null,
    is_active: true,
    address: null,
    emergency_contact: null,
    handedness: null,
    num_of_siblings: null,
    birth_order: null,
    profile_completeness: 0,
    parent_names: null,
    parents: [],
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/students/my-child") {
      state.rosterReads++;
      await route.fulfill({ json: state.linked ? [child] : [] });
    } else if (path === "/api/parents/children/link") {
      state.submissions++;
      expect(route.request().postDataJSON()).toEqual({ lrn_number: lrn });
      if (state.failLink) {
        await route.abort("failed");
        return;
      }
      state.linked = status === "SYNCED";
      const response: ParentLinkResponse = {
        message: "Link saved",
        student_id: 3,
        masked_lrn: child.masked_lrn,
        status,
      };
      await route.fulfill({ json: response });
    } else if (path === "/api/settings") {
      await route.fulfill({ json: {} });
    } else if (path === "/api/messages/contacts") {
      await route.fulfill({ json: { myId: 7, contacts: [] } });
    } else if (path === "/api/messages/unread-count") {
      await route.fulfill({ json: { unreadCount: 0 } });
    } else if (path.includes("domains-progress")) {
      await route.fulfill({ json: [] });
    } else {
      await route.fulfill({
        status: 403,
        json: { detail: "Results Pending Adviser Release" },
      });
    }
  });
  await mockSession(page, user);
  await page.goto("/parent/dashboard");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoStoredCredentials(page);
  return state;
}

for (const status of ["SYNCED", "PENDING"] as const) {
  test(`${status} response shows the correct feedback and refreshes children`, async ({
    page,
  }) => {
    const state = await portal(page, status);
    const reads = state.rosterReads;
    await page.getByPlaceholder("Enter 12-digit LRN").fill(lrn);
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(
      page.getByText(status === "SYNCED" ? connected : pending),
    ).toBeVisible();
    await expect.poll(() => state.rosterReads).toBeGreaterThan(reads);
    await expect(
      page.getByRole("heading", { name: "Sample Child", exact: true }),
    ).toHaveCount(status === "SYNCED" ? 1 : 0);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), draftKey),
    ).toBeNull();
    expect(
      await page.evaluate((key) => localStorage.getItem(key), otherDraftKey),
    ).toBe("unrelated unsaved profile");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  });

  test(`${status} link draft survives network failure and reload until manual submission`, async ({
    page,
  }) => {
    const state = await portal(page, status);
    state.failLink = true;
    await page.getByPlaceholder("Enter 12-digit LRN").fill(lrn);
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(
      page
        .getByText(
          "Your draft is saved on this device. Reconnect and submit again.",
        )
        .first(),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByPlaceholder("Enter 12-digit LRN")).toHaveValue(lrn);
    expect(
      await page.evaluate((key) => {
        const draft = JSON.parse(localStorage.getItem(key) || "null") as {
          values: string;
          is_pending_sync: boolean;
        } | null;
        return draft;
      }, draftKey),
    ).toMatchObject({ values: lrn, is_pending_sync: true });
    expect(state.submissions).toBe(1);
    state.failLink = false;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByPlaceholder("Enter 12-digit LRN")).toHaveValue(lrn);
    expect(state.submissions).toBe(1);
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(
      page.getByText(status === "SYNCED" ? connected : pending),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Sample Child", exact: true }),
    ).toHaveCount(status === "SYNCED" ? 1 : 0);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), draftKey),
    ).toBeNull();
  });
}
