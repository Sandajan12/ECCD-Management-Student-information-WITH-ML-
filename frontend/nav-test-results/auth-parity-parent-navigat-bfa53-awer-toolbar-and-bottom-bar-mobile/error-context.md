# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-parity.spec.ts >> parent navigation matches the legacy drawer, toolbar and bottom bar
- Location: tests\auth-parity.spec.ts:86:1

# Error details

```
Error: expect(Buffer).toMatchSnapshot(expected) failed

  118270 pixels (ratio 0.08 of all image pixels) are different.

  Snapshot: drawer-mobile.png

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - button "Open navigation" [expanded] [active] [ref=e5] [cursor=pointer]
    - generic [ref=e8]: Example School
  - button "Close navigation" [ref=e9] [cursor=pointer]
  - dialog "Main navigation" [ref=e10]:
    - generic [ref=e11]:
      - generic [ref=e12]:
        - img "System Logo" [ref=e13]
        - paragraph [ref=e14]: Example School
        - paragraph [ref=e15]: Parent Portal
      - navigation "Sidebar" [ref=e16]:
        - link "Overview" [ref=e18] [cursor=pointer]:
          - /url: /parent/dashboard
        - link "ECCD Management" [ref=e24] [cursor=pointer]:
          - /url: /parent/eccdassessment
        - link "Child Information" [ref=e30] [cursor=pointer]:
          - /url: /parent/childinformation
        - link "Messages" [ref=e36] [cursor=pointer]:
          - /url: /parent/messages
    - button "Logout" [ref=e42] [cursor=pointer]
  - main [ref=e46]:
    - generic [ref=e47]:
      - generic [ref=e48]:
        - heading "Your child’s learning journey" [level=1] [ref=e49]
        - paragraph [ref=e50]: A little progress every day makes a big difference.
      - button "Link a child" [ref=e52] [cursor=pointer]
    - generic [ref=e54]:
      - text: Select child
      - combobox "Select child" [ref=e55]
    - generic [ref=e57]:
      - paragraph [ref=e58]: Enter the 12-digit LRN provided by your child’s teacher to link their record.
      - generic [ref=e59]:
        - text: Child’s LRN
        - textbox "Child’s LRN" [ref=e60]
      - button "Link child" [ref=e61] [cursor=pointer]
  - navigation "Parent bottom navigation" [ref=e62]:
    - link "Overview" [ref=e63] [cursor=pointer]:
      - /url: /parent/dashboard
    - link "ECCD Management" [ref=e68] [cursor=pointer]:
      - /url: /parent/eccdassessment
      - generic [ref=e72]: ECCD
    - link "Child Information" [ref=e73] [cursor=pointer]:
      - /url: /parent/childinformation
      - generic [ref=e77]: Child
    - link "Messages" [ref=e78] [cursor=pointer]:
      - /url: /parent/messages
```

# Test source

```ts
  4   | import { dirname } from "node:path";
  5   | const REFERENCE = "http://localhost:5187";
  6   | const logo = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23ffffff'/%3E%3Ctext x='50' y='64' font-size='40' text-anchor='middle' fill='%232563eb'%3EA%3C/text%3E%3C/svg%3E";
  7   | const settings = { school_name: "Example School", system_title: "AMES", primary_color: "#2563eb", secondary_color: "#111827", logo_url: logo, login_background: "", current_school_year: "2026-2027" };
  8   | async function prepare(page: Page, role?: string, firstLogin = false) {
  9   |   await page.route("**/api/**", async (route) => {
  10  |     const path = new URL(route.request().url()).pathname;
  11  |     const data = path === "/api/settings" ? settings : path.includes("auth/login") ? { success: true, requireOtp: true, challengeToken: "reference", email: "example@example.com", emailSent: true } : path.includes("unread") ? { unreadCount: 0 } : path.includes("access-controls") ? { allow_eccd_question_management: false, section_id: null, section_name: null } : path.includes("contacts") ? { myId: null, contacts: [] } : [];
  12  |     await route.fulfill({ json: data });
  13  |   });
  14  |   if (role) await page.addInitScript(({ role, firstLogin }) => {
  15  |     localStorage.setItem("user", JSON.stringify({ id: 1, username: "Example", role, is_first_login: firstLogin ? 1 : 0, allow_eccd_question_management: false, section_id: null }));
  16  |     localStorage.setItem("token", `reference.${btoa(JSON.stringify({ exp: Math.floor(Date.now()/1000)+3600 }))}.reference`);
  17  |   }, { role, firstLogin });
  18  | }
  19  | async function ready(page: Page) {
  20  |   await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).map((image) => image.decode().catch(() => {}))); });
  21  | }
  22  | const properties = ["backgroundColor", "color", "borderRadius", "borderTopWidth", "borderTopColor", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "boxShadow"] as const;
  23  | async function measure(locator: Locator) {
  24  |   return locator.evaluate((element, keys) => {
  25  |     const style = getComputedStyle(element);
  26  |     const rect = element.getBoundingClientRect();
  27  |     return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, styles: Object.fromEntries(keys.map((key) => [key, key === "boxShadow" ? style.boxShadow.replace(/rgba\(0, 0, 0, 0\) 0px 0px 0px 0px, ?/g, "") : style[key as keyof CSSStyleDeclaration]])) };
  28  |   }, properties);
  29  | }
  30  | async function compare(actual: Locator, reference: Locator, label: string, tolerance = 1) {
  31  |   const a = await measure(actual); const b = await measure(reference);
  32  |   for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(a.rect[key]-b.rect[key]), `${label}.${key}: current ${a.rect[key]} vs legacy ${b.rect[key]}`).toBeLessThanOrEqual(tolerance);
  33  | }
  34  | for (const width of [390, 600, 899, 900, 1280]) {
  35  |   test(`login matches the rendered legacy card and fields at ${width}px`, async ({ page, context }, info) => {
  36  |     test.skip(info.project.name !== "desktop", "Explicit viewport matrix covers both layouts.");
  37  |     await page.setViewportSize({ width, height: 900 });
  38  |     await prepare(page);
  39  |     const legacy = await context.newPage(); await legacy.setViewportSize({ width, height: 900 });
  40  |     await legacy.goto(`${REFERENCE}/login`); await page.goto("/login"); await ready(legacy); await ready(page);
  41  |     await compare(page.locator('[data-auth-card="login"]'), legacy.locator(".MuiPaper-root"), "login card");
  42  |     await compare(page.getByRole("heading"), legacy.getByRole("heading"), "school title");
  43  |     await compare(page.getByPlaceholder("Enter your email or username"), legacy.getByPlaceholder("Enter your email or username"), "username input");
  44  |     await compare(page.getByPlaceholder("Enter your password"), legacy.getByPlaceholder("Enter your password"), "password input");
  45  |     await compare(page.getByRole("button", { name: "Log In", exact: true }), legacy.getByRole("button", { name: "Log In", exact: true }), "login button");
  46  |     expect((await measure(page.locator('[data-auth-card="login"]'))).styles).toMatchObject((await measure(legacy.locator(".MuiPaper-root"))).styles);
  47  |     await page.screenshot({ path: `test-results/parity-login-${width}.png`, fullPage: true });
  48  |     await legacy.screenshot({ path: `test-results/legacy-login-${width}.png`, fullPage: true });
  49  |     const baselineName = `login-${width}.png`;
  50  |     await mkdir(dirname(info.snapshotPath(baselineName)), { recursive: true });
  51  |     await writeFile(info.snapshotPath(baselineName), await legacy.screenshot());
  52  |     expect(await page.screenshot()).toMatchSnapshot(baselineName, { threshold: 0.1, maxDiffPixels: 0 });
  53  |   });
  54  |   test(`registration matches the rendered legacy layout at ${width}px`, async ({ page, context }, info) => {
  55  |     test.skip(info.project.name !== "desktop", "Explicit viewport matrix covers both layouts.");
  56  |     await page.setViewportSize({ width, height: 900 }); await prepare(page);
  57  |     const legacy = await context.newPage(); await legacy.setViewportSize({ width, height: 900 });
  58  |     await legacy.goto(`${REFERENCE}/register-parent`); await page.goto("/register-parent"); await ready(legacy); await ready(page);
  59  |     await compare(page.locator('[data-auth-card="registration"]'), legacy.locator(".MuiPaper-root"), "registration card");
  60  |     await compare(page.getByPlaceholder("First Name"), legacy.getByPlaceholder("First Name"), "first name input");
  61  |     await compare(page.getByPlaceholder("Enter your email"), legacy.getByPlaceholder("Enter your email"), "registration email input");
  62  |     await compare(page.getByRole("button", { name: "Sign Up", exact: true }), legacy.getByRole("button", { name: "Sign Up", exact: true }), "registration button");
  63  |     await page.screenshot({ path: `test-results/parity-registration-${width}.png`, fullPage: true });
  64  |     await legacy.screenshot({ path: `test-results/legacy-registration-${width}.png`, fullPage: true });
  65  |     const baselineName = `registration-${width}.png`;
  66  |     await mkdir(dirname(info.snapshotPath(baselineName)), { recursive: true });
  67  |     await writeFile(info.snapshotPath(baselineName), await legacy.screenshot({ fullPage: true }));
  68  |     expect(await page.screenshot({ fullPage: true })).toMatchSnapshot(baselineName, { threshold: 0.1, maxDiffPixels: 0 });
  69  |   });
  70  | }
  71  | test("first-login dialog matches legacy geometry and remains mandatory", async ({ page, context }, info) => {
  72  |   const legacy = await context.newPage(); await prepare(page, "admin", true);
  73  |   await legacy.setViewportSize(page.viewportSize()!);
  74  |   await legacy.goto(`${REFERENCE}/first-login`); await page.goto("/teacher/dashboard"); await ready(legacy); await ready(page);
  75  |   await compare(page.getByRole("dialog"), legacy.locator(".MuiDialog-paper"), "password dialog");
  76  |   const baseline = `password-dialog-${info.project.name}.png`;
  77  |   await mkdir(dirname(info.snapshotPath(baseline)), { recursive: true });
  78  |   await writeFile(info.snapshotPath(baseline), await legacy.locator(".MuiDialog-paper").screenshot());
  79  |   expect(await page.getByRole("dialog").screenshot()).toMatchSnapshot(baseline, { threshold: 0.1, maxDiffPixels: 0 });
  80  |   await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toBeVisible();
  81  |   await page.getByLabel("New password", { exact: true }).fill("Example123");
  82  |   await page.getByLabel("Confirm new password", { exact: true }).fill("Wrong123");
  83  |   await expect(page.getByText("Passwords do not match")).toBeVisible();
  84  |   await expect(page.getByRole("button", { name: "Save Password & Continue" })).toBeDisabled();
  85  | });
  86  | test("parent navigation matches the legacy drawer, toolbar and bottom bar", async ({ page, context }, info) => {
  87  |   await prepare(page, "user"); const legacy = await context.newPage();
  88  |   await legacy.setViewportSize(page.viewportSize()!);
  89  |   await legacy.goto(`${REFERENCE}/parent/dashboard?role=user`); await page.goto("/parent/dashboard"); await ready(legacy); await ready(page);
  90  |   if (info.project.name === "mobile") {
  91  |     await compare(page.getByRole("banner"), legacy.locator(".MuiAppBar-root"), "mobile app bar");
  92  |     await compare(page.getByRole("navigation", { name: "Parent bottom navigation" }), legacy.locator("nav").last(), "parent bottom bar");
  93  |     await page.getByRole("button", { name: "Open navigation" }).click();
  94  |     await legacy.getByRole("button", { name: "open drawer" }).click();
  95  |     await page.locator("aside").evaluate(async (element) => { await Promise.all(element.getAnimations().map((a) => a.finished)); });
  96  |     await legacy.waitForTimeout(250); // MUI's 225ms drawer transition.
  97  |   }
  98  |   await compare(page.locator("aside"), legacy.locator(".MuiDrawer-paper"), "navigation drawer");
  99  |   await compare(page.getByRole("navigation", { name: "Sidebar" }).getByRole("link", { name: "Overview" }), legacy.getByRole("button", { name: "Overview" }).first(), "active overview item");
  100 |   await compare(page.getByRole("button", { name: "Logout" }), legacy.getByRole("button", { name: "Logout" }), "logout button");
  101 |   const baseline = `drawer-${info.project.name}.png`;
  102 |   await mkdir(dirname(info.snapshotPath(baseline)), { recursive: true });
  103 |   await writeFile(info.snapshotPath(baseline), await legacy.locator(".MuiDrawer-paper").screenshot());
> 104 |   expect(await page.locator("aside").screenshot()).toMatchSnapshot(baseline, { threshold: 0.1, maxDiffPixels: 0 });
      |                                                    ^ Error: expect(Buffer).toMatchSnapshot(expected) failed
  105 | });
  106 | 
```