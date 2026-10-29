import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { SessionResponse } from "../src/types";
import {
  sandboxAge,
  sandboxScaledScore,
  sandboxStandardScore,
  sandboxStandardResult,
} from "../src/utils/mlScoring";

const backend = "http://127.0.0.1:8774";
const draftKey = "ames_draft_2_ml_sandbox_raw_v2";
const legacyKey = "ames_draft_2_ml_sandbox_v1";
const names = [
  "Gross Motor",
  "Fine Motor",
  "Self-Help",
  "Receptive Language",
  "Expressive Language",
  "Cognitive",
  "Socio-Emotional",
];
const codes = ["GM", "FM", "SH", "RL", "EL", "C", "SE"] as const;
const scaledFields = [
  "gm_pre_scaled",
  "fm_pre_scaled",
  "sh_pre_scaled",
  "rl_pre_scaled",
  "el_pre_scaled",
  "cog_pre_scaled",
  "se_pre_scaled",
];
const maxima = [13, 11, 27, 5, 8, 21, 24];
const sample = [10, 8, 20, 4, 6, 16, 18];
interface SandboxPrediction {
  features: Record<string, number | string | null>;
  predicted_post_interpretation: string | null;
  prediction_status: "available";
  confidence_percentages: Record<string, number>;
  pre_interpretation: string;
}
interface SandboxDraft {
  values: Record<string, string>;
  is_pending_sync: boolean;
  revision: string;
}
interface ScenarioOracle extends SandboxPrediction {
  name: string;
  age_months: number;
  raw_scores: Record<(typeof codes)[number], number> | null;
}
function scenarioOracles(): ScenarioOracle[] {
  const script = `
import json
from backend.ml.train_random_forest import acceptance_profiles
from backend.ml.inference import predict_student
rows=[]
for scenario in acceptance_profiles():
    if scenario['gender'] != 'FEMALE' or scenario['handedness'] != 'Right':
        continue
    features={key:(None if key in ('mother_education_level','father_education_level','household_occupation_tier','num_siblings','birth_order') else value) for key,value in scenario['features'].items()}
    result=predict_student(features)
    rows.append({**scenario,'features':features,**result,'confidence_percentages':{key:value*100 for key,value in result['class_probabilities'].items()}})
print(json.dumps(rows,allow_nan=False))
`;
  return JSON.parse(
    execFileSync(
      "uv",
      ["run", "--no-project", "--python", ".venv312", "python", "-c", script],
      {
        cwd: path.resolve(import.meta.dirname, "../.."),
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      },
    ),
  ) as ScenarioOracle[];
}
const score = (page: Page) =>
  page.getByLabel("PRE standard score (calculated)", { exact: true });
const result = (page: Page) =>
  page.getByLabel("Sandbox prediction", { exact: true });
async function fillRaw(page: Page, raw = sample) {
  for (const [i, name] of names.entries())
    await page
      .getByLabel(`${name} raw score`, { exact: true })
      .fill(String(raw[i]));
}
function responseFor(
  page: Page,
  matches: (features: SandboxPrediction["features"]) => boolean,
) {
  return page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/ml/predict/sandbox") &&
      response.status() === 200 &&
      matches(
        response.request().postDataJSON() as SandboxPrediction["features"],
      ),
  );
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
});

test("frontend conversions match backend across every raw value and supported month", async () => {
  const script = `
import json
from decimal import Decimal, ROUND_HALF_UP
from backend.ml.common import DOMAINS, score_raw
from backend.utils.eccd_scorer import get_age_bracket, lookup_standard_score
rows=[]
for months in range(36,72):
    age=float((Decimal(months)/12).quantize(Decimal('0.1'),rounding=ROUND_HALF_UP))
    raw={code:0 for code in DOMAINS}
    converted={code:[score_raw({**raw,code:value},age)['scaled_scores'][code] for value in range(maximum+1)] for code,(_,maximum) in DOMAINS.items()}
    rows.append({'months':months,'decimalAge':age,'bracket':get_age_bracket(age),'scaled':converted,'standard':[lookup_standard_score(total,age) for total in range(134)]})
print(json.dumps(rows))
`;
  interface OracleRow {
    months: number;
    decimalAge: number;
    bracket: string;
    scaled: Record<(typeof codes)[number], number[]>;
    standard: { standardScore: number; interpretation: string }[];
  }
  const rows = JSON.parse(
    execFileSync(
      "uv",
      ["run", "--no-project", "--python", ".venv312", "python", "-c", script],
      {
        cwd: path.resolve(import.meta.dirname, "../.."),
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
      },
    ),
  ) as OracleRow[];
  for (const row of rows) {
    expect(sandboxAge(row.months)).toEqual({
      decimalAge: row.decimalAge,
      bracket: row.bracket,
    });
    for (const code of codes)
      expect(
        row.scaled[code].map((_, raw) =>
          sandboxScaledScore(code, raw, row.months),
        ),
      ).toEqual(row.scaled[code]);
    expect(
      row.standard.map((_, total) => sandboxStandardScore(total, row.months)),
    ).toEqual(row.standard.map((entry) => entry.standardScore));
    expect(
      row.standard.map((_, total) => sandboxStandardResult(total, row.months)),
    ).toEqual(row.standard);
  }
});

test("raw inputs and age boundaries produce official scaled features and standard scores", async ({
  page,
}) => {
  await expect(score(page)).toHaveValue("");
  await expect(score(page)).toHaveAttribute("readonly", "");
  const summary = page.getByRole("region", {
    name: "Live ECCD scoring summary",
  });
  await expect(summary).toContainText("Scaled: —");
  const age = page.getByLabel("Age at PRE (completed months)", { exact: true });
  await expect(age).toHaveAttribute("min", "36");
  await expect(age).toHaveAttribute("max", "71");
  for (const [index, name] of names.entries()) {
    const field = page.getByLabel(`${name} raw score`, { exact: true });
    await expect(field).toHaveAttribute("min", "0");
    await expect(field).toHaveAttribute("max", String(maxima[index]));
  }
  await fillRaw(page);
  for (const [months, expected, total, delayed] of [
    [36, 101, 73, 0],
    [37, 101, 73, 0],
    [48, 101, 73, 0],
    [49, 78, 57, 2],
    [54, 78, 57, 2],
    [60, 78, 57, 2],
    [61, 48, 37, 4],
    [66, 48, 37, 4],
    [71, 48, 37, 4],
  ]) {
    const pending = responseFor(
      page,
      (features) => features.age_months_pre === months,
    );
    await page
      .getByLabel("Age at PRE (completed months)", { exact: true })
      .fill(String(months));
    await expect(score(page)).toHaveValue(String(expected));
    const response = await pending;
    const payload = response
      .request()
      .postDataJSON() as SandboxPrediction["features"];
    expect(Object.keys(payload)).toHaveLength(19);
    expect(payload).toHaveProperty(
      "raw_scores",
      Object.fromEntries(codes.map((code, index) => [code, sample[index]])),
    );
    expect(Object.keys(payload).some((key) => key.endsWith("_raw"))).toBe(
      false,
    );
    expect(
      ((await response.json()) as SandboxPrediction).features,
    ).toMatchObject({
      pre_standard_score: expected,
      pre_total_scaled: total,
      pre_delayed_domains_count: delayed,
      age_months_pre: months,
    });
    await expect(result(page)).toBeVisible();
  }
  await expect(page.locator("#age_months_pre-helper")).toContainText(
    "Decimal age: 5.9 years",
  );
  await expect(page.locator("#GM_pre_raw-helper")).toContainText(
    "Calculated scaled score: 1",
  );
  const zeroResponse = responseFor(page, (features) =>
    scaledFields.every(
      (field, index) => features[field] === [1, 1, 2, 1, 5, 1, 1][index],
    ),
  );
  await fillRaw(
    page,
    codes.map(() => 0),
  );
  expect(
    ((await (await zeroResponse).json()) as SandboxPrediction).features,
  ).toMatchObject({
    pre_standard_score: 37,
    pre_total_scaled: 12,
    pre_delayed_domains_count: 7,
  });
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await summary.screenshot({
      path: test.info().outputPath(`sandbox-summary-${width}.png`),
    });
  }
  await page.screenshot({
    path: test.info().outputPath("sandbox-raw-scores.png"),
    fullPage: true,
  });
});

test("invalid raw scores and ages block requests and retain entered values", async ({
  page,
}) => {
  await fillRaw(page);
  await expect(result(page)).toBeVisible();
  let calls = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/ml/predict/sandbox")) calls++;
  });
  for (const [i, name] of names.entries()) {
    const field = page.getByLabel(`${name} raw score`, { exact: true });
    for (const value of ["", "-1", "1.5", String(maxima[i] + 1)]) {
      await field.fill(value);
      await expect(field).toHaveAttribute("aria-invalid", "true");
      await expect(score(page)).toHaveValue("");
      await expect(result(page)).toHaveCount(0);
      const before = calls;
      await expect(page.getByRole("alert")).toContainText("valid raw scores");
      expect(calls).toBe(before);
      await expect(field).toHaveValue(value);
    }
    await field.fill(String(sample[i]));
  }
  const age = page.getByLabel("Age at PRE (completed months)", { exact: true });
  for (const value of ["", "0", "35", "60.5", "72", "217"]) {
    await age.fill(value);
    await expect(age).toHaveAttribute("aria-invalid", "true");
    await expect(score(page)).toHaveValue("");
  }
  await age.fill("66");
  await expect(result(page)).toBeVisible();
});

test("legacy drafts remain intact and raw edits survive failures, reload and reconnection", async ({
  page,
  context,
}) => {
  const legacy = {
    owner_id: 2,
    revision: "old-scaled",
    is_pending_sync: true,
    values: {
      ...Object.fromEntries(scaledFields.map((field) => [field, "7"])),
      age_months_pre: "49",
      mother_education_level: "College",
    },
  };
  await page.evaluate(
    ({ legacy, legacyKey }) => {
      localStorage.setItem(legacyKey, JSON.stringify(legacy));
      localStorage.setItem("unrelated-draft-check", "keep");
    },
    { legacy, legacyKey },
  );
  await page.reload();
  await page.getByRole("tab", { name: "Sandbox Simulator" }).click();
  await expect(
    page.getByLabel("Gross Motor raw score", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByLabel("Age at PRE (completed months)", { exact: true }),
  ).toHaveValue("49");
  await expect(
    page.getByRole("combobox", { name: "Mother’s education", exact: true }),
  ).toHaveValue("College");
  await page
    .getByText("Previous scaled-score draft retained for reference")
    .click();
  await expect(page.getByText("Gross Motor: 7", { exact: true })).toBeVisible();
  await fillRaw(page);
  await expect(result(page)).toBeVisible();
  await context.setOffline(true);
  await page
    .getByLabel("Age at PRE (completed months)", { exact: true })
    .fill("61");
  await expect(score(page)).toHaveValue("48");
  await expect(page.getByRole("alert")).toContainText("offline");
  const draft = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "null") as SandboxDraft,
    draftKey,
  );
  expect(draft.is_pending_sync).toBe(true);
  expect(draft.values.GM_pre_raw).toBe("10");
  const reconnected = responseFor(
    page,
    (features) => features.age_months_pre === 61,
  );
  await context.setOffline(false);
  await reconnected;
  await expect(result(page)).toBeVisible();
  await page.route("**/api/ml/predict/sandbox", (route) =>
    route.fulfill({
      status: 503,
      json: { detail: "Prediction temporarily unavailable" },
    }),
  );
  await page.getByLabel("Gross Motor raw score", { exact: true }).fill("13");
  await expect(page.getByRole("alert")).toContainText(
    "Prediction temporarily unavailable",
  );
  await page.reload();
  await page.getByRole("tab", { name: "Sandbox Simulator" }).click();
  await expect(
    page.getByLabel("Gross Motor raw score", { exact: true }),
  ).toHaveValue("13");
  await expect(
    page.getByLabel("Age at PRE (completed months)", { exact: true }),
  ).toHaveValue("61");
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) || "null") as unknown,
      legacyKey,
    ),
  ).toEqual(legacy);
  expect(
    await page.evaluate(() => localStorage.getItem("unrelated-draft-check")),
  ).toBe("keep");
  await expect(page.getByRole("alert")).toContainText(
    "Prediction temporarily unavailable",
  );
  await page.unroute("**/api/ml/predict/sandbox");
  const retried = responseFor(
    page,
    (features) => features.age_months_pre === 61,
  );
  await page.getByRole("button", { name: "Retry prediction" }).click();
  await retried;
  await expect(result(page)).toBeVisible();
});

test("late responses cannot overwrite newer age edits or draft revisions", async ({
  page,
}) => {
  await fillRaw(page);
  await expect(result(page)).toBeVisible();
  let release: (() => void) | undefined;
  let started: (() => void) | undefined;
  let finished: (() => void) | undefined;
  const oldFinished = new Promise<void>((resolve) => {
    finished = resolve;
  });
  const oldStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route("**/api/ml/predict/sandbox", async (route) => {
    const payload = route
      .request()
      .postDataJSON() as SandboxPrediction["features"];
    if (payload.age_months_pre !== 48) return route.continue();
    const response = await route.fetch();
    started?.();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({ response });
    finished?.();
  });
  await page
    .getByLabel("Age at PRE (completed months)", { exact: true })
    .fill("48");
  await oldStarted;
  const latest = responseFor(
    page,
    (features) => features.age_months_pre === 61,
  );
  await page
    .getByLabel("Age at PRE (completed months)", { exact: true })
    .fill("61");
  await latest;
  await expect(result(page)).toBeVisible();
  const before = await page.evaluate(
    (key) => localStorage.getItem(key),
    draftKey,
  );
  release?.();
  await oldFinished;
  await expect(score(page)).toHaveValue("48");
  const grossMotorCard = result(page)
    .getByText("Gross Motor", { exact: true })
    .locator("..");
  await expect(grossMotorCard.locator("p").nth(1)).toHaveText("1");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), draftKey),
  ).toBe(before);
});

test("maximum raw counts show model forecasts and PRE at 44, 60, 66 and 71 months", async ({
  page,
}) => {
  await fillRaw(page, maxima);
  for (const [months, total, standard, interpretation] of [
    [44, 103, 138, "Highly Advance"],
    [60, 92, 129, "Slight Advance"],
    [66, 84, 117, "Average"],
    [71, 84, 117, "Average"],
  ] as const) {
    const pending = responseFor(
      page,
      (features) => features.age_months_pre === months,
    );
    await page
      .getByLabel("Age at PRE (completed months)", { exact: true })
      .fill(String(months));
    const response = (await (await pending).json()) as SandboxPrediction;
    expect(response.features.pre_total_scaled).toBe(total);
    expect(response.features.pre_standard_score).toBe(standard);
    await expect(result(page)).toBeVisible();
    await expect(
      result(page).getByText(
        `Overall PRE interpretation (scoring table): ${interpretation}`,
        { exact: true },
      ),
    ).toBeVisible();
    expect(response.prediction_status).toBe("available");
    expect(
      Object.values(response.confidence_percentages).reduce(
        (sum, value) => sum + value,
        0,
      ),
    ).toBeCloseTo(100);
    await expect(result(page).getByRole("img")).toHaveCount(1);
    await expect(
      result(page).getByText("Model confidence", { exact: true }),
    ).toBeVisible();
    await expect(
      result(page).getByText(
        /Insufficient training support|fitted numeric bounds/,
      ),
    ).toHaveCount(0);
    await expect(score(page)).toHaveValue(String(standard));
    const summary = page.getByRole("region", {
      name: "Live ECCD scoring summary",
    });
    await expect(summary).toContainText(interpretation);
    if (months === 44)
      await expect(summary).toContainText("GM: 13/13 (Scaled: 14)");
  }
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  }
});

test("minimum raw scores show authoritative summary and calibrated three-class probabilities", async ({
  page,
}) => {
  await page
    .getByRole("combobox", { name: "Gender", exact: true })
    .selectOption("MALE");
  await page
    .getByRole("combobox", { name: "Handedness", exact: true })
    .selectOption("Left");
  const pending = responseFor(
    page,
    (features) => features.pre_total_scaled === 12,
  );
  await fillRaw(
    page,
    codes.map(() => 0),
  );
  const prediction = (await (await pending).json()) as SandboxPrediction;
  const summary = page.getByRole("region", {
    name: "Live ECCD scoring summary",
  });
  await expect(summary).toContainText("SH: 0/27 (Scaled: 2)");
  await expect(summary).toContainText("EL: 0/8 (Scaled: 5)");
  await expect(summary.getByText("12", { exact: true })).toBeVisible();
  await expect(summary.getByText("37", { exact: true })).toBeVisible();
  await expect(summary.getByText("Delay", { exact: true })).toBeVisible();
  await expect(summary.getByText("7", { exact: true })).toBeVisible();
  expect(Object.keys(prediction.confidence_percentages)).toHaveLength(3);
  await expect(result(page)).toContainText(
    `${Math.max(...Object.values(prediction.confidence_percentages)).toFixed(1)}%`,
  );
  expect(
    Object.values(prediction.confidence_percentages).every(
      (value) => value > 0 && value < 100,
    ),
  ).toBeTruthy();
  // Derivation updates synchronously, including while prediction is offline.
  await page.context().setOffline(true);
  await page
    .getByLabel("Expressive Language raw score", { exact: true })
    .fill("");
  await expect(summary.getByText("37", { exact: true })).toHaveCount(0);
  await expect(summary).toContainText("EL: —/8 (Scaled: —)");
  await expect(result(page)).toHaveCount(0);
});

test("Average raw profiles at 38 and 66 months match the retrained model and acceptance gates", async ({
  page,
}) => {
  const oracles = scenarioOracles().filter(
    (row) => row.name === "A_raw" || row.name === "B_raw",
  );
  await page
    .getByRole("combobox", { name: "Gender", exact: true })
    .selectOption("FEMALE");
  await page
    .getByRole("combobox", { name: "Handedness", exact: true })
    .selectOption("Right");
  for (const oracle of oracles) {
    const raw = oracle.raw_scores;
    if (!raw) throw new Error("Expected a raw acceptance profile");
    const pending = page.waitForResponse((response) => {
      if (
        !response.url().endsWith("/api/ml/predict/sandbox") ||
        response.status() !== 200
      )
        return false;
      const payload = response.request().postDataJSON() as {
        age_months_pre: number;
        raw_scores: ScenarioOracle["raw_scores"];
      };
      return (
        payload.age_months_pre === oracle.age_months &&
        codes.every((code) => payload.raw_scores?.[code] === raw[code])
      );
    });
    await page
      .getByLabel("Age at PRE (completed months)", { exact: true })
      .fill(String(oracle.age_months));
    await fillRaw(
      page,
      codes.map((code) => raw[code]),
    );
    const prediction = (await (await pending).json()) as SandboxPrediction;
    expect(prediction.features).toEqual(oracle.features);
    expect(prediction.confidence_percentages).toEqual(
      oracle.confidence_percentages,
    );
    expect(prediction.predicted_post_interpretation).toBe(
      "Average Overall Development",
    );
    expect(
      prediction.confidence_percentages["Average Overall Development"],
    ).toBeGreaterThanOrEqual(oracle.name === "A_raw" ? 75 : 60);
    await expect(result(page)).toContainText("Average Overall Development");
    await expect(result(page)).toContainText(
      `${prediction.confidence_percentages["Average Overall Development"].toFixed(1)}%`,
    );
    await expect(score(page)).toHaveValue(
      String(oracle.features.pre_standard_score),
    );
    await result(page).screenshot({
      path: test.info().outputPath(`${oracle.name}-${oracle.age_months}.png`),
    });
  }
});

for (const oldOutcome of ["success", "error"] as const) {
  test(`old ${oldOutcome} during the next debounce cannot display results or change the latest draft`, async ({
    page,
  }) => {
    await fillRaw(page);
    await expect(result(page)).toBeVisible();
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    let release: (() => void) | undefined;
    let started: (() => void) | undefined;
    let finished: (() => void) | undefined;
    const oldStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const oldFinished = new Promise<void>((resolve) => {
      finished = resolve;
    });
    await page.route("**/api/ml/predict/sandbox", async (route) => {
      const payload = route
        .request()
        .postDataJSON() as SandboxPrediction["features"];
      if (payload.age_months_pre !== 48) return route.continue();
      const response = await route.fetch();
      started?.();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      if (oldOutcome === "success") await route.fulfill({ response });
      else
        await route.fulfill({
          status: 503,
          json: { detail: "Obsolete failure" },
        });
      finished?.();
    });
    await page
      .getByLabel("Age at PRE (completed months)", { exact: true })
      .fill("48");
    await page.clock.runFor(450);
    await oldStarted;
    await page
      .getByLabel("Age at PRE (completed months)", { exact: true })
      .fill("61");
    const before = await page.evaluate(
      (key) => localStorage.getItem(key),
      draftKey,
    );
    release?.();
    await oldFinished;
    await expect(result(page)).toHaveCount(0);
    await expect(
      page.getByText("Obsolete failure", { exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), draftKey),
    ).toBe(before);
    const latest = responseFor(
      page,
      (features) => features.age_months_pre === 61,
    );
    await page.clock.runFor(450);
    await latest;
    await expect(result(page)).toBeVisible();
    await expect(score(page)).toHaveValue("48");
  });
}
