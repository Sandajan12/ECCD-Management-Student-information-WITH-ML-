import type { Period } from "../../types";

export const ASSESSMENT_PERIOD_LABELS: Record<Period, string> = {
  PRE: "Pre-Test (BoSY)",
  MID: "Mid-Test (MoSY)",
  POST: "Post-Test (EoSY)",
};

// Keys match standardScores.interpretation in eccd_scoring_data.json.
// Keep the display wording separate from the official scoring/API keys.
export const SUMMARY_INTERPRETATION_LABELS = {
  Delay: "Delay",
  "Slight Delay": "Slight Delay",
  Average: "Average",
  "Slight Advance": "Slight Advancement",
  "Highly Advance": "Highly Advancement",
} as const;

export type DevelopmentalInterpretation =
  keyof typeof SUMMARY_INTERPRETATION_LABELS;

export const SUMMARY_INTERPRETATIONS = (
  Object.keys(SUMMARY_INTERPRETATION_LABELS) as DevelopmentalInterpretation[]
).map((value) => ({ value, label: SUMMARY_INTERPRETATION_LABELS[value] }));
