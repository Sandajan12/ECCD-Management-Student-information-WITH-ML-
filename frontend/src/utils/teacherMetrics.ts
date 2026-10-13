import API from "../services/api";
import type { Assessment, Domain, Student } from "../types";
import { PERIODS } from "../types";

// Teacher aggregate endpoints span all assignments. Use committed records to
// calculate section-specific metrics when the teacher has multiple sections.
export async function sectionAssessments(students: Student[]): Promise<Assessment[]> {
  return Promise.all(students.map(async student => {
    const response = await API.get<Assessment>(`/api/eccd/assessment/${student.student_id}`);
    return response.data;
  }));
}

export function domainCompletion(domain: Domain, assessments: Assessment[]) {
  const completion = { pre_progress: 0, mid_progress: 0, post_progress: 0 };
  const fields = { PRE: "pre_progress", MID: "mid_progress", POST: "post_progress" } as const;
  for (const period of PERIODS) {
    const completed = assessments.filter(assessment => {
      const questions = assessment.domains.find(item => item.domain_id === domain.domain_id)?.questions || [];
      return questions.length > 0 && questions.length === domain.questions.length && questions.every(question => question.answers[period] !== null);
    }).length;
    completion[fields[period]] = assessments.length ? Math.round(completed / assessments.length * 100) : 0;
  }
  return completion;
}

export function sectionPriority(assessments: Assessment[]): string {
  const counts = new Map<string, number>();
  for (const assessment of assessments) {
    const latest = [...PERIODS].reverse().find(period => assessment.domains.some(domain => domain.questions.some(question => question.answers[period])));
    if (!latest) continue;
    for (const domain of assessment.domains) {
      const count = domain.questions.filter(question => question.answers[latest] === "DI-KAYA").length;
      if (count) counts.set(domain.domain_name, (counts.get(domain.domain_name) || 0) + count);
    }
  }
  return [...counts].sort(([nameA, countA], [nameB, countB]) => countB - countA || nameA.localeCompare(nameB))[0]?.[0].replace(" Domain", "") || "None";
}
