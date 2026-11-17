export type Period = 'PRE' | 'MID' | 'POST';
export const PERIODS: Period[] = ['PRE', 'MID', 'POST'];
export interface User { id: number; role: 'user' | 'admin' | 'super-admin'; full_name: string; email?: string; }
export interface SessionResponse { success: true; access_token: string; user: User; }
export interface Challenge { success: true; requireOtp: true; challengeToken: string; email: string; emailSent?: boolean; code?: string; message?: string; }
export type AuthResponse = SessionResponse | Challenge;
export interface Credentials { email: string; password: string; terms_accepted: true; }
export const RELATIONSHIPS = ['Father', 'Mother', 'Guardian'] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];
export interface Registration extends Credentials { firstName: string; lastName: string; relationship: Relationship; }
export interface Permissions {
  allow_parent_view_student_info: boolean;
  allow_parent_view_eccd_pre: boolean;
  allow_parent_view_eccd_mid: boolean;
  allow_parent_view_eccd_post: boolean;
  allow_parent_view_eccd_marks: boolean;
  allow_parent_predictions: boolean;
  allow_parent_edit_student_info: boolean;
  allow_parent_edit_home_based_eccd: boolean;
}
export interface Child extends Permissions {
  student_id: number; full_name?: string | null; first_name?: string | null; last_name?: string | null;
  section_name?: string | null; class_name?: string | null; school_year?: string | null;
  adviser_name?: string | null; teacher_fname?: string | null; teacher_lname?: string | null;
  is_active: boolean; date_of_birth?: string | null; gender?: string | null; masked_lrn: string;
}
export interface Branding { system_name: string; primary_color: string; logo_url: string | null; }
export interface ChildProfile extends Child {
  age: number | null; profile_completeness: number;
  address: string | null; handedness: string | null; num_of_siblings: number | null;
  birth_order: string | null; emergency_contact: string | null;
  father_name: string | null; father_age: number | null; father_occ: string | null; father_educ: string | null;
  mother_name: string | null; mother_age: number | null; mother_occ: string | null; mother_educ: string | null;
  legal_guardian_name: string | null; legal_guardian_age: number | null; legal_guardian_occ: string | null; legal_guardian_educ: string | null;
}
export interface LinkResponse { message: string; student_id: number; masked_lrn: string; status: 'SYNCED' | 'PENDING'; }
export interface Contacts { myId: number | null; contacts: Array<{id: number; name: string; latest_message_time: string | null}>; }
export interface Message {
  message_id: number; parent_id: number; teacher_id: number; sender_role: 'teacher' | 'parent';
  subject: string | null; body: string; message_body?: string; is_read: boolean; is_archived: boolean;
  created_at: string; sent_at?: string | null;
}
export interface ReadReceipt { teacher_id: number; parent_id: number; reader_role: 'teacher' | 'parent'; message_ids: number[]; }
export type Answer = 'KAYA' | 'DI-KAYA';
export interface HomePayload { student_id: number; testing_period: Period; photo_ids?: Record<number, string>; evaluations: Array<{question_id: number; testing_period: Period; answer: Answer}>; }
export interface Dashboard {
  currentPhase: string; latestPhase: string | null; excelsIn: string; needsSupportIn: string;
  assessmentMastered: boolean; totalKaya: number | null; totalDiKaya: number | null;
  is_published: boolean; interpretation: string | null; overallStatus: string; overallStatusColor: string;
  domainCards: Array<{domain_id: number; domain_name: string; scoreText: string; progress: number | null;
    statusText: string; statusColor: string; isExcelling: boolean; needsSupport: boolean}>;
}
export interface PeriodSummary {
  period: Period; isReleased: boolean; isEvaluated: boolean; is_published: boolean;
  assessmentDate: string | null; decimalAge: number | null; standardScore: number | null;
  interpretation: string | null; rawScores: Record<string, number> | null;
  scaledScores: Record<string, number> | null; sumOfScaledScores: number | null;
}
export interface Question {
  home_observations?: Partial<Record<Period, {status: 'pending' | 'accepted' | 'declined' | 'submitted'; answer: Answer | null; submitted_at: string | null} | null>>;
  photo_eligible?: Partial<Record<Period, boolean>>;
  question_id: number; question_text: string; sequence_order: number; is_home_based: boolean;
  answers: Record<Period, 'KAYA' | 'DI-KAYA' | null>;
  evaluator_roles: Record<Period, 'teacher' | 'parent' | null>;
  parent_submitted_at: Partial<Record<Period, string | null>>;
  teacher_marked_at: Partial<Record<Period, string | null>>;
  parent_locked: Partial<Record<Period, boolean>>;
    carry_forward?: Partial<Record<Period, 'locked' | 'editable' | 'restricted' | null>>;
}
export interface Assessment {
  student_id: number; permissions: Permissions; allow_parent_view_eccd_marks: boolean;
  parent_assessment_access: {pre_test_parent_editable: boolean; mid_test_parent_editable: boolean; post_test_parent_editable: boolean};
  can_edit_home_based: boolean; summary: Record<Period, PeriodSummary>;
  matrix: Array<{domain_id: number; domain_code: string; domain_name: string; scores: Record<Period, number | null>}>;
  domains: Array<{domain_id: number; domain_name: string; questions: Question[]}>;
}
export interface Readiness { student_id: number; student_name: string; pre_complete: boolean; readiness_note: string; allow_parent_predictions: boolean; is_published: boolean; }
export interface Baseline { domain: string; name: string; pre_scaled_score: number; tier: 'Delay' | 'Slight Delay' | 'Average'; }
export interface Intervention extends Baseline { goal: string; home_activity: string; practice: string; scaffolding: string; review_days: number; success_check: string; source_url: string; }
export interface Prediction {
  student_id: number; prediction_status: 'available'; predicted_post_interpretation: string | null;
  confidence_percentages: Record<string, number>; baseline_domains: Baseline[]; interventions: Intervention[];
  interpretation_note: string; research_notice: string;
}
