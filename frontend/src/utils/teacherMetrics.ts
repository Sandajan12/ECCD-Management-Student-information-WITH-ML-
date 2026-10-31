import API from "../services/api";
import type { Assessment, Domain, Student } from "../types";
import { PERIODS } from "../types";

// Load committed records for section-specific domain completion views.
export async function sectionAssessments(
  students: Student[],
): Promise<Assessment[]> {
  return Promise.all(
    students.map(async (student) => {
      const response = await API.get<Assessment>(
        `/api/eccd/assessment/${student.student_id}`,
      );
      return response.data;
    }),
  );
}

export function domainCompletion(domain: Domain, assessments: Assessment[]) {
  const completion = { pre_progress: 0, mid_progress: 0, post_progress: 0 };
  const fields = {
    PRE: "pre_progress",
    MID: "mid_progress",
    POST: "post_progress",
  } as const;
  for (const period of PERIODS) {
    const completed = assessments.filter((assessment) => {
      const questions =
        assessment.domains.find((item) => item.domain_id === domain.domain_id)
          ?.questions || [];
      return (
        questions.length > 0 &&
        questions.length === domain.questions.length &&
        questions.every((question) => question.answers[period] !== null)
      );
    }).length;
    completion[fields[period]] = assessments.length
      ? Math.round((completed / assessments.length) * 100)
      : 0;
  }
  return completion;
}
