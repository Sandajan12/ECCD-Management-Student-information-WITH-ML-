import type { Assessment, Child, Dashboard, Period } from "./contracts";
import { released, VIEW_FLAGS, visibleMark } from "./policy.ts";

export const TEACHER_LOCK = "Locked by teacher";

export function checklistDomains(
  child: Child,
  assessment: Assessment,
  period: Period,
): Assessment["domains"] {
  const answer = (q: Assessment["domains"][number]["questions"][number]) =>
    visibleMark(child, assessment, q, period) ? q.answers[period] : null;
  const rank = (q: Assessment["domains"][number]["questions"][number]) =>
    answer(q) === "DI-KAYA" ? 0 : answer(q) === "KAYA" ? 1 : 2;
  return assessment.domains
    .map((domain) => ({
      ...domain,
      questions: [...domain.questions]
        .sort(
          (a, b) => rank(a) - rank(b) || a.sequence_order - b.sequence_order,
        ),
    }))
    .filter((domain) => domain.questions.length > 0);
}

export function overviewStatus(
  child: Child,
  dashboard: Dashboard | null,
  assessment: Assessment | null,
): "loading" | "locked" | "empty" | "available" {
  if (!dashboard || !assessment) return "loading";
  const phase = dashboard.latestPhase;
  if (phase === "PRE" || phase === "MID" || phase === "POST")
    return dashboard.is_published && released(child, assessment, phase)
      ? "available"
      : "locked";
  return dashboard.currentPhase === "Not Started" &&
    Object.values(VIEW_FLAGS).some(
      (flag) => child[flag] && assessment.permissions[flag],
    )
    ? "empty"
    : "locked";
}

export type HomeConfirmations = Record<string, readonly number[]>;
export const homeScope = (owner: number, student: number, period: Period) =>
  `${owner}_${student}_${period}`;
export function confirmHomeQuestions(
  current: HomeConfirmations,
  owner: number,
  student: number,
  period: Period,
  ids: readonly number[],
): HomeConfirmations {
  const key = homeScope(owner, student, period);
  return { ...current, [key]: [...new Set([...(current[key] || []), ...ids])] };
}
export function remainingHomeDomains(
  assessment: Assessment,
  period: Period,
  confirmed: readonly number[],
): Assessment["domains"] {
  return assessment.domains
    .map((domain) => ({
      ...domain,
      questions: domain.questions
        .filter(
          (q) =>
            q.is_home_based &&
            !q.parent_locked[period] &&
            !q.answers[period] &&
            q.evaluator_roles?.[period] !== "teacher" &&
            !q.teacher_marked_at?.[period] &&
            (!q.home_observations?.[period] || q.home_observations[period]?.status === "declined") &&
            !confirmed.includes(q.question_id),
        )
        .sort((a, b) => a.sequence_order - b.sequence_order),
    }))
    .filter((domain) => domain.questions.length > 0);
}

export function adviserName(
  child: Pick<Child, "teacher_fname" | "teacher_lname" | "adviser_name">,
): string {
  return (
    [child.teacher_fname?.trim(), child.teacher_lname?.trim()]
      .filter(Boolean)
      .join(" ") ||
    child.adviser_name?.trim() ||
    "Not assigned"
  );
}

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
