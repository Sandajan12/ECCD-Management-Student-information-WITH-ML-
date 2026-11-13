import { mockSession, expectNoStoredCredentials } from "./helpers/session";
import { expect, test } from "@playwright/test";
import type { Domain, Question, SessionUser } from "../src/types";

for (const portal of ["chairman", "teacher"] as const) {
  test(`${portal} questions append without a sequence input and preserve legacy drafts`, async ({
    page,
  }) => {
    const owner = portal === "chairman" ? 1 : 2;
    const key = `ames_draft_${owner}_config_question_new_domain_1`;
    const user: SessionUser = {
      id: owner,
      first_name: "Test",
      last_name: "User",
      full_name: "Test User",
      email: `${portal}@example.com`,
      role: portal === "chairman" ? "super-admin" : "admin",
      is_first_login: 0,
      section_id: 1,
      section_name: "Test A",
      allow_eccd_question_management: true,
    };
    const domains: Domain[] = [
      {
        domain_id: 1,
        domain_name: "Gross Motor",
        questions: [
          {
            question_id: 1,
            domain_id: 1,
            question_text: "Runs safely",
            sequence_order: 1,
            answers: { PRE: null, MID: null, POST: null },
          },
          {
            question_id: 3,
            domain_id: 1,
            question_text: "Jumps safely",
            sequence_order: 3,
            answers: { PRE: null, MID: null, POST: null },
          },
        ],
      },
    ];
    let fail = true;
    const writes: Record<string, unknown>[] = [];
    await page.addInitScript(
      ({ account, draftKey }) => {
        if (!localStorage.getItem("question-draft-seeded")) {
          localStorage.setItem(
            draftKey,
            JSON.stringify({
              owner_id: account.id,
              revision: "legacy",
              is_pending_sync: false,
              values: {
                question_text: "Saved extra question",
                sequence_order: "1",
                is_home_based: false,
              },
            }),
          );
          localStorage.setItem("question-draft-seeded", "true");
        }
      },
      { account: user, draftKey: key },
    );
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      if (
        path.startsWith("/api/eccd-config/questions") &&
        ["POST", "PUT"].includes(method)
      ) {
        const data = route.request().postDataJSON() as Record<string, unknown>;
        writes.push(data);
        if (fail) {
          await route.fulfill({
            status: 409,
            json: { detail: "Question order changed. Please submit again." },
          });
          return;
        }
        if (method === "POST") {
          const question: Question = {
            question_id: 4,
            domain_id: 1,
            sequence_order: 4,
            answers: { PRE: null, MID: null, POST: null },
            question_text: String(data.question_text),
            is_home_based: Boolean(data.is_home_based),
          };
          domains[0].questions.push(question);
          await route.fulfill({ json: question });
        } else {
          domains[0].questions[0].question_text = String(data.question_text);
          await route.fulfill({
            json: { message: "Question updated successfully" },
          });
        }
        return;
      }
      let json: unknown = {};
      if (path === "/api/eccd-config/") json = domains;
      else if (path === "/api/sections/")
        json = [{ section_id: 1, section_name: "Test A" }];
      else if (path === "/api/teachers/access-controls") json = user;
      else if (path === "/api/teachers/dashboard-filters")
        json = { sections: ["Test A"] };
      else if (path === "/api/messages/contacts")
        json = { myId: owner, contacts: [] };
      else if (path === "/api/messages/unread-count") json = { unreadCount: 0 };
      await route.fulfill({ json });
    });
    const path =
      portal === "chairman"
        ? "/super-admin/eccd-questions"
        : "/teacher/eccd-questions";
    await mockSession(page, user);
    await page.goto(path);
    await expectNoStoredCredentials(page);
    await page.getByRole("button", { name: "Manage Questions" }).click();
    await page
      .getByRole("button", { name: "Add Question", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Question Text")).toHaveValue(
      "Saved extra question",
    );
    await expect(dialog.getByLabel(/Sequence Order/)).toHaveCount(0);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      dialog.getByText("Question order changed. Please submit again."),
    ).toBeVisible();
    expect(writes[0]).not.toHaveProperty("sequence_order");
    await page.reload();
    await page.getByRole("button", { name: "Manage Questions" }).click();
    await page
      .getByRole("button", { name: "Add Question", exact: true })
      .click();
    await expect(dialog.getByLabel("Question Text")).toHaveValue(
      "Saved extra question",
    );
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    expect(writes).toHaveLength(1);
    fail = false;
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("row").filter({ hasText: "Saved extra question" }),
    ).toContainText("4");
    expect(
      await page.evaluate((draftKey) => localStorage.getItem(draftKey), key),
    ).toBeNull();
    await page
      .getByRole("row")
      .filter({ hasText: "Runs safely" })
      .getByRole("button", { name: "Edit Question" })
      .click();
    await dialog.getByLabel("Question Text").fill("Updated original question");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(writes.at(-1)).not.toHaveProperty("sequence_order");
    await expect(
      page.getByRole("row").filter({ hasText: "Updated original question" }),
    ).toContainText("1");
  });
}
