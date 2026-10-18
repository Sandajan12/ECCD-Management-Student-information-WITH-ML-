import { expect, test } from "@playwright/test";
import type {
  SessionResponse,
  Teacher,
  TeacherCreatePayload,
} from "../src/types";

const backend = "http://127.0.0.1:8769";

test("Add Teacher creates a real account with separate names, no employee ID and a simple temporary password", async ({
  page,
  request,
}, info) => {
  await page.setViewportSize({
    width: info.project.name === "mobile" ? 320 : 1280,
    height: 900,
  });
  expect((await request.post(`${backend}/__test/reset`)).ok()).toBeTruthy();
  const auth = await request.post(`${backend}/api/auth/login`, {
    data: { username: "chairman", password: "Example123" },
  });
  expect(auth.status()).toBe(200);
  const session = (await auth.json()) as SessionResponse;
  await page.goto("/login");
  await page.evaluate((value) => {
    localStorage.setItem("user", JSON.stringify(value.user));
    localStorage.setItem("token", value.token);
  }, session);
  const headers = { Authorization: `Bearer ${session.token}` };
  const sectionName = "Creation Test";
  const sectionResponse = await request.post(
    `${backend}/api/chairman/sections`,
    {
      headers,
      data: { section_name: sectionName },
    },
  );
  expect(sectionResponse.status()).toBe(201);
  const section = (await sectionResponse.json()) as { section_id: number };

  await page.goto("/super-admin/teachers");
  await page.getByRole("button", { name: "Add New Teacher" }).click();
  const first = page.getByLabel("First Name", { exact: true });
  const last = page.getByLabel("Last Name", { exact: true });
  await expect(first).toHaveAttribute("required", "");
  await expect(last).toHaveAttribute("required", "");
  await first.fill("Ana1-María٢");
  await last.fill("O'Neill３4");
  await expect(first).toHaveValue("Ana-María");
  await expect(last).toHaveValue("O'Neill");
  await expect(page.getByLabel("Employee ID (optional)")).not.toHaveAttribute(
    "required",
    "",
  );
  await page.getByLabel("Email", { exact: true }).fill("created@example.com");
  await page.getByLabel("Password", { exact: true }).fill("temporary");
  await page
    .getByRole("combobox", { name: "Class Name / Section", exact: true })
    .click();
  await page.getByRole("option", { name: sectionName, exact: true }).click();

  // A network failure must retain names and the tab-scoped temporary password.
  await page.route("**/api/teachers/", (route) =>
    route.abort("internetdisconnected"),
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Add New Teacher" }).click();
  await expect(first).toHaveValue("Ana-María");
  await expect(last).toHaveValue("O'Neill");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
    "temporary",
  );
  await page.unroute("**/api/teachers/");

  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/teachers/" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const response = await responsePromise;
  expect(response.request().postDataJSON() as TeacherCreatePayload).toEqual({
    first_name: "Ana-María",
    last_name: "O'Neill",
    email: "created@example.com",
    username: "created@example.com",
    employee_id: null,
    section_id: section.section_id,
    password: "temporary",
  });
  expect(response.status(), await response.text()).toBe(201);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const created = (await response.json()) as {
    teacher_id: number;
    user_id: number;
  };
  const savedResponse = await request.get(`${backend}/api/teachers/active`, {
    headers,
  });
  expect(savedResponse.status()).toBe(200);
  const saved = ((await savedResponse.json()) as Teacher[]).find(
    (teacher) => teacher.teacher_id === created.teacher_id,
  );
  expect(saved).toMatchObject({
    user_id: created.user_id,
    first_name: "Ana-María",
    last_name: "O'Neill",
    employee_id: null,
    section_id: section.section_id,
  });
  const login = await request.post(`${backend}/api/auth/login`, {
    data: { email: "created@example.com", password: "temporary" },
  });
  expect(login.status()).toBe(200);
  expect(((await login.json()) as SessionResponse).requiresPasswordChange).toBe(
    true,
  );
  expect(
    await page.evaluate(() => localStorage.getItem("ames_draft_1_teacher_new")),
  ).toBeNull();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("ames_draft_1_teacher_new_password"),
    ),
  ).toBeNull();
});
