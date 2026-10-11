import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
const REFERENCE = "http://localhost:5187";
const logo =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23ffffff'/%3E%3Ctext x='50' y='64' font-size='40' text-anchor='middle' fill='%232563eb'%3EA%3C/text%3E%3C/svg%3E";
const settings = {
  school_name: "Example School",
  system_title: "AMES",
  primary_color: "#2563eb",
  secondary_color: "#111827",
  logo_url: logo,
  login_background: "",
  current_school_year: "2026-2027",
};
async function prepare(page: Page, role?: string, firstLogin = false) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data =
      path === "/api/analytics/filters"
        ? { sections: [], domains: [], schoolYears: [] }
        : path === "/api/analytics/stats"
          ? { stats: {} }
          : path === "/api/settings"
            ? settings
            : path.includes("auth/login") ||
                path.includes("auth/register-parent")
              ? {
                  success: true,
                  requireOtp: true,
                  challengeToken: "reference",
                  email: "example@example.com",
                  emailSent: true,
                }
              : path.includes("unread")
                ? { unreadCount: 0 }
                : path.includes("access-controls")
                  ? {
                      allow_eccd_question_management: false,
                      section_id: null,
                      section_name: null,
                    }
                  : path.includes("contacts")
                    ? { myId: null, contacts: [] }
                    : [];
    await route.fulfill({ json: data });
  });
  if (role)
    await page.addInitScript(
      ({ role, firstLogin }) => {
        localStorage.setItem(
          "user",
          JSON.stringify({
            id: 1,
            username: "Example",
            role,
            is_first_login: firstLogin ? 1 : 0,
            allow_eccd_question_management: false,
            section_id: null,
          }),
        );
        localStorage.setItem(
          "token",
          `reference.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.reference`,
        );
      },
      { role, firstLogin },
    );
}
async function ready(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((image) =>
        image.decode().catch(() => {}),
      ),
    );
  });
}
const properties = [
  "backgroundColor",
  "color",
  "borderRadius",
  "borderTopWidth",
  "borderTopColor",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "paddingTop",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "boxShadow",
] as const;
async function measure(locator: Locator) {
  return locator.evaluate((element, keys) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      styles: Object.fromEntries(
        keys.map((key) => [
          key,
          key === "boxShadow"
            ? style.boxShadow.replace(
                /rgba\(0, 0, 0, 0\) 0px 0px 0px 0px, ?/g,
                "",
              )
            : style[key as keyof CSSStyleDeclaration],
        ]),
      ),
    };
  }, properties);
}
async function compare(
  actual: Locator,
  reference: Locator,
  label: string,
  tolerance = 1,
) {
  const a = await measure(actual);
  const b = await measure(reference);
  for (const key of ["x", "y", "width", "height"] as const)
    expect(
      Math.abs(a.rect[key] - b.rect[key]),
      `${label}.${key}: current ${a.rect[key]} vs legacy ${b.rect[key]}`,
    ).toBeLessThanOrEqual(tolerance);
}
for (const width of [390, 600, 899, 900, 1280]) {
  test(`login matches the rendered legacy card and fields at ${width}px`, async ({
    page,
    context,
  }, info) => {
    test.skip(
      info.project.name !== "desktop",
      "Explicit viewport matrix covers both layouts.",
    );
    await page.setViewportSize({ width, height: 900 });
    await prepare(page);
    const legacy = await context.newPage();
    await legacy.setViewportSize({ width, height: 900 });
    await legacy.goto(`${REFERENCE}/login`);
    await page.goto("/login");
    await ready(legacy);
    await ready(page);
    await compare(
      page.locator('[data-auth-card="login"]'),
      legacy.locator(".MuiPaper-root"),
      "login card",
    );
    await compare(
      page.getByRole("heading"),
      legacy.getByRole("heading"),
      "school title",
    );
    await compare(
      page.getByPlaceholder("Enter your email or username"),
      legacy.getByPlaceholder("Enter your email or username"),
      "username input",
    );
    await compare(
      page.getByPlaceholder("Enter your password"),
      legacy.getByPlaceholder("Enter your password"),
      "password input",
    );
    await compare(
      page.getByRole("button", { name: "Log In", exact: true }),
      legacy.getByRole("button", { name: "Log In", exact: true }),
      "login button",
    );
    expect(
      (await measure(page.locator('[data-auth-card="login"]'))).styles,
    ).toMatchObject((await measure(legacy.locator(".MuiPaper-root"))).styles);
    await page.screenshot({
      path: `test-results/parity-login-${width}.png`,
      fullPage: true,
    });
    await legacy.screenshot({
      path: `test-results/legacy-login-${width}.png`,
      fullPage: true,
    });
    const baselineName = `login-${width}.png`;
    await mkdir(dirname(info.snapshotPath(baselineName)), { recursive: true });
    await writeFile(info.snapshotPath(baselineName), await legacy.screenshot());
    expect(await page.screenshot()).toMatchSnapshot(baselineName, {
      threshold: 0.1,
      maxDiffPixels: 0,
    });
  });
  test(`registration matches the rendered legacy layout at ${width}px`, async ({
    page,
    context,
  }, info) => {
    test.skip(
      info.project.name !== "desktop",
      "Explicit viewport matrix covers both layouts.",
    );
    await page.setViewportSize({ width, height: 900 });
    await prepare(page);
    const legacy = await context.newPage();
    await legacy.setViewportSize({ width, height: 900 });
    await legacy.goto(`${REFERENCE}/register-parent`);
    await page.goto("/register-parent");
    await ready(legacy);
    await ready(page);
    await compare(
      page.locator('[data-auth-card="registration"]'),
      legacy.locator(".MuiPaper-root"),
      "registration card",
    );
    await compare(
      page.getByPlaceholder("First Name"),
      legacy.getByPlaceholder("First Name"),
      "first name input",
    );
    await compare(
      page.getByPlaceholder("Enter your email"),
      legacy.getByPlaceholder("Enter your email"),
      "registration email input",
    );
    await compare(
      page.getByRole("button", { name: "Sign Up", exact: true }),
      legacy.getByRole("button", { name: "Sign Up", exact: true }),
      "registration button",
    );
    await page.screenshot({
      path: `test-results/parity-registration-${width}.png`,
      fullPage: true,
    });
    await legacy.screenshot({
      path: `test-results/legacy-registration-${width}.png`,
      fullPage: true,
    });
    const baselineName = `registration-${width}.png`;
    await mkdir(dirname(info.snapshotPath(baselineName)), { recursive: true });
    await writeFile(
      info.snapshotPath(baselineName),
      await legacy.screenshot({ fullPage: true }),
    );
    expect(await page.screenshot({ fullPage: true })).toMatchSnapshot(
      baselineName,
      { threshold: 0.1, maxDiffPixels: 0 },
    );
  });
}
test("first-login dialog matches legacy geometry and remains mandatory", async ({
  page,
  context,
}, info) => {
  const legacy = await context.newPage();
  await prepare(page, "admin", true);
  await legacy.setViewportSize(page.viewportSize()!);
  await legacy.goto(`${REFERENCE}/first-login`);
  await page.goto("/teacher/dashboard");
  await ready(legacy);
  await ready(page);
  await compare(
    page.getByRole("dialog"),
    legacy.locator(".MuiDialog-paper"),
    "password dialog",
  );
  const baseline = `password-dialog-${info.project.name}.png`;
  await mkdir(dirname(info.snapshotPath(baseline)), { recursive: true });
  await writeFile(
    info.snapshotPath(baseline),
    await legacy.locator(".MuiDialog-paper").screenshot(),
  );
  expect(await page.getByRole("dialog").screenshot()).toMatchSnapshot(
    baseline,
    { threshold: 0.1, maxDiffPixels: 0 },
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill("Example123");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("Wrong123");
  await legacy
    .getByPlaceholder("Enter your new secure password")
    .fill("Example123");
  await legacy.getByPlaceholder("Re-enter your new password").fill("Wrong123");
  const filledBaseline = `password-mismatch-${info.project.name}.png`;
  await writeFile(
    info.snapshotPath(filledBaseline),
    await legacy.locator(".MuiDialog-paper").screenshot(),
  );
  expect(await page.getByRole("dialog").screenshot()).toMatchSnapshot(
    filledBaseline,
    { threshold: 0.1, maxDiffPixels: 0 },
  );
  await expect(page.getByText("Passwords do not match")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save Password & Continue" }),
  ).toBeDisabled();
});
test("parent navigation matches the legacy drawer, toolbar and bottom bar", async ({
  page,
  context,
}, info) => {
  await prepare(page, "user");
  const legacy = await context.newPage();
  await legacy.setViewportSize(page.viewportSize()!);
  await legacy.goto(`${REFERENCE}/parent/dashboard?role=user`);
  await page.goto("/parent/dashboard");
  await ready(legacy);
  await ready(page);
  if (info.project.name === "mobile") {
    await compare(
      page.getByRole("banner"),
      legacy.locator(".MuiAppBar-root"),
      "mobile app bar",
    );
    await compare(
      page.getByRole("navigation", { name: "Parent bottom navigation" }),
      legacy.locator("nav").last(),
      "parent bottom bar",
    );
    for (const [name, actual, reference] of [
      ["toolbar", page.getByRole("banner"), legacy.locator(".MuiAppBar-root")],
      [
        "bottom-bar",
        page.getByRole("navigation", { name: "Parent bottom navigation" }),
        legacy.locator("nav").last(),
      ],
    ] as const) {
      const baseline = `${name}-${info.project.name}.png`;
      await mkdir(dirname(info.snapshotPath(baseline)), { recursive: true });
      await writeFile(
        info.snapshotPath(baseline),
        await reference.screenshot(),
      );
      expect(await actual.screenshot()).toMatchSnapshot(baseline, {
        threshold: 0.1,
        maxDiffPixels: 0,
      });
    }
    await page.getByRole("button", { name: "Open navigation" }).click();
    await legacy.getByRole("button", { name: "open drawer" }).click();
    await page.locator("aside").evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((a) => a.finished));
    });
    await legacy.waitForTimeout(250); // MUI's 225ms drawer transition.
  }
  await compare(
    page.locator("aside"),
    legacy.locator(".MuiDrawer-paper"),
    "navigation drawer",
  );
  await compare(
    page
      .getByRole("navigation", { name: "Sidebar" })
      .getByRole("link", { name: "Overview" }),
    legacy.getByRole("button", { name: "Overview" }).first(),
    "active overview item",
  );
  await compare(
    page.getByRole("button", { name: "Logout" }),
    legacy.getByRole("button", { name: "Logout" }),
    "logout button",
  );
  const baseline = `drawer-${info.project.name}.png`;
  await mkdir(dirname(info.snapshotPath(baseline)), { recursive: true });
  await writeFile(
    info.snapshotPath(baseline),
    await legacy.locator(".MuiDrawer-paper").screenshot(),
  );
  expect(await page.locator("aside").screenshot()).toMatchSnapshot(baseline, {
    threshold: 0.1,
    maxDiffPixels: 0,
  });
});

test("login OTP matches the legacy form and retains digits after reload", async ({
  page,
  context,
}, info) => {
  await prepare(page);
  const legacy = await context.newPage();
  await legacy.setViewportSize(page.viewportSize()!);
  await legacy.goto(`${REFERENCE}/login`);
  await page.goto("/login");
  for (const target of [legacy, page]) {
    await target
      .getByPlaceholder("Enter your email or username")
      .fill("example@example.com");
    await target.getByPlaceholder("Enter your password").fill("Example123");
    await target.getByRole("button", { name: "Log In", exact: true }).click();
    await expect(
      target.getByRole("button", { name: "Verify & Log In" }),
    ).toBeVisible();
    await target.mouse.move(0, 0);
    await ready(target);
  }
  const baseline = `otp-${info.project.name}.png`;
  await mkdir(dirname(info.snapshotPath(baseline)), { recursive: true });
  await writeFile(info.snapshotPath(baseline), await legacy.screenshot());
  expect(await page.screenshot()).toMatchSnapshot(baseline, {
    threshold: 0.1,
    maxDiffPixels: 0,
  });
  await page.getByLabel("Verification digit 1", { exact: true }).fill("123456");
  await page.reload();
  await expect(
    page.getByLabel("Verification digit 6", { exact: true }),
  ).toHaveValue("6");
  await page.getByLabel("Verification digit 3", { exact: true }).fill("");
  await expect(
    page.getByLabel("Verification digit 4", { exact: true }),
  ).toHaveValue("4");
});

test("registration OTP matches the legacy activation form", async ({
  page,
  context,
}, info) => {
  await prepare(page);
  const legacy = await context.newPage();
  await legacy.setViewportSize(page.viewportSize()!);
  await legacy.goto(`${REFERENCE}/register-parent`);
  await page.goto("/register-parent");
  for (const target of [legacy, page]) {
    await target.getByPlaceholder("First Name").fill("Example");
    await target.getByPlaceholder("Last Name").fill("Parent");
    await target
      .getByPlaceholder("Enter your email")
      .fill("example@example.com");
    await target.getByPlaceholder("Create password").fill("Example123");
    await target.getByPlaceholder("Confirm password").fill("Example123");
    await target.getByRole("button", { name: "Sign Up", exact: true }).click();
    await expect(
      target.getByRole("button", { name: "Verify & Activate Account" }),
    ).toBeVisible();
    await target.mouse.move(0, 0);
    await ready(target);
  }
  const baseline = `registration-otp-${info.project.name}.png`;
  await mkdir(dirname(info.snapshotPath(baseline)), { recursive: true });
  await writeFile(info.snapshotPath(baseline), await legacy.screenshot());
  expect(await page.screenshot()).toMatchSnapshot(baseline, {
    threshold: 0.1,
    maxDiffPixels: 0,
  });
});

for (const [role, currentPath, legacyPath] of [
  ["admin", "/teacher/dashboard", "/teacher/dashboard"],
  ["super-admin", "/super-admin/dashboard", "/chairman/dashboard"],
] as const) {
  test(`${role} navigation matches the original role drawer`, async ({
    page,
    context,
  }, info) => {
    await prepare(page, role);
    const legacy = await context.newPage();
    await legacy.setViewportSize(page.viewportSize()!);
    await legacy.goto(`${REFERENCE}${legacyPath}?role=${role}`);
    await page.goto(currentPath);
    await ready(legacy);
    await ready(page);
    if (info.project.name === "mobile") {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await legacy.getByRole("button", { name: "open drawer" }).click();
      await page.locator("aside").evaluate(async (el) => {
        await Promise.all(el.getAnimations().map((a) => a.finished));
      });
      await legacy.waitForTimeout(250);
    }
    const baseline = `${role}-drawer-${info.project.name}.png`;
    await mkdir(dirname(info.snapshotPath(baseline)), { recursive: true });
    await writeFile(
      info.snapshotPath(baseline),
      await legacy.locator(".MuiDrawer-paper").screenshot(),
    );
    expect(await page.locator("aside").screenshot()).toMatchSnapshot(baseline, {
      threshold: 0.1,
      maxDiffPixels: 0,
    });
    if (info.project.name === "mobile") {
      await page.keyboard.press("Escape");
      await expect(page.locator("aside")).not.toBeVisible();
      await expect(
        page.getByRole("button", { name: "Open navigation" }),
      ).toBeFocused();
    }
  });
}
