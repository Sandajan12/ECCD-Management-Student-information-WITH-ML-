import { expect, type Page } from "@playwright/test";
import type { SessionResponse, SessionUser } from "../../src/types";

export function sessionFor(user: SessionUser): SessionResponse {
  const claims = Buffer.from(
    JSON.stringify({ exp: Date.now() / 1000 + 3600, tokenType: "session" }),
  ).toString("base64url");
  const token = `test.${claims}.test`;
  return {
    success: true,
    token,
    access_token: token,
    user,
    requireOtp: false,
    requiresPasswordChange: false,
  };
}

// Register after broad API mocks so reloads restore RAM through the real auth flow.
export async function mockSession(page: Page, user: SessionUser | null) {
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill(
      user
        ? { json: sessionFor(user) }
        : { status: 401, json: { code: "INVALID_TOKEN" } },
    ),
  );
}

export async function setRamSession(page: Page, session: SessionResponse) {
  await page.evaluate(async (value) => {
    const path = "/src/services/api.ts";
    const { saveSession } = (await import(
      path
    )) as typeof import("../../src/services/api");
    saveSession(value);
  }, session);
}

export async function expectNoStoredCredentials(page: Page) {
  expect(
    await page.evaluate(() =>
      [localStorage, sessionStorage].flatMap((storage) =>
        [
          "token",
          "access_token",
          "refresh_token",
          "user",
          "role",
          "ames_device_token",
          "ames_login_remember_device",
          "ames_registration_remember_device",
        ].map((key) => storage.getItem(key)),
      ),
    ),
  ).toEqual(Array(16).fill(null));
}
