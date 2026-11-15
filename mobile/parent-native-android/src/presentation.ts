export const statusColor = (value: string): string =>
  ({
    success: "#15803d",
    warning: "#b45309",
    error: "#b91c1c",
    info: "#2563eb",
    default: "#64748b",
  })[value] || "#64748b";
export const tierColor = (value: string): string =>
  value === "Average"
    ? "#15803d"
    : value === "Slight Delay"
      ? "#b45309"
      : "#b91c1c";
export function displayTime(value: string | null, date = false): string {
  if (!value) return "No messages yet";
  // Historical server timestamps without an offset represent UTC.
  const parsed = new Date(
    /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`,
  );
  if (!Number.isFinite(parsed.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    ...(date
      ? ({ month: "short", day: "numeric" } as const)
      : ({ hour: "numeric", minute: "2-digit" } as const)),
  }).format(parsed);
}
