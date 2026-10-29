import scoringData from "../assets/eccd_scoring_data.json" with { type: "json" };

interface StandardScoreEntry {
  standardScore: number;
  interpretation: string;
}

export type SandboxDomain = "GM" | "FM" | "SH" | "RL" | "EL" | "C" | "SE";
interface SandboxAge {
  decimalAge: number;
  bracket: keyof typeof scoringData;
}

export function sandboxAge(ageMonths: number): SandboxAge {
  // Positive completed-month integers: integer arithmetic implements HALF_UP.
  const decimalAge = Math.floor((ageMonths * 10 + 6) / 12) / 10;
  const bracket =
    decimalAge > 5
      ? "AGE 5.1 - 5.11"
      : decimalAge > 4
        ? "AGE 4.1 - 5.0"
        : "AGE 3.1 - 4.0";
  return { decimalAge, bracket };
}

function closestLower<T>(entries: Record<string, T>, value: number): T {
  const available = Object.keys(entries)
    .map(Number)
    .sort((a, b) => a - b);
  const closest =
    available.filter((entry) => entry <= value).at(-1) ?? available[0];
  return entries[String(value)] ?? entries[String(closest)];
}

export function sandboxScaledScore(
  domain: SandboxDomain,
  raw: number,
  ageMonths: number,
): number {
  return closestLower(
    scoringData[sandboxAge(ageMonths).bracket].domains[domain],
    raw,
  );
}

export function sandboxStandardScore(total: number, ageMonths: number): number {
  return sandboxStandardResult(total, ageMonths).standardScore;
}

export function sandboxStandardResult(
  total: number,
  ageMonths: number,
): StandardScoreEntry {
  const { bracket } = sandboxAge(ageMonths);
  const entries: Record<string, StandardScoreEntry> =
    scoringData[bracket].standardScores;
  return closestLower(entries, total);
}
