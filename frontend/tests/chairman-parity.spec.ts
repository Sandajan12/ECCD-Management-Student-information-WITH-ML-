import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
const logo =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23ffffff'/%3E%3Ctext x='50' y='64' font-size='40' text-anchor='middle' fill='%232563eb'%3EA%3C/text%3E%3C/svg%3E";
const settings = {
  system_title: "AMES",
  school_name: "Example School",
  principal_name: "Example Principal",
  primary_color: "#2563eb",
  secondary_color: "#111827",
  logo_url: logo,
  profile_pic_url: "",
  login_background: "",
  current_school_year: "2026-2027",
  school_year_start_month: 8,
  previous_school_year: null,
  last_rollover_timestamp: null,
  canRevertSchoolYear: false,
  daysRemaining: 0,
};
const teachers = [
  {
    teacher_id: 1,
    user_id: 2,
    first_name: "Example",
    last_name: "Teacher",
    username: "teacher",
    email: "teacher@example.com",
    employee_id: "T001",
    class_name: "Section A",
    section_name: "Section A",
    section_id: 1,
    role: "Primary Adviser",
    is_active: true,
    allow_eccd_question_management: false,
  },
];
const sections = [
  {
    section_id: 1,
    section_name: "Section A",
    adviser_teacher_id: 1,
    first_name: "Example",
    last_name: "Teacher",
    role: "Primary Adviser",
    status: "Active",
  },
];
const students = [
  {
    student_id: 1,
    lrn_number: "********1234",
    lrn: "********1234",
    masked_lrn: "********1234",
    first_name: "Example",
    middle_name: "",
    last_name: "Student",
    full_name: "Example Student",
    date_of_birth: "2020-01-01",
    gender: "Male",
    section_id: 1,
    section_name: "Section A",
    class_name: "Section A",
    school_year: "2026-2027",
    decimal_age: 6.58,
    is_active: true,
    address: "Example Address",
    emergency_contact: "09123456789",
    handedness: "Right",
    num_of_siblings: 1,
    birth_order: 1,
    profile_completeness: 100,
    parent_names: "Example Parent",
    parents: [],
  },
];
const domains = [
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
const logs = [
  {
    id: 1,
    log_id: 1,
    action: "Student Transfer",
    action_type: "Student Transfer",
    performed_by: "Example Teacher",
    teacher_name: "Example Teacher",
    details: "Transferred one student; evaluations preserved.",
    timestamp: "2026-08-01T09:30:00Z",
    created_at: "2026-08-01T09:30:00Z",
  },
];
async function prepare(page: Page, legacy = false) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "user",
      JSON.stringify({
        id: 1,
        username: "Example",
        role: "super-admin",
        is_first_login: 0,
        allow_eccd_question_management: false,
        section_id: null,
      }),
    );
    localStorage.setItem(
      "token",
      `reference.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.reference`,
    );
  });
  const fixtureDomains = structuredClone(domains);
  await page.route("**/api/**", async (route) => {
    if (route.request().method() === "PUT" && route.request().url().includes("/home-based")) {fixtureDomains[0].questions[0].is_home_based=route.request().postDataJSON().is_home_based;}
    const path = new URL(route.request().url()).pathname;
    const data =
      path === "/api/settings"
        ? settings
        : path.includes("dashboard-filters") ||
            path === "/api/analytics/filters"
          ? {
              sections: ["Section A"],
              domains: ["Gross Motor Domain"],
              schoolYears: ["2026-2027"],
            }
          : path.includes("dashboard-stats") || path === "/api/analytics/stats"
            ? {
                stats: { totalStudents: "1", totalTeachers: "1" },
                functionalMastery: { kaya: 0, dikaya: 0 },
              }
            : path.includes("dashboard-pie") || path.includes("pie-data")
              ? []
              : path.includes("teachers/active")
                ? teachers
                : path.includes("teachers/archived")
                  ? []
                  : path.includes("chairman/sections")
                    ? sections
                    : path === "/api/chairman/students"
                      ? students
                      : path === "/api/students/1"
                        ? students[0]
                        : path === "/api/chairman/eccd-data" ||
                            path === "/api/eccd-config/"
                          ? fixtureDomains
                          : path === "/api/logs" ||
                              path === "/api/analytics/logs"
                            ? logs
                            : [];
    await route.fulfill({ json: data });
  });
  if (legacy)
    await page.setExtraHTTPHeaders({ "X-Visual-Reference": "chairman" });
}
async function ready(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) => img.decode().catch(() => {})),
    );
  });
}
const pages = [
  { path: "dashboard", title: "Educational Overview" },
  { path: "teachers", title: "Teacher's Account Management" },
  { path: "students", title: "Enrolled Students" },
  { path: "audit", title: "System Audit Logs" },
  { path: "eccd-questions", title: "ECCD Questions Management" },
  { path: "settings", title: "System Personalization" },
];
for (const portal of pages)
  test(`Chairman ${portal.path} matches legacy structure`, async ({
    page,
    context,
  }, info) => {
    const reference = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    reference.on("pageerror", (err) => errors.push(`legacy: ${err.message}`));
    await prepare(page);
    await prepare(reference, true);
    await Promise.all([
      page.goto(`/super-admin/${portal.path}`),
      reference.goto(
        `http://localhost:5187/chairman/${portal.path}?role=super-admin`,
      ),
    ]);
    await expect(
      page.getByRole("heading", { name: portal.title, exact: true }),
    ).toBeVisible();
    await expect(
      reference.getByRole("heading", { name: portal.title, exact: true }),
    ).toBeVisible();
    if (portal.path === "teachers") {
      await expect(
        page.getByText("teacher@example.com", { exact: true }),
      ).toBeVisible();
      await expect(
        reference.getByText("teacher@example.com", { exact: true }),
      ).toBeVisible();
    }
    if (portal.path === "eccd-questions") {
      await expect(
        page.getByRole("button", { name: "Manage Questions" }),
      ).toHaveCount(3);
      await expect(
        reference.getByRole("button", { name: "Manage Questions" }),
      ).toHaveCount(3);
    }
    await ready(page);
    await ready(reference);
    await page.mouse.move(0, 0);
    await reference.mouse.move(0, 0);
    const measure = async (target: Page) =>
      target
        .getByRole("heading", { name: portal.title, exact: true })
        .evaluate((element) => {
          const s = getComputedStyle(element);
          const r = element.getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            fontSize: s.fontSize,
            fontWeight: s.fontWeight,
            lineHeight: s.lineHeight,
            color: s.color,
          };
        });
    const controls = async (target: Page)=>target.locator("button,th,td,label,input,legend,fieldset").evaluateAll(elements=>elements.map(element=>{const r=element.getBoundingClientRect();const s=getComputedStyle(element);return {text:element.textContent?.trim().slice(0,70),tag:element.tagName,x:r.x,y:r.y,width:r.width,height:r.height,padding:s.padding,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,transform:s.transform};}));
    await writeFile(info.outputPath("controls.json"),JSON.stringify({actual:await controls(page),expected:await controls(reference)},null,2));
    const actual = await measure(page),
      expected = await measure(reference);
    await writeFile(
      info.outputPath("measurements.json"),
      JSON.stringify({ actual, expected }, null, 2),
    );
    await page.screenshot({
      path: info.outputPath("current.png"),
      fullPage: true,
    });
    await reference.screenshot({
      path: info.outputPath("legacy.png"),
      fullPage: true,
    });
    if (info.project.name === "desktop") {
      const baseline=info.snapshotPath(`chairman-${portal.path}.png`);
      await mkdir(dirname(baseline),{recursive:true});
      await writeFile(baseline,await reference.screenshot());
      expect(await page.screenshot()).toMatchSnapshot(`chairman-${portal.path}.png`,{threshold:.1,maxDiffPixels:0});
    }
    expect(errors).toEqual([]);
    expect(actual.fontSize).toEqual(expected.fontSize);
    expect(actual.fontWeight).toEqual(expected.fontWeight);
    expect(actual.lineHeight).toEqual(expected.lineHeight);
    expect(actual.color).toEqual(expected.color);
    expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(1);
    // Student header/actions wrap on narrow screens instead of overflowing as in legacy.
    if (portal.path !== "students" || info.project.name !== "mobile")
      expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(1);
    await reference.close();
  });
test("Chairman teacher form retains drafts and question workspace opens the legacy table", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/super-admin/teachers");
  await page.getByRole("button", { name: "Add New Teacher" }).click();
  await page.getByLabel("Full Name").fill("Draft Teacher");
  await page.reload();
  await page.getByRole("button", { name: "Add New Teacher" }).click();
  await expect(page.getByLabel("Full Name")).toHaveValue("Draft Teacher");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goto("/super-admin/eccd-questions");
  await page.getByRole("button", { name: "Manage Questions" }).first().click();
  await expect(
    page.getByRole("columnheader", { name: "QUESTION / INDICATOR" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Home-based assessment" }).click();
  await expect(
    page.getByRole("button", { name: "Home-based assessment" }),
  ).toHaveAttribute("aria-pressed", "true");
});

interface DialogCase {name: string; path: string; open: (page: Page) => Promise<void>}
const dialogs: DialogCase[] = [
  {name:"Create New Section",path:"teachers",open:async page=>{await page.getByRole("button",{name:"Add New Teacher"}).click();await page.getByRole("combobox").click();await page.getByRole("option",{name:"+ Add New Section",exact:true}).click();}},
  {name:"New Teacher",path:"teachers",open:async page=>{await page.getByRole("button",{name:"Add New Teacher"}).click();}},
  {name:"Edit Teacher",path:"teachers",open:async page=>{await page.getByTitle("Edit Teacher").click();}},
  {name:"Archived Teacher Accounts",path:"teachers",open:async page=>{await page.getByRole("button",{name:"View Archive"}).click();}},
  {name:"Audit Action Details",path:"audit",open:async page=>{await page.getByRole("row").nth(1).click();}},
  {name:"Download ECCD Records",path:"students",open:async page=>{await page.getByRole("button",{name:"Download ECCD Records"}).click();}},
  {name:"Student Record Details",path:"students",open:async page=>{await page.getByRole("row").nth(1).click();}},
  {name:"Add Domain",path:"eccd-questions",open:async page=>{await page.getByRole("button",{name:"Add Domain"}).click();}},
  {name:"Add Question",path:"eccd-questions",open:async page=>{await page.getByRole("button",{name:"Manage Questions"}).first().click();await page.getByRole("button",{name:"Add Question"}).click();}},
];
for (const dialog of dialogs) test(`Chairman dialog ${dialog.name} matches legacy`,async({page,context},info)=>{
  const reference=await context.newPage();await prepare(page);await prepare(reference,true);
  await Promise.all([page.goto(`/super-admin/${dialog.path}`),reference.goto(`http://localhost:5187/chairman/${dialog.path}?role=super-admin`)]);
  if(dialog.path !== "eccd-questions") {await expect(page.getByRole("row").nth(1)).toBeVisible();await expect(reference.getByRole("row").nth(1)).toBeVisible();} else {await expect(page.getByRole("button",{name:"Manage Questions"})).toHaveCount(3);await expect(reference.getByRole("button",{name:"Manage Questions"})).toHaveCount(3);}
  await dialog.open(page);await dialog.open(reference);
  await expect(page.getByRole("dialog").last()).toBeVisible();await expect(reference.getByRole("dialog").last()).toBeVisible();
  await ready(page);await ready(reference);await page.mouse.move(0,0);await reference.mouse.move(0,0);
  await reference.evaluate(async()=>{await Promise.allSettled(document.getAnimations().filter(animation=>animation.effect?.getComputedTiming().iterations !== Infinity).map(animation=>animation.finished));});
  await page.evaluate(async()=>{await Promise.allSettled(document.getAnimations().filter(animation=>animation.effect?.getComputedTiming().iterations !== Infinity).map(animation=>animation.finished));});
  const actual=await page.getByRole("dialog").last().boundingBox(),expected=await reference.locator(".MuiDialog-paper").last().boundingBox();
  await writeFile(info.outputPath("dialog-measurements.json"),JSON.stringify({actual,expected},null,2));
  const controls = async (target: Page) => target.locator('[role="dialog"] label,[role="dialog"] .MuiTypography-caption,[role="dialog"] input,[role="dialog"] button,dialog label,dialog input,dialog button').evaluateAll(elements=>elements.map(element=>{const r=element.getBoundingClientRect(),s=getComputedStyle(element);return {text:element.textContent?.trim(),tag:element.tagName,x:r.x,y:r.y,width:r.width,height:r.height,padding:s.padding,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,color:s.color};}));
  await writeFile(info.outputPath("dialog-controls.json"),JSON.stringify({actual:await controls(page),expected:await controls(reference)},null,2));
  const baseline=info.snapshotPath(`chairman-dialog-${dialog.name.replaceAll(" ","-")}.png`);await mkdir(dirname(baseline),{recursive:true});
  // Compare the complete student dialog independently of the corrected mobile roster layout.
  if (dialog.path === "students") {
    await writeFile(baseline,await reference.getByRole("dialog").screenshot());
    await expect(page.getByRole("dialog")).toHaveScreenshot(`chairman-dialog-${dialog.name.replaceAll(" ","-")}.png`,{threshold:.1,maxDiffPixels:0,scale:"device"});
  } else {
    await writeFile(baseline,await reference.screenshot());
    expect(await page.screenshot()).toMatchSnapshot(`chairman-dialog-${dialog.name.replaceAll(" ","-")}.png`,{threshold:.1,maxDiffPixels:0});
  }
  await reference.close();
});
