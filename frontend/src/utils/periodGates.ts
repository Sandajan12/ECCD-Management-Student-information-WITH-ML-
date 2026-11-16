import type { Period, SectionPeriodGates } from "../types";

export function unfinishedPrerequisite(
  gates: SectionPeriodGates | null,
  period: Period,
): "PRE" | "MID" | null {
  if (!gates || period === "PRE") return null;
  if (gates.prerequisites.PRE.length) return "PRE";
  if (period === "POST" && gates.prerequisites.MID.length) return "MID";
  return null;
}
