export type Role = "super-admin" | "admin" | "user";
export type Period = "PRE" | "MID" | "POST";
export type Answer = "KAYA" | "DI-KAYA";
export const PERIODS: Period[] = ["PRE", "MID", "POST"];
export const PERIOD_LABELS: Record<Period, string> = {
  PRE: "Pre-Test",
  MID: "Mid-Test",
  POST: "Post-Test",
};
export interface SessionUser {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  role: Role;
  is_first_login: number;
  section_id: number | null;
  section_name: string | null;
  allow_eccd_question_management: boolean;
}
export interface SessionResponse {
  success: true;
  token: string;
  user: SessionUser;
  requireOtp: false;
  requiresPasswordChange: boolean;
  deviceToken?: string;
}
export interface ChallengeResponse {
  success: true;
  requireOtp: true;
  challengeToken: string;
  email: string;
  emailSent: boolean;
  message?: string;
}
export type AuthResponse = SessionResponse | ChallengeResponse;
export interface Permissions {
  allow_parent_predictions?: boolean;
  allow_parent_view_student_info: boolean;
  allow_parent_view_eccd_pre: boolean;
  allow_parent_view_eccd_mid: boolean;
  allow_parent_view_eccd_post: boolean;
  allow_parent_view_eccd_marks?: boolean;
  allow_parent_edit_student_info: boolean;
  allow_parent_edit_home_based_eccd: boolean;
}
export const PERMISSION_LABELS: Record<keyof Permissions, string> = {
  allow_parent_predictions: "View developmental predictions",
  allow_parent_view_student_info: "View child information",
  allow_parent_view_eccd_pre: "Release Pre-Test results",
  allow_parent_view_eccd_mid: "Release Mid-Test results",
  allow_parent_view_eccd_post: "Release Post-Test results",
  allow_parent_view_eccd_marks: "View recorded ECCD marks",
  allow_parent_edit_student_info: "Edit child and family details",
  allow_parent_edit_home_based_eccd: "Complete home-based assessments",
};
export interface Guardian {
  fullname: string | null;
  relationship: string | null;
  age: number | null;
  occupation: string | null;
  educational_attainment: string | null;
}
export interface Student extends Partial<Permissions> {
  parent_link_status?: "NONE" | "PENDING" | "SYNCED";
  parent_info?: ParentLinkInfo | null;
  student_id: number;
  masked_lrn: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  full_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  section_id: number | null;
  section_name: string | null;
  school_year: string | null;
  adviser_name?: string | null;
  decimal_age: number | null;
  is_active: boolean;
  address: string | null;
  emergency_contact: string | null;
  handedness: string | null;
  num_of_siblings: number | null;
  birth_order: string | null;
  profile_completeness: number;
  parent_names: string | null;
  parents: Guardian[];
  teacher_fname?: string;
  teacher_lname?: string;
  father_name?: string | null;
  father_age?: number | null;
  father_occ?: string | null;
  father_educ?: string | null;
  mother_name?: string | null;
  mother_age?: number | null;
  mother_occ?: string | null;
  mother_educ?: string | null;
  legal_guardian_name?: string | null;
  legal_guardian_age?: number | null;
  legal_guardian_occ?: string | null;
  legal_guardian_educ?: string | null;
}
export interface ParentLinkInfo {
  parent_id: number;
  full_name: string;
  email: string;
  relationship: string;
  linked_at: string | null;
  requested_at: string;
}
export interface ParentLinkResponse {
  message: string;
  student_id: number;
  masked_lrn: string;
  status: "SYNCED" | "PENDING";
}
export interface ParentLinkActionResponse {
  success: boolean;
  message: string;
}
export interface Teacher {
  teacher_id: number;
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
  employee_id: string | null;
  class_name: string | null;
  section_name: string | null;
  section_id: number | null;
  role: string | null;
  is_active: boolean;
  allow_eccd_question_management: boolean;
}
export interface Section {
  section_id: number;
  section_name: string;
  adviser_teacher_id: number | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  status: string | null;
}
export interface TeacherFormValues {
  first_name: string;
  last_name: string;
  email: string;
  employee_id: string;
  section_id: string;
}
export interface TeacherUpdatePayload {
  first_name: string;
  last_name: string;
  email: string;
  employee_id: string | null;
  class_name: string;
}
export interface TeacherCreatePayload extends Omit<
  TeacherUpdatePayload,
  "class_name" | "employee_id"
> {
  employee_id?: string | null;
  section_id: number;
  password: string;
}
export interface SectionCreatePayload {
  section_name: string;
}
export interface TeacherPermissionPayload {
  allow_eccd_question_management: boolean;
}
export interface TeacherAssignmentPayload {
  teacher_id: number;
}
export interface Question {
  question_id: number;
  domain_id: number;
  domain_name?: string;
  question_text: string;
  sequence_order: number;
  is_home_based?: boolean;
  evaluator_roles?: Partial<Record<Period, "teacher" | "parent" | null>>;
  answers: Record<Period, Answer | null>;
}
export interface Domain {
  domain_id: number;
  domain_name: string;
  questions: Question[];
}
export interface PeriodSummary {
  period: Period;
  isReleased: boolean;
  isEvaluated: boolean;
  is_published: boolean;
  assessmentDate: string | null;
  decimalAge: number | null;
  standardScore: number | null;
  interpretation: string | null;
  rawScores: Record<string, number> | null;
  scaledScores: Record<string, number> | null;
  sumOfScaledScores: number | null;
}
export interface ParentAssessmentAccess {
  pre_test_parent_editable: boolean;
  mid_test_parent_editable: boolean;
  post_test_parent_editable: boolean;
}
export interface SectionAssessmentAccess extends ParentAssessmentAccess {
  section_id: number;
}
export interface Assessment {
  allow_parent_view_eccd_marks?: boolean;
  parent_assessment_access?: ParentAssessmentAccess;
  student_id: number;
  masked_lrn: string;
  domains: Domain[];
  evalAges: Record<string, Record<Period, number | null>>;
  periodDates: Record<Period, string | null>;
  evaluationDates?: Partial<Record<Period, string | null>>;
  gradingDates?: Partial<Record<Period, string | null>>;
  student_birth_date: string | null;
  student?: Student;
  permissions?: Permissions;
  summary?: Record<Period, PeriodSummary>;
  matrix?: {
    domain_id: number;
    domain_name: string;
    domain_code: string;
    scores: Record<Period, number | null>;
  }[];
  homeBasedChecklist?: Question[];
  can_edit_home_based?: boolean;
}
export interface DomainProgress {
  domain_id: number;
  domain_name: string;
  pre_progress: number | null;
  mid_progress: number | null;
  post_progress: number | null;
}
export interface ParentStats {
  currentPhase: string;
  latestPhase: Period | null;
  excelsIn: string;
  needsSupportIn: string;
  assessmentMastered: boolean;
  totalKaya: number | null;
  totalDiKaya: number | null;
  is_published: boolean;
  interpretation?: string;
}
export interface Contact {
  id: number;
  name: string;
  latest_message_time: string | null;
}
export interface ChatMessage {
  message_id: number;
  teacher_id: number;
  parent_id: number;
  sender_role: "teacher" | "parent";
  body: string;
  created_at: string;
  is_read: boolean;
}
export interface MessageResult {
  message: string;
}
export interface ImportResult {
  successCount: number;
  failedCount: number;
  errors: { row: number; error: string }[];
}
export const studentName = (s: Student): string =>
  s.full_name ||
  [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ") ||
  `Child • ${s.masked_lrn}`;
