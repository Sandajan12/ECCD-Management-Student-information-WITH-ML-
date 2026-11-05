import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { SessionResponse } from "../src/types";

const backend = "http://127.0.0.1:8775";
const noticeTitle = "Terms and Conditions and Data Privacy Notice";
const termsBox = (page: Page) =>
  page.getByRole("checkbox", { name: /I have read and agree/ });
const privacyDialog = (page: Page) =>
  page.getByRole("dialog", { name: noticeTitle, exact: true });
const review = (page: Page) =>
  page.getByRole("button", {
    name: /^Terms and Conditions(?: and Data Privacy Notice)?$/,
  });

async function fillRegistration(page: Page) {
  await page.getByLabel("First name", { exact: true }).fill("Sample");
  await page.getByLabel("Last name", { exact: true }).fill("Guardian");
  await page
    .getByLabel("Email", { exact: true })
    .fill("registration@example.com");
  await page.getByLabel("Password", { exact: true }).fill("Example123");
  await page.getByLabel("Confirm password", { exact: true }).fill("Example123");
}

async function fillLogin(page: Page, name = "adviser") {
  await page.getByLabel("Email", { exact: true }).fill(`${name}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("Example123");
}

async function acceptModal(page: Page) {
  await review(page).click();
  await privacyDialog(page)
    .getByRole("button", { name: "I Agree & Accept" })
    .click();
  await expect(privacyDialog(page)).toHaveCount(0);
  await expect(termsBox(page)).toBeChecked();
}

async function expectFits(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const dialog = privacyDialog(page);
  if (await dialog.count()) {
    const bounds = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport!.height);
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await expect(
      dialog.getByRole("button", { name: "I Agree & Accept" }),
    ).toBeInViewport();
  }
}

test.beforeEach(async ({ request, page }) => {
  expect((await request.post(`${backend}/__test/reset`)).ok()).toBe(true);
  page.on("pageerror", (error) => {
    throw error;
  });
});

for (const registration of [false, true]) {
  test(`${registration ? "registration" : "login"} blocks unchecked submission and shares accessible privacy review`, async ({
    page,
  }, info) => {
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/api/auth/"))
        requests.push(request.url());
    });
    await page.goto(registration ? "/register-parent" : "/login");
    if (registration) await fillRegistration(page);
    else await fillLogin(page);
    const submit = page.getByRole("button", {
      name: registration ? "Sign Up" : "Log In",
      exact: true,
    });
    await expect(termsBox(page)).not.toBeChecked();
    await expect(submit).toBeDisabled();
    await expect(termsBox(page)).toHaveAccessibleDescription(
      "Please read and accept the terms and privacy notice to continue.",
    );
    await page.locator("form").dispatchEvent("submit");
    await expect(page.getByRole("alert")).toContainText("Please accept");
    expect(requests).toEqual([]);
    await review(page).click();
    const dialog = privacyDialog(page);
    await expect(dialog).toBeVisible();
    for (const text of [
      "Republic Act No. 10173",
      "DepEd Order",
      "Learner Reference Number",
      "residential",
      "educational attainment",
      "birth order",
      "KAYA /",
      "Pre-Test",
      "Mid-Test",
      "Post-Test",
      "Gross Motor",
      "Fine Motor",
      "Self-Help",
      "Receptive Language",
      "Expressive Language",
      "Cognitive",
      "Socio-Emotional",
      "Random Forest",
      "not clinical or medical diagnoses",
      "never alter or replace official",
      "Synced Parents",
      "encrypted",
      "retention schedule",
      "National Privacy Commission",
    ]) {
      await expect(dialog).toContainText(text);
    }
    await expectFits(page);
    await dialog.screenshot({
      path: `test-results/terms-privacy/${info.project.name}-${registration ? "registration" : "login"}.png`,
    });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(termsBox(page)).not.toBeChecked();
    await review(page).click();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(review(page)).toBeFocused();
    await expect(termsBox(page)).not.toBeChecked();
    await acceptModal(page);
    await expect(submit).toBeEnabled();
    await termsBox(page).uncheck();
    await expect(submit).toBeDisabled();
    expect(requests).toEqual([]);
  });
}

test("registration sends acceptance, creates a real account, and clears only confirmed auth drafts", async ({
  page,
  request,
}) => {
  await page.goto("/register-parent");
  await fillRegistration(page);
  await page.evaluate(() =>
    localStorage.setItem("ames_draft_unrelated", "keep"),
  );
  await acceptModal(page);
  const response = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/register-parent"),
  );
  await page.getByRole("button", { name: "Sign Up" }).click();
  const registration = await response;
  expect(registration.status()).toBe(201);
  expect(registration.request().postDataJSON()).toMatchObject({
    terms_accepted: true,
    email: "registration@example.com",
  });
  await expect(page).toHaveURL(/\/parent\/dashboard$/);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("ames_registration_terms_accepted_v1"),
    ),
  ).toBeNull();
  expect(
    await page.evaluate(() => sessionStorage.getItem("ames_registration")),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem("ames_draft_unrelated")),
  ).toBe("keep");
  const login = await request.post(`${backend}/api/auth/login`, {
    data: { email: "registration@example.com", password: "Example123" },
  });
  expect(login.status()).toBe(200);
  expect(((await login.json()) as SessionResponse).user.role).toBe("user");
});

for (const [name, role, destination] of [
  ["adviser", "admin", "teacher"],
  ["parent", "user", "parent"],
  ["chairman", "super-admin", "super-admin"],
]) {
  test(`${name} acknowledges privacy before real sign-in`, async ({ page }) => {
    await page.goto("/login");
    await fillLogin(page, name);
    await expect(
      page.getByRole("button", { name: "Log In", exact: true }),
    ).toBeDisabled();
    await termsBox(page).check();
    const response = page.waitForResponse((response) =>
      response.url().endsWith("/api/auth/login"),
    );
    await page.getByRole("button", { name: "Log In", exact: true }).click();
    const login = await response;
    expect(login.status()).toBe(200);
    expect(((await login.json()) as SessionResponse).user.role).toBe(role);
    await expect(page).toHaveURL(new RegExp(`/${destination}/dashboard$`));
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem("ames_login_terms_accepted_v1"),
      ),
    ).toBeNull();
    expect(
      await page.evaluate(() => sessionStorage.getItem("ames_login_password")),
    ).toBeNull();
  });
}

test("failed registration and reload retain acceptance and inputs until confirmed success", async ({
  page,
}) => {
  await page.route(
    "**/api/auth/register-parent",
    (route) => route.abort("internetdisconnected"),
    { times: 1 },
  );
  await page.goto("/register-parent");
  await fillRegistration(page);
  await termsBox(page).check();
  await page.getByRole("button", { name: "Sign Up" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Your draft is saved on this device. Reconnect and submit again.",
  );
  await page.reload();
  await expect(termsBox(page)).toBeChecked();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    "registration@example.com",
  );
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
    "Example123",
  );
  await page.getByRole("button", { name: "Sign Up" }).click();
  await expect(page).toHaveURL(/\/parent\/dashboard$/);
});

for (const registration of [false, true]) {
  test(`${registration ? "registration" : "login"} OTP recovery requires acknowledgment and allows privacy review`, async ({
    page,
    request,
  }) => {
    const session = (await (
      await request.post(`${backend}/api/auth/login`, {
        data: {
          email: registration ? "parent@example.com" : "adviser@example.com",
          password: "Example123",
        },
      })
    ).json()) as SessionResponse;
    let attempts = 0;
    let verifications = 0;
    const path = registration ? "/api/auth/register-parent" : "/api/auth/login";
    await page.route(`**${path}`, async (route) => {
      attempts++;
      await route.fulfill({
        status: registration ? 201 : 200,
        json: {
          success: true,
          requireOtp: true,
          requiresOtp: true,
          email: "otp@example.com",
          challengeToken: "test-bound-challenge",
          emailSent: true,
        },
      });
    });
    await page.route("**/api/auth/verify-otp", async (route) => {
      verifications++;
      expect(route.request().postDataJSON()).toMatchObject({
        challengeToken: "test-bound-challenge",
        otp: "123456",
      });
      await route.fulfill({ status: 200, json: session });
    });
    await page.goto(registration ? "/register-parent" : "/login");
    if (registration) await fillRegistration(page);
    else await fillLogin(page);
    await termsBox(page).check();
    await page
      .getByRole("button", {
        name: registration ? "Sign Up" : "Log In",
        exact: true,
      })
      .click();
    await expect(page.getByLabel("Verification digit 1")).toBeVisible();
    // Simulate an OTP challenge saved before this feature, without a saved acknowledgment.
    await page.evaluate(
      (key) => sessionStorage.removeItem(key),
      registration
        ? "ames_registration_terms_accepted_v1"
        : "ames_login_terms_accepted_v1",
    );
    await page.reload();
    await expect(termsBox(page)).not.toBeChecked();
    const verify = page.getByRole("button", {
      name: registration ? "Verify & Activate Account" : "Verify & Log In",
    });
    await expect(verify).toBeDisabled();
    await expect(page.getByRole("button", { name: /Resend/ })).toBeDisabled();
    await page.getByLabel("Verification digit 1").fill("123456");
    await verify.locator("..").dispatchEvent("submit");
    await expect(page.getByRole("alert")).toContainText("Please accept");
    expect(verifications).toBe(0);
    await review(page).click();
    await expect(privacyDialog(page)).toBeVisible();
    await expectFits(page);
    await page.keyboard.press("Escape");
    await expect(privacyDialog(page)).toHaveCount(0);
    await expect(page.getByLabel("Verification digit 1")).toBeVisible();
    await acceptModal(page);
    await page.reload();
    await expect(termsBox(page)).toBeChecked();
    await expect(page.getByLabel("Verification digit 6")).toHaveValue("6");
    await verify.click();
    await expect(page).toHaveURL(
      registration ? /\/parent\/dashboard$/ : /\/teacher\/dashboard$/,
    );
    expect(attempts).toBe(1);
    expect(verifications).toBe(1);
    expect(
      await page.evaluate(
        (key) => sessionStorage.getItem(key),
        registration
          ? "ames_registration_terms_accepted_v1"
          : "ames_login_terms_accepted_v1",
      ),
    ).toBeNull();
  });
}
