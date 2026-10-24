import { expect, test } from "@playwright/test";
import type { SessionResponse } from "../src/types";
import scoringData from "../../backend/eccd_scoring_data.json" with { type: "json" };

const backend = "http://127.0.0.1:8774";
const domainNames = [
  "Gross Motor",
  "Fine Motor",
  "Self-Help",
  "Receptive Language",
  "Expressive Language",
  "Cognitive",
  "Socio-Emotional",
];
const domainFields = [
  "gm_pre_scaled",
  "fm_pre_scaled",
  "sh_pre_scaled",
  "rl_pre_scaled",
  "el_pre_scaled",
  "cog_pre_scaled",
  "se_pre_scaled",
];
const significant = "Suggests Significant Delay in Overall Development";
interface SandboxPrediction {
  features: Record<string, number | string | null>;
  predicted_post_interpretation: string;
}
interface SandboxDraft {
  values: Record<string, string>;
  is_pending_sync: boolean;
}

test.beforeEach(async ({ page, request }) => {
  expect((await request.post(`${backend}/__test/reset`)).ok()).toBeTruthy();
  const response = await request.post(`${backend}/api/auth/login`, {
    data: { email: "adviser@example.com", password: "Example123" },
  });
  expect(response.status()).toBe(200);
  const session = (await response.json()) as SessionResponse;
  await page.goto("/login");
  await page.evaluate((value) => {
    localStorage.setItem("user", JSON.stringify(value.user));
    localStorage.setItem("token", value.token);
  }, session);
  await page.goto("/teacher/ml-insights");
  await page.getByRole("tab", { name: "Sandbox Simulator" }).click();
  await expect(
    page.getByLabel("Sandbox prediction", { exact: true }),
  ).toBeVisible();
});

test("every domain updates official composites and all-one households retain Significant Delay", async ({
  page,
}) => {
  const standard = page.getByRole("spinbutton", {
    name: "PRE standard score (calculated)",
    exact: true,
  });
  const total = page.getByRole("spinbutton", {
    name: "PRE total scaled (calculated)",
    exact: true,
  });
  const delayed = page.getByRole("spinbutton", {
    name: /Domains.*6 \(calculated\)/,
  });
  await expect(standard).toHaveValue("66");
  await expect(standard).toHaveAttribute("readonly", "");
  const blankResponse = page.waitForResponse((response) => {
    if (
      !response.url().endsWith("/api/ml/predict/sandbox") ||
      response.status() !== 200
    )
      return false;
    const payload = response.request().postDataJSON() as Record<
      string,
      unknown
    >;
    return (
      domainFields.every((field) => payload[field] === 1) &&
      payload.num_siblings === null
    );
  });
  const entries: Record<string, { standardScore: number }> =
    scoringData["AGE 5.1 - 5.11"].standardScores;
  const available = Object.keys(entries)
    .map(Number)
    .sort((a, b) => a - b);
  for (const [index, name] of domainNames.entries()) {
    await page
      .getByRole("spinbutton", { name: `${name} scaled score`, exact: true })
      .fill("1");
    const sum = index + 1 + (6 - index) * 7;
    const closest =
      available.filter((value) => value <= sum).at(-1) ?? available[0];
    await expect(total).toHaveValue(String(sum));
    await expect(standard).toHaveValue(
      String(entries[String(closest)].standardScore),
    );
    await expect(delayed).toHaveValue(String(index + 1));
  }
  const blank = (await (await blankResponse).json()) as SandboxPrediction;
  expect(blank.features).toMatchObject({
    pre_total_scaled: 7,
    pre_standard_score: 37,
    pre_delayed_domains_count: 7,
  });
  expect(blank.predicted_post_interpretation).toBe(significant);
  const filledResponse = page.waitForResponse((response) => {
    if (
      !response.url().endsWith("/api/ml/predict/sandbox") ||
      response.status() !== 200
    )
      return false;
    const payload = response.request().postDataJSON() as Record<
      string,
      unknown
    >;
    return payload.num_siblings === 2 && payload.birth_order === 1;
  });
  await page
    .getByRole("combobox", { name: "Father’s education", exact: true })
    .selectOption("College");
  await page
    .getByRole("combobox", { name: "Mother’s education", exact: true })
    .selectOption("College");
  await page
    .getByRole("combobox", { name: "Household occupation tier", exact: true })
    .selectOption("Professional");
  await page
    .getByLabel("Siblings (blank if unknown)", { exact: true })
    .fill("2");
  await page
    .getByLabel("Birth order (blank if unknown)", { exact: true })
    .fill("1");
  const filled = (await (await filledResponse).json()) as SandboxPrediction;
  expect(filled.features.pre_standard_score).toBe(37);
  expect(filled.predicted_post_interpretation).toBe(significant);
  await expect(
    page
      .getByLabel("Sandbox prediction", { exact: true })
      .getByRole("heading", { name: significant, exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("stale draft composites normalize on reload and offline edits survive reconnect", async ({
  page,
  context,
}) => {
  await page
    .getByRole("spinbutton", { name: "Gross Motor scaled score", exact: true })
    .fill("1");
  await page.evaluate(
    ({ fields }) => {
      const key = "ames_draft_2_ml_sandbox_v1";
      const draft = JSON.parse(
        localStorage.getItem(key) || "null",
      ) as SandboxDraft;
      for (const field of fields) draft.values[field] = "1";
      draft.values.pre_standard_score = "80";
      draft.values.pre_total_scaled = "49";
      draft.values.pre_delayed_domains_count = "0";
      draft.values.mother_education_level = "College";
      localStorage.setItem(key, JSON.stringify(draft));
      localStorage.setItem("unrelated-draft-check", "keep");
    },
    { fields: domainFields },
  );
  await page.reload();
  await page.getByRole("tab", { name: "Sandbox Simulator" }).click();
  const standard = page.getByLabel("PRE standard score (calculated)", {
    exact: true,
  });
  await expect(standard).toHaveValue("37");
  await expect(
    page.getByRole("combobox", { name: "Mother’s education", exact: true }),
  ).toHaveValue("College");
  await expect(
    page.getByLabel("Sandbox prediction", { exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel("Gross Motor scaled score", { exact: true }).fill("19");
  await expect(
    page.getByLabel("PRE total scaled (calculated)", { exact: true }),
  ).toHaveValue("25");
  await expect(standard).toHaveValue("37");
  await expect(
    page.getByRole("alert").filter({ hasText: "offline" }),
  ).toBeVisible();
  const draft = await page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem("ames_draft_2_ml_sandbox_v1") || "null",
      ) as SandboxDraft,
  );
  expect(draft.values.gm_pre_scaled).toBe("19");
  expect(draft.values.pre_standard_score).toBe("37");
  expect(draft.is_pending_sync).toBe(true);
  await context.setOffline(false);
  await expect(
    page.getByLabel("Sandbox prediction", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Sandbox Simulator" }).click();
  await expect(
    page.getByLabel("Gross Motor scaled score", { exact: true }),
  ).toHaveValue("19");
  await expect(standard).toHaveValue("37");
  expect(
    await page.evaluate(() => localStorage.getItem("unrelated-draft-check")),
  ).toBe("keep");
  await page.screenshot({
    path: test.info().outputPath("sandbox-score-sync.png"),
    fullPage: true,
  });
});
