import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveTeacherDrafts,
  teacherDomainProgress,
} from "../src/utils/eccdDrafts.ts";
import type { TeacherAssessmentDraft } from "../src/utils/eccdDrafts.ts";
import type { Period, Question } from "../src/types.ts";

function question(
  id: number,
  answers: Partial<Question["answers"]> = {},
): Question {
  return {
    question_id: id,
    domain_id: 1,
    sequence_order: id,
    question_text: `Skill ${id}`,
    answers: { PRE: null, MID: null, POST: null, ...answers },
  };
}
function draft(
  answers: TeacherAssessmentDraft["answers"],
): TeacherAssessmentDraft {
  return { answers, evaluation_date: "2026-10-18" };
}

test("partial saved domains resolve inheritance separately for each question", () => {
  const state = resolveTeacherDrafts(
    [
      question(1, { PRE: "KAYA", MID: "DI-KAYA" }),
      question(2, { PRE: "KAYA" }),
    ],
    {},
  );
  assert.deepEqual(state.MID.answers, { 1: "DI-KAYA", 2: "KAYA" });
  assert.deepEqual(state.MID.savedAnswers, { 1: "DI-KAYA" });
  assert.deepEqual(state.MID.inheritedAnswers, { 2: "KAYA" });
  assert.deepEqual(state.POST.answers, { 2: "KAYA" });
  assert.deepEqual(state.POST.draftAnswers, {});
});

test("unsaved KAYA cannot initiate or restart inheritance", () => {
  for (const period of ["PRE", "MID"] as Period[]) {
    const state = resolveTeacherDrafts([question(1)], {
      [period]: draft({ 1: "KAYA" }),
    });
    assert.deepEqual(state[period].draftAnswers, { 1: "KAYA" });
    assert.deepEqual(state.POST.answers, {});
    if (period === "PRE") assert.deepEqual(state.MID.answers, {});
  }
  const state = resolveTeacherDrafts([question(1, { PRE: "DI-KAYA" })], {
    PRE: draft({ 1: "KAYA" }),
  });
  assert.deepEqual(state.MID.answers, {});
  assert.deepEqual(state.POST.answers, {});
});

test("saved PRE KAYA carries virtually through an unassessed MID", () => {
  const state = resolveTeacherDrafts([question(1, { PRE: "KAYA" })], {});
  for (const period of ["MID", "POST"] as Period[]) {
    assert.deepEqual(state[period].inheritedAnswers, { 1: "KAYA" });
    assert.deepEqual(state[period].draftAnswers, {});
    assert.deepEqual(state[period].savedAnswers, {});
  }
});

test("saved MID DI-KAYA stops PRE KAYA from bypassing MID", () => {
  const state = resolveTeacherDrafts(
    [question(1, { PRE: "KAYA", MID: "DI-KAYA" })],
    {},
  );
  assert.deepEqual(state.POST.answers, {});
});

test("PRE DI-KAYA immediately removes dependent virtual MID and POST", () => {
  for (const saved of [
    question(1, { PRE: "KAYA" }),
    question(1, { PRE: "DI-KAYA" }),
  ]) {
    const state = resolveTeacherDrafts([saved], {
      PRE: draft({ 1: "DI-KAYA" }),
    });
    assert.deepEqual(state.MID.answers, {});
    assert.deepEqual(state.POST.answers, {});
  }
});

test("MID draft DI-KAYA clears POST without creating a future draft", () => {
  const state = resolveTeacherDrafts([question(1, { PRE: "KAYA" })], {
    MID: draft({ 1: "DI-KAYA" }),
  });
  assert.deepEqual(state.POST.answers, {});
  assert.deepEqual(state.POST.draftAnswers, {});
});

test("independent saved later answers survive PRE resets and restart carry", () => {
  const state = resolveTeacherDrafts(
    [
      question(1, { PRE: "KAYA", MID: "KAYA" }),
      question(2, { PRE: "KAYA", MID: "DI-KAYA", POST: "KAYA" }),
    ],
    { PRE: draft({ 1: "DI-KAYA", 2: "DI-KAYA" }) },
  );
  assert.deepEqual(state.MID.answers, { 1: "KAYA", 2: "DI-KAYA" });
  assert.deepEqual(state.POST.answers, { 1: "KAYA", 2: "KAYA" });
  assert.deepEqual(state.POST.inheritedAnswers, { 1: "KAYA" });
});

test("explicit later drafts survive resets but unsaved KAYA does not restart carry", () => {
  const state = resolveTeacherDrafts([question(1, { PRE: "KAYA" })], {
    PRE: draft({ 1: "DI-KAYA" }),
    MID: draft({ 1: "KAYA" }),
  });
  assert.deepEqual(state.MID.answers, { 1: "KAYA" });
  assert.deepEqual(state.POST.answers, {});
  const explicitPost = resolveTeacherDrafts([question(1, { PRE: "KAYA" })], {
    PRE: draft({ 1: "DI-KAYA" }),
    MID: draft({ 1: "DI-KAYA" }),
    POST: draft({ 1: "KAYA" }),
  });
  assert.deepEqual(explicitPost.POST.draftAnswers, { 1: "KAYA" });
});

test("switching draft answers recalculates carry without mutating inputs", () => {
  const questions = [question(1, { PRE: "KAYA" })];
  const drafts = { PRE: draft({ 1: "DI-KAYA" }) };
  const before = JSON.stringify({ questions, drafts });
  const cleared = resolveTeacherDrafts(questions, drafts);
  assert.deepEqual(cleared.MID.answers, {});
  const restored = resolveTeacherDrafts(questions, {
    PRE: draft({ 1: "KAYA" }),
  });
  assert.deepEqual(restored.MID.inheritedAnswers, { 1: "KAYA" });
  assert.deepEqual(restored.POST.inheritedAnswers, { 1: "KAYA" });
  assert.equal(JSON.stringify({ questions, drafts }), before);
  assert.deepEqual(cleared.MID.answers, {});
});

test("date-only drafts and other-domain entries do not create answer drafts", () => {
  const state = resolveTeacherDrafts([question(1, { PRE: "KAYA" })], {
    MID: draft({ 999: "DI-KAYA" }),
  });
  assert.deepEqual(state.MID.draftAnswers, {});
  assert.deepEqual(state.MID.inheritedAnswers, { 1: "KAYA" });
  assert.deepEqual(state.POST.inheritedAnswers, { 1: "KAYA" });
});

test("domain metadata without assessment answers is safe before selecting a student", () => {
  const state = resolveTeacherDrafts([{ question_id: 1 }], {});
  for (const period of ["PRE", "MID", "POST"] as Period[]) {
    assert.deepEqual(state[period].answers, {});
    assert.deepEqual(state[period].savedAnswers, {});
  }
});

test("progress excludes inherited answers and counts only changed explicit drafts", () => {
  const questions = [
    question(1, { PRE: "KAYA", MID: "DI-KAYA" }),
    question(2, { PRE: "KAYA" }),
  ];
  const state = resolveTeacherDrafts(questions, {
    MID: draft({ 1: "DI-KAYA" }),
  });
  assert.deepEqual(teacherDomainProgress(questions, state.MID), {
    savedCount: 1,
    draftCount: 0,
    inheritedCount: 1,
    answeredCount: 2,
    total: 2,
    hasDateChange: false,
    complete: false,
  });
  const changed = resolveTeacherDrafts(questions, {
    MID: draft({ 1: "KAYA", 2: "KAYA" }),
  });
  assert.equal(teacherDomainProgress(questions, changed.MID).draftCount, 2);
  assert.equal(teacherDomainProgress(questions, changed.MID).savedCount, 1);
});

test("completion requires all saved answers, no changed answers and no changed date", () => {
  const questions = [
    question(1, { PRE: "KAYA" }),
    question(2, { PRE: "DI-KAYA" }),
  ];
  const noOp = resolveTeacherDrafts(questions, { PRE: draft({ 1: "KAYA" }) });
  assert.equal(teacherDomainProgress(questions, noOp.PRE).complete, true);
  assert.equal(
    teacherDomainProgress(questions, noOp.PRE, true).complete,
    false,
  );
  const changed = resolveTeacherDrafts(questions, {
    PRE: draft({ 2: "KAYA" }),
  });
  assert.equal(teacherDomainProgress(questions, changed.PRE).complete, false);
  assert.equal(
    teacherDomainProgress([], resolveTeacherDrafts([], {}).PRE).complete,
    false,
  );
});
