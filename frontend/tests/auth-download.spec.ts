import { expect, test } from "@playwright/test";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";

const downloadUrl =
  process.env.VITE_PARENT_APP_DOWNLOAD_URL?.trim() ||
  "/downloads/ames-parent.apk";
const downloadBody = "synthetic APK for the download-link interaction check";

for (const registration of [false, true]) {
  test(`${registration ? "registration" : "login"} Download App stays top-right outside the card and preserves inputs`, async ({
    page,
    context,
  }, info) => {
    const submissions: string[] = [];
    page.on("pageerror", (error) => { throw error; });
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (pathname === "/api/auth/refresh") {
        await route.fulfill({ status: 401, json: { code: "INVALID_TOKEN" } });
      } else if (pathname === "/api/settings") {
        await route.fulfill({ json: {
          system_name: "Sample School System",
          logo_url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
          primary_color: "#2563eb",
        } });
      } else {
        submissions.push(`${request.method()} ${pathname}`);
        await route.abort();
      }
    });
    await page.goto(registration ? "/register-parent" : "/login");
    const download = page.getByRole("link", { name: "Download App", exact: true });
    const card = page.locator("[data-auth-card]");
    await expect(download).toBeVisible();
    await expect(download).toHaveAttribute("href", downloadUrl);
    await expect(download).toHaveAttribute("download", "ames-parent.apk");
    await expect(download).toHaveAttribute("target", "_blank");
    await expect(download).toHaveAttribute("rel", "noopener noreferrer");
    await expect(download.locator("svg")).toBeVisible();
    expect(await download.evaluate((el) => el.closest("[data-auth-card], form") === null)).toBe(true);

    const expectPlacement = async () => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(download).toBeInViewport();
      const bounds = await download.boundingBox();
      const cardBounds = await card.boundingBox();
      const viewport = page.viewportSize()!;
      expect(bounds).not.toBeNull();
      expect(cardBounds).not.toBeNull();
      const inset = viewport.width >= 640 ? 24 : 16;
      expect(bounds!.y).toBeCloseTo(inset, 0);
      expect(viewport.width - bounds!.x - bounds!.width).toBeCloseTo(inset, 0);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.y + bounds!.height + 16).toBeLessThanOrEqual(cardBounds!.y);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    };
    await expectPlacement();
    await page.screenshot({ path: info.outputPath("auth-download.png"), fullPage: true });
    await page.getByLabel("Email", { exact: true }).fill("parent@example.com");
    await page.getByLabel("Password", { exact: true }).fill("Example123");
    if (registration) {
      await page.getByLabel("First name", { exact: true }).fill("Sample");
      await page.getByLabel("Last name", { exact: true }).fill("Parent");
      await page.getByLabel("Confirm password", { exact: true }).fill("Example123");
    }
    const storageBefore = await page.evaluate(() => ({
      local: { ...localStorage }, session: { ...sessionStorage },
    }));
    const pageUrl = page.url();
    const resolvedDownloadUrl = new URL(downloadUrl, pageUrl).href;
    await context.route(resolvedDownloadUrl, async (route) => {
      expect(route.request().headers().authorization).toBeUndefined();
      await route.fulfill({
        contentType: "application/vnd.android.package-archive",
        headers: { "Content-Disposition": 'attachment; filename="ames-parent.apk"' },
        body: downloadBody,
      });
    });
    await download.focus();
    await expect(download).toBeFocused();
    const downloaded = page.waitForEvent("download");
    await page.keyboard.press("Enter");
    const artifact = await downloaded;
    expect(artifact.url()).toBe(resolvedDownloadUrl);
    expect(artifact.suggestedFilename()).toBe("ames-parent.apk");
    const savedPath = info.outputPath("download.apk");
    await artifact.saveAs(savedPath);
    expect((await stat(savedPath)).size).toBeGreaterThan(0);
    if (downloadUrl === "/downloads/ames-parent.apk") {
      const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
      expect(digest(await readFile(savedPath))).toBe(digest(await readFile(
        new URL("../public/downloads/ames-parent.apk", import.meta.url),
      )));
    }
    expect(page.url()).toBe(pageUrl);
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue("parent@example.com");
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("Example123");
    if (registration) {
      await expect(page.getByLabel("First name", { exact: true })).toHaveValue("Sample");
      await expect(page.getByLabel("Last name", { exact: true })).toHaveValue("Parent");
      await expect(page.getByLabel("Confirm password", { exact: true })).toHaveValue("Example123");
    }
    expect(await page.evaluate(() => ({
      local: { ...localStorage }, session: { ...sessionStorage },
    }))).toEqual(storageBefore);
    expect(submissions).toEqual([]);
    await page.setViewportSize({ width: 844, height: 390 });
    await expectPlacement();
  });
}
