import assert from "node:assert/strict";
import { test } from "node:test";
import { unfinishedPrerequisite } from "../../src/utils/periodGates.ts";
import type { SectionPeriodGates } from "../../src/types.ts";

test("section gates report PRE before MID and only saved completion unlocks", () => {
  const student = {
    student_id: 1,
    full_name: "Remaining Learner",
    masked_lrn: "Pending",
    saved_count: 1,
    missing_testing_date: true,
  };
  const gates: SectionPeriodGates = {
    section_id: 1,
    required_question_count: 2,
    prerequisites: { PRE: [student], MID: [student] },
  };
  assert.equal(unfinishedPrerequisite(gates, "PRE"), null);
  assert.equal(unfinishedPrerequisite(gates, "MID"), "PRE");
  assert.equal(unfinishedPrerequisite(gates, "POST"), "PRE");
  gates.prerequisites.PRE = [];
  assert.equal(unfinishedPrerequisite(gates, "MID"), null);
  assert.equal(unfinishedPrerequisite(gates, "POST"), "MID");
  gates.prerequisites.MID = [];
  assert.equal(unfinishedPrerequisite(gates, "POST"), null);
  assert.equal(unfinishedPrerequisite(null, "POST"), null);
});
