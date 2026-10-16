/** Display helpers only. Assessment scores and ages remain server-authoritative. */
export function formatDisplayDate(
  value: string | null | undefined,
  fallback = "",
): string {
  if (!value) return fallback;
  const parts = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(value);
  if (!parts) return fallback;
  const [, year, month, day] = parts;
  // Birth and assessment dates are calendar dates; keep the recorded day in
  // every timezone, including when the API includes a timestamp suffix.
  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(year) ||
    date.getMonth() + 1 !== Number(month) ||
    date.getDate() !== Number(day)
  ) return fallback;
  return `${month}/${day}/${year}`;
}

export function getSchoolYearBaseline(
  schoolYear: string | null | undefined,
  startMonth = 8,
): Date {
  if (schoolYear?.includes("-")) {
    const year = Number.parseInt(schoolYear.split("-")[0], 10);
    if (!Number.isNaN(year))
      return new Date(year, startMonth >= 1 && startMonth <= 12 ? startMonth - 1 : 7, 1);
  }
  return new Date();
}
export function calculateRosterAge(
  dateOfBirth: string | null | undefined,
  schoolYear: string | null | undefined,
  startMonth = 8,
): string {
  if (!dateOfBirth) return "N/A";
  const age = calculateDecimalAge(dateOfBirth, getSchoolYearBaseline(schoolYear, startMonth));
  return age === "" ? "N/A" : `${age.toFixed(1)} yrs`;
}
export function calculateDecimalAge(
  dateOfBirth: string | Date,
  targetDate: string | Date = new Date(),
  startMonth = 8,
): number | "" {
  if (!dateOfBirth) return "";
  const dob = new Date(dateOfBirth);
  const target = typeof targetDate === "string" && /^\d{4}-\d{4}$/.test(targetDate)
    ? getSchoolYearBaseline(targetDate, startMonth)
    : new Date(targetDate);
  if (Number.isNaN(dob.getTime()) || Number.isNaN(target.getTime())) return "";
  // Keep the legacy years/months calculation for display only. ECCD scoring
  // continues to use the backend's assessment-date age and lookup tables.
  let years = target.getFullYear() - dob.getFullYear();
  let months = target.getMonth() - dob.getMonth();
  if (target.getDate() < dob.getDate()) {
    months--;
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  return Number((years + months / 12).toFixed(1));
}
