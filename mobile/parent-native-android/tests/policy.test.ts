import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canPredict, registrationError, released, visibleMark} from '../src/policy.ts';
import type {Assessment, Child, Question, Readiness} from '../src/contracts.ts';

test('registration follows Unicode name, combined length and UTF-8 password rules', () => {
  assert.equal(registrationError('José', "Dela-Cruz", 'Valid123'), null);
  assert.ok(registrationError('123', 'Santos', 'Valid123'));
  assert.ok(registrationError('Ana@', 'Santos', 'Valid123'));
  assert.ok(registrationError('A'.repeat(50), 'B'.repeat(50), 'Valid123'));
  assert.ok(registrationError('Ana', 'Santos', 'lowercase1'));
  assert.equal(registrationError('Ana', 'Santos', 'Aa1' + 'é'.repeat(34) + 'x'), null);
  assert.ok(registrationError('Ana', 'Santos', 'Aa1' + 'é'.repeat(35)));
});
test('score release, marks, home windows and predictions remain independent', () => {
  const child = {allow_parent_view_eccd_pre: false, allow_parent_view_eccd_marks: true, allow_parent_predictions: true, allow_parent_edit_home_based_eccd: true} as Child;
  const data = {permissions: {...child}, allow_parent_view_eccd_marks: true, can_edit_home_based: true,
    parent_assessment_access: {pre_test_parent_editable: true}, summary: {PRE: {isReleased: true, is_published: true}}} as unknown as Assessment;
  const q = {is_home_based: true, evaluator_roles: {PRE: 'parent'}, answers: {PRE: 'KAYA'}} as Question;
  assert.equal(released(child, data, 'PRE'), false);
  assert.equal(visibleMark(child, data, q, 'PRE'), true);
  child.allow_parent_view_eccd_marks = false;
  assert.equal(visibleMark(child, data, q, 'PRE'), true);
  q.evaluator_roles.PRE = 'teacher'; assert.equal(visibleMark(child, data, q, 'PRE'), false);
  q.evaluator_roles.PRE = 'parent'; data.parent_assessment_access.pre_test_parent_editable = false;
  assert.equal(visibleMark(child, data, q, 'PRE'), false);
  const readiness = {pre_complete: true, is_published: true, allow_parent_predictions: true} as Readiness;
  assert.equal(canPredict(child, readiness), false);
  child.allow_parent_view_eccd_pre = true; assert.equal(canPredict(child, readiness), true);
  readiness.pre_complete = false; assert.equal(canPredict(child, readiness), false);
});
