import scoringData from "../assets/eccd_scoring_data.json";

interface StandardScoreEntry {
  standardScore: number;
  interpretation: string;
}

export function sandboxStandardScore(total: number, ageMonths: number): number {
  // Completed months, rounded to one decimal year as in the official scorer.
  const age = Math.round((ageMonths / 12) * 10) / 10;
  const bracket =
    age > 5 ? "AGE 5.1 - 5.11" : age > 4 ? "AGE 4.1 - 5.0" : "AGE 3.1 - 4.0";
  const entries: Record<string, StandardScoreEntry> =
    scoringData[bracket].standardScores;
  const sums = Object.keys(entries)
    .map(Number)
    .sort((a, b) => a - b);
  const closest = sums.filter((value) => value <= total).at(-1) ?? sums[0];
  return (entries[String(total)] ?? entries[String(closest)]).standardScore;
}
