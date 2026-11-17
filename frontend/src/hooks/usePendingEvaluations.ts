import { useEffect, useState } from "react";
import { useTeacher } from "../context/TeacherContext";
import { sharedGet } from "../services/sharedGet";
import { PERIODS } from "../types";
import type { Period, Question, Student } from "../types";
import { assessmentRefreshScheduler } from "./assessmentRefresh";
import { refreshOnWake } from "./refreshOnWake";

interface SavedEvaluation {
  question_id: number;
  testing_period: Period;
  teacher_evaluation_date: string | null;
}

interface ConfiguredDomain {
  questions: Pick<Question, "question_id" | "domain_id">[];
}

export interface PendingEvaluation {
  student: Student;
  domainId: number | undefined;
}

interface PendingRoster {
  totalStudents: number;
  hasQuestions: boolean;
  periods: Record<Period, PendingEvaluation[]>;
}

interface PendingResource {
  scope: string;
  status: "loading" | "ready" | "error";
  data: PendingRoster | null;
}

export function usePendingEvaluations(
  sectionId: number | undefined,
  ownerId: number,
) {
  const { initialized, error } = useTeacher();
  const enabled = initialized && !error && Boolean(sectionId && ownerId);
  const scope = JSON.stringify([ownerId, sectionId, enabled]);
  const [resource, setResource] = useState<PendingResource>({
    scope: "",
    status: "loading",
    data: null,
  });

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    let version = 0;
    const load = async () => {
      const request = ++version;
      const isCurrent = () => current && request === version;
      setResource({ scope, status: "loading", data: null });
      try {
        const [students, domains] = await Promise.all([
          sharedGet<Student[]>("/api/eccd/students"),
          sharedGet<ConfiguredDomain[]>("/api/eccd/domains-progress"),
        ]);
        if (!isCurrent()) return;
        const roster = students.filter(
          (student) => student.is_active && student.section_id === sectionId,
        );
        const required = domains.flatMap((domain) => domain.questions);
        const rosterOrder = new Map(
          roster.map((student, index) => [student.student_id, index]),
        );
        const periods: PendingRoster["periods"] = {
          PRE: [],
          MID: [],
          POST: [],
        };
        let next = 0;
        // Existing read routes return one student's records. Bound the fan-out
        // and stop scheduling reads when the assignment or owner changes.
        const worker = async () => {
          while (isCurrent() && next < roster.length) {
            const student = roster[next++];
            const records = required.length
              ? await sharedGet<SavedEvaluation[]>(
                  `/api/eccd/student/${student.student_id}`,
                )
              : [];
            for (const period of PERIODS) {
              const confirmed = new Set(
                records
                  .filter(
                    (row) =>
                      row.testing_period === period &&
                      row.teacher_evaluation_date,
                  )
                  .map((row) => row.question_id),
              );
              // Match dashboard completion: every configured question must have
              // an official teacher date; parent observations alone do not count.
              const missing = required.find(
                (question) => !confirmed.has(question.question_id),
              );
              if (!required.length || missing)
                periods[period].push({ student, domainId: missing?.domain_id });
            }
          }
        };
        const results = await Promise.allSettled(
          Array.from({ length: Math.min(4, roster.length) }, worker),
        );
        if (results.some((result) => result.status === "rejected"))
          throw new Error("Pending evaluations unavailable");
        for (const period of PERIODS)
          periods[period].sort(
            (a, b) =>
              rosterOrder.get(a.student.student_id)! -
              rosterOrder.get(b.student.student_id)!,
          );
        if (isCurrent())
          setResource({
            scope,
            status: "ready",
            data: {
              totalStudents: roster.length,
              hasQuestions: required.length > 0,
              periods,
            },
          });
      } catch {
        if (isCurrent()) setResource({ scope, status: "error", data: null });
      }
    };
    void load();
    const stop = refreshOnWake(load);
    const scheduler = assessmentRefreshScheduler(ownerId, load);
    window.addEventListener("ames-record-synced", scheduler.schedule);
    return () => {
      current = false;
      scheduler.cancel();
      stop();
      window.removeEventListener("ames-record-synced", scheduler.schedule);
    };
  }, [enabled, scope, sectionId, ownerId]);

  return enabled && resource.scope === scope
    ? resource
    : {
        scope,
        status: error ? ("error" as const) : ("loading" as const),
        data: null,
      };
}
