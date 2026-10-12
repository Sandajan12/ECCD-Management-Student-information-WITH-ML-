import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import type { Domain } from "../src/types";

const initialDomains: Domain[] = [
  {
    domain_id: 1,
    domain_name: "Gross Motor Domain",
    questions: [
      {
        question_id: 1,
        domain_id: 1,
        question_text: "Walks in a straight line.",
        sequence_order: 1,
        is_home_based: false,
        answers: { PRE: null, MID: null, POST: null },
      },
    ],
  },
  { domain_id: 2, domain_name: "Fine Motor Domain", questions: [] },
  { domain_id: 3, domain_name: "Self-Help Domain", questions: [] },
];
interface FixtureOptions {
  role?: string;
  permission?: boolean;
  firstLogin?: boolean;
  configGet?: (route: Route) => Promise<void>;
}
async function prepare(page: Page, options: FixtureOptions = {}) {
  await page.addInitScript(
    ({ role, permission, firstLogin }) => {
      localStorage.setItem(
        "user",
        JSON.stringify({
          id: 1,
          username: "Example",
          role,
          is_first_login: firstLogin,
          allow_eccd_question_management: permission,
        }),
      );
      localStorage.setItem(
        "token",
        `reference.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.reference`,
      );
    },
    {
      role: options.role ?? "super-admin",
      permission: options.permission ?? false,
      firstLogin: options.firstLogin ?? false,
    },
  );
  const domains = structuredClone(initialDomains);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/eccd-config/" && options.configGet)
      return options.configGet(route);
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
        : path === "/api/eccd-config/" || path === "/api/chairman/eccd-data"
          ? domains
          : path.includes("parent-access")
            ? { allow_eccd_question_management: options.permission ?? false }
            : path.includes("filters")
              ? { sections: [], domains: [], schoolYears: ["2026-2027"] }
              : [];
    await route.fulfill({ json: data });
  });
  return domains;
}
async function openQuestions(page: Page) {
  await page.goto("/super-admin/eccd-questions");
  await page.getByRole("button", { name: "Manage Questions" }).first().click();
}
function deferred() {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test("ECCD loading, empty domains and failed fetch states", async ({
  page,
}) => {
  const gate = deferred();
  await prepare(page, {
    configGet: async (route) => {
      await gate.promise;
      await route.fulfill({ json: [] });
    },
  });
  await page.goto("/super-admin/eccd-questions");
  await expect(
    page.getByRole("status", { name: "Loading ECCD domains" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Manage Questions" }),
  ).toHaveCount(0);
  gate.release();
  await expect(
    page.getByRole("status", { name: "Loading ECCD domains" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add Domain" })).toBeVisible();
  // Legacy has no extra domain placeholder when the configuration is empty.
  await expect(
    page.getByText("Add a development domain to begin."),
  ).toHaveCount(0);
  await page.route("**/api/eccd-config/", (route) =>
    route.fulfill({
      status: 500,
      json: { detail: "Configuration unavailable" },
    }),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "Configuration unavailable",
  );
  await expect(
    page.getByRole("status", { name: "Loading ECCD domains" }),
  ).toHaveCount(0);
});

test("ECCD home toggle blocks concurrent requests and clears only its confirmed draft", async ({
  page,
}) => {
  const domains = await prepare(page);
  const gate = deferred();
  let requests = 0;
  await page.route(
    "**/api/eccd-config/questions/1/home-based",
    async (route) => {
      requests++;
      expect(route.request().method()).toBe("PUT");
      expect(route.request().postDataJSON()).toEqual({ is_home_based: true });
      await gate.promise;
      domains[0].questions[0].is_home_based = true;
      await route.fulfill({ json: { success: true } });
    },
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openQuestions(page);
  await page.evaluate(() =>
    localStorage.setItem("ames_draft_1_unrelated", "keep"),
  );
  const toggle = page.getByRole("button", { name: "Home-based assessment" });
  await toggle.evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await expect(toggle).toBeDisabled();
  await expect.poll(() => requests).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("ames_draft_1_question_home_1") || "null",
          )?.is_pending_sync,
      ),
    )
    .toBe(true);
  gate.release();
  await expect(
    page.getByRole("status", { name: "Loading ECCD domains" }),
  ).toHaveCount(0);
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("ames_draft_1_question_home_1"),
    ),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem("ames_draft_1_unrelated")),
  ).toBe("keep");
  expect(requests).toBe(1);
  expect(errors).toEqual([]);
});

test("ECCD domain submission locks footer and escape until HTTP confirmation", async ({
  page,
}) => {
  const domains = await prepare(page);
  const gate = deferred();
  let requests = 0;
  await page.route("**/api/eccd-config/domains", async (route) => {
    requests++;
    expect(route.request().postDataJSON()).toEqual({
      domain_name: "Language Domain",
    });
    await gate.promise;
    domains.push({
      domain_id: 4,
      domain_name: "Language Domain",
      questions: [],
    });
    await route.fulfill({ status: 201, json: domains[3] });
  });
  await page.goto("/super-admin/eccd-questions");
  await page.getByRole("button", { name: "Add Domain" }).click();
  await page.getByLabel("Domain Name").fill("Language Domain");
  await page.locator("#chairman-config-form").evaluate((element) => {
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
  await expect(
    page.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Domain Name")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect.poll(() => requests).toBe(1);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("ames_draft_1_config_domain_new"),
    ),
  ).not.toBeNull();
  gate.release();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Language Domain", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("ames_draft_1_config_domain_new"),
    ),
  ).toBeNull();
  expect(requests).toBe(1);
});

test("ECCD question fields, failure recovery and confirmed retry preserve the request contract", async ({
  page,
}) => {
  const domains = await prepare(page);
  let rejected = true;
  await page.route("**/api/eccd-config/questions", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({
      domain_id: 1,
      sequence_order: 2,
      question_text: "Jumps forward.",
      is_home_based: false,
    });
    if (rejected)
      return route.fulfill({
        status: 403,
        json: { detail: "Question changes are locked" },
      });
    domains[0].questions.push({
      question_id: 2,
      domain_id: 1,
      sequence_order: 2,
      question_text: "Jumps forward.",
      is_home_based: false,
      answers: { PRE: null, MID: null, POST: null },
    });
    await route.fulfill({ status: 201, json: domains[0].questions[1] });
  });
  await openQuestions(page);
  await expect(page.getByRole("columnheader")).toHaveText([
    "ORDER",
    "QUESTION / INDICATOR",
    "ACTIONS",
  ]);
  await expect(
    page.getByRole("heading", { name: "Gross Motor Domain Questions" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add Question" }).click();
  const order = page.getByLabel("Sequence Order (e.g. 1)");
  const question = page.getByLabel("Question Text");
  await expect(order).toHaveValue("");
  await expect(question).toBeFocused();
  expect((await order.boundingBox())!.y).toBeLessThan(
    (await question.boundingBox())!.y,
  );
  await expect(page.getByRole("dialog").locator("footer button")).toHaveText([
    "Cancel",
    "Save",
  ]);
  await order.fill("2");
  await question.fill("Jumps forward.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Question changes are locked",
  );
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
  const key = "ames_draft_1_config_question_new_domain_1";
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) || "null")?.is_pending_sync,
      key,
    ),
  ).toBe(false);
  await page.reload();
  await page.getByRole("button", { name: "Manage Questions" }).first().click();
  await page.getByRole("button", { name: "Add Question" }).click();
  await expect(order).toHaveValue("2");
  await expect(question).toHaveValue("Jumps forward.");
  rejected = false;
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "Jumps forward.", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), key),
  ).toBeNull();
});

test("ECCD disconnected home toggle recovers and synchronizes on reconnection", async ({
  page,
}) => {
  const domains = await prepare(page);
  let disconnected = true;
  await page.route(
    "**/api/eccd-config/questions/1/home-based",
    async (route) => {
      if (disconnected) return route.abort("internetdisconnected");
      domains[0].questions[0].is_home_based = route
        .request()
        .postDataJSON().is_home_based;
      await route.fulfill({ json: { success: true } });
    },
  );
  await openQuestions(page);
  const toggle = page.getByRole("button", { name: "Home-based assessment" });
  await toggle.click();
  await expect(page.getByRole("alert")).toContainText(
    "Saved for reconnection.",
  );
  await expect(toggle).toBeEnabled();
  const key = "ames_draft_1_question_home_1";
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) || "null")?.is_pending_sync,
      key,
    ),
  ).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Manage Questions" }).first().click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  disconnected = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), key))
    .toBeNull();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
});

test("ECCD cards, detail tables and dialogs contain overflow across breakpoints", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/super-admin/eccd-questions");
  for (const width of [320, 390, 599, 600, 899, 900, 1024, 1199, 1200, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    await expect(
      page.getByRole("button", { name: "Manage Questions" }),
    ).toHaveCount(3);
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
    expect(await overflow(), `domain grid at ${width}px`).toBeLessThanOrEqual(
      1,
    );
    await page.getByRole("button", { name: "Manage Questions" }).nth(1).click();
    await expect(
      page.getByText("No questions found. Please add a question.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await overflow(),
      `question table at ${width}px`,
    ).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Add Question" }).click();
    expect(
      await overflow(),
      `question dialog at ${width}px`,
    ).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Back to Domains" }).click();
  }
});

test("ECCD role and permission guards still block unauthorized access", async ({
  page,
}) => {
  await prepare(page, { role: "admin" });
  await page.goto("/super-admin/eccd-questions");
  await expect(page).toHaveURL(/\/teacher\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "ECCD Questions Management" }),
  ).toHaveCount(0);
  await page.goto("/teacher/eccd-questions");
  await expect(page).toHaveURL(/\/teacher\/dashboard$/);
});

test("ECCD edit refresh and deletion retain the selected domain and endpoint payloads", async ({
  page,
}) => {
  const domains = await prepare(page);
  await page.route("**/api/eccd-config/domains/1", async (route) => {
    expect(route.request().method()).toBe("PUT");
    expect(route.request().postDataJSON()).toEqual({
      domain_name: "Gross Motor Skills",
    });
    domains[0].domain_name = "Gross Motor Skills";
    await route.fulfill({ json: domains[0] });
  });
  await page.route("**/api/eccd-config/questions/1", async (route) => {
    if (route.request().method() === "DELETE") {
      domains[0].questions = [];
      return route.fulfill({ json: { success: true } });
    }
    expect(route.request().method()).toBe("PUT");
    expect(route.request().postDataJSON()).toEqual({
      domain_id: 1,
      sequence_order: 3,
      question_text: "Walks independently.",
      is_home_based: false,
    });
    domains[0].questions[0] = {
      ...domains[0].questions[0],
      sequence_order: 3,
      question_text: "Walks independently.",
    };
    await route.fulfill({ json: domains[0].questions[0] });
  });
  await page.goto("/super-admin/eccd-questions");
  await page.getByTitle("Edit Domain", { exact: true }).first().click();
  await expect(page.getByLabel("Domain Name")).toHaveValue(
    "Gross Motor Domain",
  );
  await page.getByLabel("Domain Name").fill("Gross Motor Skills");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Gross Motor Skills", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Manage Questions" }).first().click();
  await page.getByTitle("Edit Question", { exact: true }).click();
  await expect(page.getByLabel("Sequence Order (e.g. 1)")).toHaveValue("1");
  await expect(page.getByLabel("Question Text")).toHaveValue(
    "Walks in a straight line.",
  );
  await page.getByLabel("Sequence Order (e.g. 1)").fill("3");
  await page.getByLabel("Question Text").fill("Walks independently.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Gross Motor Skills Questions" }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Walks independently.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "3", exact: true }),
  ).toBeVisible();
  await page.getByTitle("Delete Question", { exact: true }).click();
  await page
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(
    page.getByText("No questions found. Please add a question.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Gross Motor Skills Questions" }),
  ).toBeVisible();
});
