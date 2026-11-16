import { PERIODS } from "../types.ts";
import type { Answer, Period, Question } from "../types.ts";

export interface TeacherAssessmentDraft {
  answers: Record<string, Answer>;
  original_answers?: Record<string, Answer | null>;
  evaluation_date: string;
}

export interface TeacherQuestionState {
  savedAnswers: Record<string, Answer>;
  draftAnswers: Record<string, Answer>;
  inheritedAnswers: Record<string, Answer>;
  answers: Record<string, Answer>;
}

type DraftQuestion = Pick<Question, "question_id"> &
  Partial<Pick<Question, "answers" | "carry_forward">>;

export function teacherDomainProgress(
  questions: readonly Pick<Question, "question_id">[],
  state: TeacherQuestionState,
  hasDateChange = false,
) {
  const savedCount = questions.filter(
    (q) => state.savedAnswers[q.question_id],
  ).length;
  const draftCount = questions.filter(
    (q) =>
      (state.draftAnswers[q.question_id] &&
        state.draftAnswers[q.question_id] !==
          state.savedAnswers[q.question_id]) ||
      (state.savedAnswers[q.question_id] &&
        state.inheritedAnswers[q.question_id] &&
        state.inheritedAnswers[q.question_id] !==
          state.savedAnswers[q.question_id]),
  ).length;
  return {
    savedCount,
    draftCount,
    inheritedCount: questions.filter(
      (q) => state.inheritedAnswers[q.question_id],
    ).length,
    answeredCount: questions.filter((q) => state.answers[q.question_id]).length,
    total: questions.length,
    hasDateChange,
    complete:
      questions.length > 0 &&
      savedCount === questions.length &&
      draftCount === 0 &&
      !hasDateChange,
  };
}

export function resolveTeacherDrafts(
  questions: readonly DraftQuestion[],
  drafts: Partial<Record<Period, TeacherAssessmentDraft>>,
  preKayaQuestionIds: readonly number[] = [],
): Record<Period, TeacherQuestionState> {
  const empty = (): TeacherQuestionState => ({
    savedAnswers: {},
    draftAnswers: {},
    inheritedAnswers: {},
    answers: {},
  });
  const result = { PRE: empty(), MID: empty(), POST: empty() };
  const preKaya = new Set(preKayaQuestionIds);
  for (const question of questions) {
    let savedSource: Answer | null = null;
    let blocked = false;
    for (const period of PERIODS) {
      const state = result[period];
      const saved = question.answers?.[period];
      const draft = drafts[period]?.answers[question.question_id];
      if (saved) {
        state.savedAnswers[question.question_id] = saved;
        // An independent later record starts a new chain, even after a reset.
        savedSource = saved;
        blocked = false;
      }
      if (draft) state.draftAnswers[question.question_id] = draft;
      const carry = question.carry_forward?.[period];
      const locked = question.carry_forward
        ? carry === "locked"
        : period !== "PRE" && preKaya.has(question.question_id);
      const inherited = locked
        ? saved !== "KAYA"
        : !saved &&
          !draft &&
          (question.carry_forward
            ? carry === "editable"
            : !blocked && savedSource === "KAYA");
      if (inherited) state.inheritedAnswers[question.question_id] = "KAYA";
      const answer = locked
        ? "KAYA"
        : draft || saved || (inherited ? "KAYA" : null);
      if (locked && draft) state.draftAnswers[question.question_id] = "KAYA";
      if (answer) state.answers[question.question_id] = answer;
      // Draft KAYA is never a source. DI-KAYA immediately blocks dependent
      // virtual answers, without deleting independent saved or explicit values.
      if (draft === "DI-KAYA") blocked = true;
    }
  }
  return result;
}
