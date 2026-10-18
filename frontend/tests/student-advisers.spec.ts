import { expect, test } from "@playwright/test";
import type { SessionResponse, Student } from "../src/types";

const backend = "http://127.0.0.1:8769";

test.beforeEach(async ({ page, request }, info) => {
  await page.setViewportSize({
    width: info.project.name === "mobile" ? 320 : 1280,
    height: 900,
  });
  expect((await request.post(`${backend}/__test/reset`)).ok()).toBeTruthy();
  const response = await request.post(`${backend}/api/auth/login`, {
    data: { username: "chairman", password: "Example123" },
  });
  expect(response.status()).toBe(200);
  const session = (await response.json()) as SessionResponse;
  await page.goto("/login");
  await page.evaluate((value) => {
    localStorage.setItem("user", JSON.stringify(value.user));
    localStorage.setItem("token", value.token);
  }, session);
});

test("roster displays the real active adviser and refreshes after takeover and unassignment", async ({
  page,
  request,
}, info) => {
  await page.goto("/super-admin/students");
  await expect(page.getByRole("columnheader")).toHaveText([
    "",
    "LRN ID",
    "Full Name",
    "Class Name",
    "Adviser",
    "School Year",
  ]);
  const student = page.getByRole("row").filter({ hasText: "Student, Test M." });
  await expect(student.getByRole("cell").nth(4)).toHaveText("Test Adviser");
  await expect(
    page.getByRole("row").filter({ hasText: "Class, Other" }),
  ).toContainText("Other Teacher");
  const headers = {
    Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem("token"))}`,
  };
  const assign = await request.post(
    `${backend}/api/chairman/sections/1/assign-teacher`,
    {
      headers,
      data: { teacher_id: 3 },
    },
  );
  expect(assign.status()).toBe(200);
  await page.reload();
  await expect(student.getByRole("cell").nth(4)).toHaveText("Test Substitute");

  const widths = info.project.name === "mobile" ? [320, 768] : [1280];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const styles = await student.getByRole("cell").evaluateAll((cells) =>
      [3, 4, 5].map((index) => {
        const style = getComputedStyle(cells[index]);
        return [
          style.fontFamily,
          style.fontSize,
          style.fontWeight,
          style.color,
          style.padding,
          style.textAlign,
          style.borderBottom,
        ];
      }),
    );
    expect(styles[1]).toEqual(styles[0]);
    expect(styles[1]).toEqual(styles[2]);
    const heights = await page.locator("table").evaluate((table) => {
      const rows = Array.from(table.querySelectorAll("tr"));
      const withAdviser = rows.map((row) => row.getBoundingClientRect().height);
      const cells = rows.map((row) => row.children[4]);
      cells.forEach((cell) => cell.remove());
      const minimumWidth = table.style.minWidth;
      table.style.minWidth = "650px";
      const withoutAdviser = rows.map(
        (row) => row.getBoundingClientRect().height,
      );
      cells.forEach((cell, index) =>
        rows[index].insertBefore(cell, rows[index].children[4]),
      );
      table.style.minWidth = minimumWidth;
      return { withAdviser, withoutAdviser };
    });
    expect(heights.withAdviser).toEqual(heights.withoutAdviser);
    await page.locator("table").evaluate((table) => {
      if (table.parentElement)
        table.parentElement.scrollLeft = table.parentElement.scrollWidth;
    });
    await expect(
      page.getByRole("columnheader", { name: "School Year", exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: info.outputPath(`adviser-${width}.png`),
      fullPage: true,
    });
  }

  const unassign = await request.post(
    `${backend}/api/chairman/sections/1/assign-teacher`,
    {
      headers,
      data: { teacher_id: null },
    },
  );
  expect(unassign.status()).toBe(200);
  await page.reload();
  await expect(student.getByRole("cell").nth(4)).toHaveText("—");
});

test("missing and null adviser fields preserve filtering, selection, details and empty state", async ({
  page,
}) => {
  await page.route("**/api/chairman/students", async (route) => {
    const response = await route.fetch();
    const students = (await response.json()) as Student[];
    for (const student of students) {
      if (student.student_id === 1) delete student.adviser_name;
      else student.adviser_name = null;
    }
    await route.fulfill({ json: students });
  });
  await page.goto("/super-admin/students");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.locator("tbody td:nth-child(5)")).toHaveText(["—", "—"]);
  const select = page.getByRole("checkbox", {
    name: "Select Student, Test M.",
    exact: true,
  });
  await select.check();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Transfer Selected (1)" }),
  ).toBeEnabled();
  await page.getByRole("combobox", { name: "Section", exact: true }).click();
  await page.getByRole("option", { name: "Test B", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Transfer Selected (1)" }),
  ).toBeEnabled();
  await page
    .getByRole("textbox", { name: "Search students" })
    .fill("missing learner");
  await expect(page.getByText("No student records found.")).toHaveAttribute(
    "colspan",
    "6",
  );
  await page.getByRole("textbox", { name: "Search students" }).fill("Other");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.locator("tbody tr").click();
  await expect(
    page.getByRole("dialog", { name: "Student Record Details" }),
  ).toBeVisible();
});
