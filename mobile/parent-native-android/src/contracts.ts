export type Period = 'PRE' | 'MID' | 'POST';
export const PERIODS: Period[] = ['PRE', 'MID', 'POST'];
export interface User { id: number; role: 'user' | 'admin' | 'super-admin'; full_name: string; email?: string; }
export interface SessionResponse { success: true; access_token: string; user: User; }
export interface Challenge { success: true; requireOtp: true; challengeToken: string; email: string; emailSent?: boolean; code?: string; message?: string; }
export type AuthResponse = SessionResponse | Challenge;
export interface Credentials { email: string; password: string; terms_accepted: true; }
export interface Registration extends Credentials { firstName: string; lastName: string; relationship: string; }
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
export interface Branding { school_name: string; primary_color: string; logo_url: string | null; }
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
  question_id: number; question_text: string; sequence_order: number; is_home_based: boolean;
  answers: Record<Period, 'KAYA' | 'DI-KAYA' | null>;
  evaluator_roles: Record<Period, 'teacher' | 'parent' | null>;
  parent_submitted_at: Partial<Record<Period, string | null>>;
  teacher_marked_at: Partial<Record<Period, string | null>>;
  parent_locked: Partial<Record<Period, boolean>>;
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
