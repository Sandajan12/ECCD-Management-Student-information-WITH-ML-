import type {
  Assessment,
  Child,
  Dashboard,
  Permissions,
  Question,
} from "../src/contracts.ts";
import { DraftStore } from "../src/draftStore.ts";

export function assessmentFixture() {
  const permissions: Permissions = {
    allow_parent_view_student_info: true,
    allow_parent_view_eccd_pre: true,
    allow_parent_view_eccd_mid: false,
    allow_parent_view_eccd_post: false,
    allow_parent_view_eccd_marks: true,
    allow_parent_predictions: true,
    allow_parent_edit_student_info: true,
    allow_parent_edit_home_based_eccd: true,
  };
  const child: Child = {
    ...permissions,
    student_id: 7,
    is_active: true,
    masked_lrn: "********1234",
  };
  const question = (
    id: number,
    sequence: number,
    home: boolean,
    answer: Question["answers"]["PRE"],
  ): Question => ({
    question_id: id,
    sequence_order: sequence,
    question_text: `Indicator ${id}`,
    is_home_based: home,
    answers: { PRE: answer, MID: null, POST: null },
    evaluator_roles: { PRE: answer ? "teacher" : null, MID: null, POST: null },
    parent_locked: { PRE: false },
    parent_submitted_at: {},
    teacher_marked_at: {},
  });
  const summary = (period: "PRE" | "MID" | "POST") => ({
    period,
    isReleased: period === "PRE",
    is_published: period === "PRE",
    isEvaluated: period === "PRE",
    assessmentDate: null,
    decimalAge: null,
    standardScore: null,
    interpretation: null,
    rawScores: null,
    scaledScores: null,
    sumOfScaledScores: null,
  });
  const assessment: Assessment = {
    student_id: 7,
    permissions: { ...permissions },
    allow_parent_view_eccd_marks: true,
    can_edit_home_based: true,
    parent_assessment_access: {
      pre_test_parent_editable: true,
      mid_test_parent_editable: true,
      post_test_parent_editable: false,
    },
    summary: {
      PRE: summary("PRE"),
      MID: summary("MID"),
      POST: summary("POST"),
    },
    matrix: [],
    domains: [
      {
        domain_id: 2,
        domain_name: "Motor",
        questions: [
          question(45, 3, true, null),
          question(46, 1, true, "KAYA"),
          question(47, 2, false, "DI-KAYA"),
        ],
      },
      {
        domain_id: 3,
        domain_name: "Language",
        questions: [question(48, 1, true, null)],
      },
    ],
  };
  // Server aggregate fixture includes a school DI-KAYA and a home KAYA; it is not derived from the editable list.
  const dashboard: Dashboard = {
    currentPhase: "Pre-Test",
    latestPhase: "PRE",
    is_published: true,
    excelsIn: "Language",
    needsSupportIn: "Motor",
    assessmentMastered: false,
    totalKaya: 1,
    totalDiKaya: 1,
    interpretation: null,
    overallStatus: "Developing Well",
    overallStatusColor: "success",
    domainCards: [],
  };
  const records = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => records.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      records.set(key, value);
    },
    removeItem: async (key: string) => {
      records.delete(key);
    },
  };
  return {
    child,
    assessment,
    dashboard,
    records,
    storage,
    store: new DraftStore(storage),
  };
}
