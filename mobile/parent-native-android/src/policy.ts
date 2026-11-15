import type {Assessment, Child, Period, Question, Readiness, Registration} from './contracts';

export const VIEW_FLAGS = {PRE: 'allow_parent_view_eccd_pre', MID: 'allow_parent_view_eccd_mid', POST: 'allow_parent_view_eccd_post'} as const;
export const WINDOWS = {PRE: 'pre_test_parent_editable', MID: 'mid_test_parent_editable', POST: 'post_test_parent_editable'} as const;
export function homeLock(child: Child, assessment: Assessment, question: Question, period: Period): string {
  if (!child.allow_parent_edit_home_based_eccd || !assessment.permissions.allow_parent_edit_home_based_eccd || !assessment.can_edit_home_based)
    return 'Locked by teacher';
  if (!assessment.parent_assessment_access[WINDOWS[period]]) return 'Locked by teacher';
  if (question.parent_locked[period]) return 'This observation is already submitted or teacher-confirmed and cannot be changed.';
  return question.is_home_based ? '' : 'Only home-based indicators can be observed here.';
}
export function released(child: Child, assessment: Assessment, period: Period): boolean {
  return child[VIEW_FLAGS[period]] === true && assessment.permissions[VIEW_FLAGS[period]] === true &&
    assessment.summary[period].isReleased === true && assessment.summary[period].is_published === true;
}
export function visibleMark(child: Child, assessment: Assessment, question: Question, period: Period): boolean {
  if (child.allow_parent_view_eccd_marks && assessment.permissions.allow_parent_view_eccd_marks && assessment.allow_parent_view_eccd_marks) return true;
  // The server's masked response identifies only this parent's own observations.
  return child.allow_parent_edit_home_based_eccd && assessment.permissions.allow_parent_edit_home_based_eccd &&
    assessment.can_edit_home_based && assessment.parent_assessment_access[WINDOWS[period]] && question.is_home_based &&
    question.evaluator_roles[period] === 'parent' && question.answers[period] != null;
}
export function canPredict(child: Child, readiness: Readiness): boolean {
  return child.allow_parent_predictions && child.allow_parent_view_eccd_pre && readiness.allow_parent_predictions && readiness.is_published && readiness.pre_complete;
}
const length = (s: string) => [...s].length;
export function registrationPayload(value: Pick<Registration, 'email' | 'password' | 'firstName' | 'lastName' | 'relationship'>): Registration {
  return {email: value.email.trim().toLowerCase(), password: value.password, firstName: value.firstName.trim(), lastName: value.lastName.trim(), relationship: value.relationship, terms_accepted: true};
}
export function registrationError(first: string, last: string, password: string): string | null {
  for (const name of [first.trim(), last.trim()]) {
    if (!name || length(name) > 100 || !/\p{L}/u.test(name) || /[^\p{L}\p{M} .'-]/u.test(name))
      return 'Names require letters and may contain spaces, periods, apostrophes or hyphens (100 characters maximum).';
  }
  if (length(`${first.trim()} ${last.trim()}`) > 100) return 'Your combined first and last name must not exceed 100 characters.';
  if (length(password) < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password))
    return 'Password requires at least 8 characters, uppercase, lowercase and a number.';
  const bytes = [...password].reduce((n, c) => n + (c.codePointAt(0)! <= 0x7f ? 1 : c.codePointAt(0)! <= 0x7ff ? 2 : c.codePointAt(0)! <= 0xffff ? 3 : 4), 0);
  return bytes > 72 ? 'Password must not exceed 72 UTF-8 bytes.' : null;
}
