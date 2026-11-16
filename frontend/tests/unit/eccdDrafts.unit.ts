import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveTeacherDrafts,
  teacherDomainProgress,
} from "../../src/utils/eccdDrafts.ts";
import type { TeacherAssessmentDraft } from "../../src/utils/eccdDrafts.ts";
import type { Question } from "../../src/types.ts";

const questions: Question[] = [
  {
    question_id: 1,
    domain_id: 1,
    question_text: "Mastered",
    sequence_order: 1,
    answers: { PRE: "KAYA", MID: null, POST: null },
  },
  {
    question_id: 2,
    domain_id: 1,
    question_text: "Developing",
    sequence_order: 2,
    answers: { PRE: "DI-KAYA", MID: null, POST: null },
  },
];
const draft: TeacherAssessmentDraft = {
  answers: { 1: "DI-KAYA", 2: "DI-KAYA" },
  evaluation_date: "2026-09-10",
};

test("per-question metadata locks MID mastery and allows parent-source teacher overrides", () => {
  const confirmed: Question = {
    ...questions[0],
    answers: { PRE: null, MID: "KAYA", POST: null },
    carry_forward: { PRE: null, MID: null, POST: "locked" },
  };
  const provisional: Question = {
    ...questions[1],
    answers: { PRE: "KAYA", MID: null, POST: null },
    carry_forward: { PRE: null, MID: "editable", POST: "editable" },
  };
  const state = resolveTeacherDrafts([confirmed, provisional], { POST: draft });
  assert.equal(state.POST.answers[1], "KAYA");
  assert.equal(state.POST.answers[2], "DI-KAYA");
  assert.equal(state.POST.savedAnswers[1], undefined);
  assert.equal(state.POST.inheritedAnswers[1], "KAYA");
  assert.equal(draft.answers[1], "DI-KAYA");
  assert.equal(resolveTeacherDrafts([provisional], {}).MID.answers[2], "KAYA");
});

test("teacher DI-KAYA reset metadata suppresses earlier parent inheritance", () => {
  const reset: Question = {
    ...questions[0],
    answers: { PRE: "KAYA", MID: "DI-KAYA", POST: null },
    carry_forward: { PRE: null, MID: "editable", POST: null },
  };
  const state = resolveTeacherDrafts([reset], {});
  assert.equal(state.POST.answers[1], undefined);
  assert.equal(state.MID.answers[1], "DI-KAYA");
  assert.equal(teacherDomainProgress([reset], state.POST).savedCount, 0);
});

test("completed PRE Kaya overrides conflicting MID and POST drafts without mutating stored work", () => {
  const state = resolveTeacherDrafts(
    questions,
    { MID: draft, POST: draft },
    [1],
  );
  for (const period of ["MID", "POST"] as const) {
    assert.equal(state[period].answers[1], "KAYA");
    assert.equal(state[period].answers[2], "DI-KAYA");
    assert.deepEqual(state[period].savedAnswers, {});
    assert.equal(
      teacherDomainProgress(questions, state[period]).complete,
      false,
    );
  }
  assert.equal(draft.answers[1], "DI-KAYA");
  assert.equal(draft.evaluation_date, "2026-09-10");
});

test("inherited Kaya remains unsaved and does not complete an all-mastered domain", () => {
  const state = resolveTeacherDrafts(questions.slice(0, 1), {}, [1]);
  assert.equal(state.MID.answers[1], "KAYA");
  assert.equal(state.POST.answers[1], "KAYA");
  const progress = teacherDomainProgress(questions.slice(0, 1), state.MID);
  assert.equal(progress.savedCount, 0);
  assert.equal(progress.inheritedCount, 1);
  assert.equal(progress.complete, false);
});

test("a conflicting old saved answer requires an explicit corrective save", () => {
  const saved: Question[] = [
    { ...questions[0], answers: { PRE: "KAYA", MID: "DI-KAYA", POST: null } },
  ];
  const state = resolveTeacherDrafts(saved, {}, [1]);
  assert.equal(state.MID.answers[1], "KAYA");
  assert.equal(state.MID.savedAnswers[1], "DI-KAYA");
  assert.equal(teacherDomainProgress(saved, state.MID).complete, false);
});

test("uncompleted PRE keeps deliberate later answers editable and PRE drafts cannot create locks", () => {
  const state = resolveTeacherDrafts(questions, { MID: draft });
  assert.equal(state.MID.answers[1], "DI-KAYA");
  const preDraft = resolveTeacherDrafts([questions[1]], {
    PRE: { ...draft, answers: { 2: "KAYA" } },
  });
  assert.equal(preDraft.MID.answers[2], undefined);
});

test("PRE answers remain editable and mastery IDs are isolated by question", () => {
  const state = resolveTeacherDrafts(
    questions,
    { PRE: draft, MID: draft },
    [1, 999],
  );
  assert.equal(state.PRE.answers[1], "DI-KAYA");
  assert.equal(state.MID.answers[2], "DI-KAYA");
  assert.equal(state.POST.answers[999], undefined);
});
