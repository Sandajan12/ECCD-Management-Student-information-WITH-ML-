import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Modal, Stack } from "@mui/material";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import SchoolOutlined from "@mui/icons-material/SchoolOutlined";
import HomeOutlined from "@mui/icons-material/HomeOutlined";
import API, { errorMessage, isNetworkError } from "../../services/api";
import { useTeacher } from "../../context/TeacherContext";
import { useAuth } from "../../context/AuthContext";
import { readDraft, storeDraft, useDurableForm } from "../../utils/drafts";
import {
  sandboxAge,
  sandboxScaledScore,
  sandboxStandardScore,
  sandboxStandardResult,
} from "../../utils/mlScoring";
import type { SandboxDomain } from "../../utils/mlScoring";
import { settleWithConcurrency } from "../../utils/concurrency";
import ForecastSupportNotice from "../../components/common/ForecastSupportNotice";
import type { ForecastState } from "../../components/common/ForecastSupportNotice";

interface MLFeatures {
  pre_standard_score: number;
  pre_total_scaled: number;
  pre_delayed_domains_count: number;
  gm_pre_scaled: number;
  fm_pre_scaled: number;
  sh_pre_scaled: number;
  rl_pre_scaled: number;
  el_pre_scaled: number;
  cog_pre_scaled: number;
  se_pre_scaled: number;
  age_months_pre: number;
  gender: string | null;
  handedness: string | null;
  father_education_level: string | null;
  household_occupation_tier: string | null;
  mother_education_level: string | null;
  num_siblings: number | null;
  birth_order: number | null;
}
interface SandboxPredictionRequest extends MLFeatures {
  raw_scores: Record<SandboxDomain, number>;
}
interface BaselineDomain {
  domain: string;
  name: string;
  pre_scaled_score: number;
  tier: "Delay" | "Slight Delay" | "Average";
}
interface Intervention extends BaselineDomain {
  di_kaya_items: number[];
  goal: string;
  curriculum_area: string;
  classroom_activity: string;
  home_activity: string;
  practice: string;
  scaffolding: string;
  review_days: number;
  success_check: string;
  source_url: string;
}
interface Prediction extends ForecastState {
  student_id: number | null;
  student_name: string | null;
  assessment_date: string | null;
  baseline_domains: BaselineDomain[];
  interventions: Intervention[];
  features: MLFeatures;
  imputed_fields: string[];
}
interface StudentOption {
  student_id: number;
  student_name: string;
  pre_complete: boolean;
  readiness_note: string;
}
interface PredictionViewProps {
  prediction: Prediction;
  sandbox?: boolean;
}
type FeatureValues = { [K in keyof MLFeatures]: string };
type RawFeature = `${SandboxDomain}_pre_raw`;
type SandboxInputs = Omit<
  FeatureValues,
  | DomainFeature
  | "pre_standard_score"
  | "pre_total_scaled"
  | "pre_delayed_domains_count"
> &
  Record<RawFeature, string>;
type SandboxValues = SandboxInputs & FeatureValues;
type DomainFeature =
  | "gm_pre_scaled"
  | "fm_pre_scaled"
  | "sh_pre_scaled"
  | "rl_pre_scaled"
  | "el_pre_scaled"
  | "cog_pre_scaled"
  | "se_pre_scaled";
interface DomainInput {
  key: DomainFeature;
  name: string;
  code: SandboxDomain;
  rawKey: RawFeature;
  maxRaw: number;
}
const domains: DomainInput[] = [
  {
    key: "gm_pre_scaled",
    name: "Gross Motor",
    code: "GM",
    rawKey: "GM_pre_raw",
    maxRaw: 13,
  },
  {
    key: "fm_pre_scaled",
    name: "Fine Motor",
    code: "FM",
    rawKey: "FM_pre_raw",
    maxRaw: 11,
  },
  {
    key: "sh_pre_scaled",
    name: "Self-Help",
    code: "SH",
    rawKey: "SH_pre_raw",
    maxRaw: 27,
  },
  {
    key: "rl_pre_scaled",
    name: "Receptive Language",
    code: "RL",
    rawKey: "RL_pre_raw",
    maxRaw: 5,
  },
  {
    key: "el_pre_scaled",
    name: "Expressive Language",
    code: "EL",
    rawKey: "EL_pre_raw",
    maxRaw: 8,
  },
  {
    key: "cog_pre_scaled",
    name: "Cognitive",
    code: "C",
    rawKey: "C_pre_raw",
    maxRaw: 21,
  },
  {
    key: "se_pre_scaled",
    name: "Socio-Emotional",
    code: "SE",
    rawKey: "SE_pre_raw",
    maxRaw: 24,
  },
];
const classes = [
  {
    label: "Average Overall Development",
    short: "Average",
    color: "bg-emerald-500",
    tone: "bg-emerald-50 text-emerald-800",
  },
  {
    label: "Suggests Slight Delay in Overall Development",
    short: "Slight Delay",
    color: "bg-amber-400",
    tone: "bg-amber-50 text-amber-800",
  },
  {
    label: "Suggests Significant Delay in Overall Development",
    short: "Significant Delay",
    color: "bg-rose-500",
    tone: "bg-rose-50 text-rose-800",
  },
];
const card =
  "min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6";
const input =
  "w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand! focus:ring-2 focus:ring-brand/15!";
const initialSandbox: SandboxInputs = {
  GM_pre_raw: "",
  FM_pre_raw: "",
  SH_pre_raw: "",
  RL_pre_raw: "",
  EL_pre_raw: "",
  C_pre_raw: "",
  SE_pre_raw: "",
  age_months_pre: "66",
  gender: "",
  handedness: "",
  father_education_level: "",
  household_occupation_tier: "",
  mother_education_level: "",
  num_siblings: "",
  birth_order: "",
};
function tierTone(tier: string): string {
  return tier === "Average"
    ? classes[0].tone
    : tier === "Slight Delay"
      ? classes[1].tone
      : classes[2].tone;
}

function PredictionView({ prediction, sandbox = false }: PredictionViewProps) {
  const outcome =
    classes.find(
      (item) => item.label === prediction.predicted_post_interpretation,
    ) || classes[0];
  return (
    <Stack
      sx={{ gap: 3 }}
      aria-label={sandbox ? "Sandbox prediction" : "Student prediction"}
    >
      <section className={card}>
        {prediction.prediction_status === "available" &&
          prediction.confidence_percentage !== null && (
            <>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                sx={{ gap: 2, justifyContent: "space-between" }}
              >
                <div>
                  <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                    {sandbox
                      ? "Hypothetical Post-Test outcome"
                      : "Predicted Post-Test outcome"}
                  </p>
                  <h2
                    className={`mt-3 inline-block rounded-xl px-4 py-3 text-lg font-semibold ${outcome.tone}`}
                  >
                    {prediction.predicted_post_interpretation}
                  </h2>
                  {prediction.student_name && (
                    <p className="mt-3 text-sm text-slate-500">
                      {prediction.student_name} · PRE assessment:{" "}
                      {prediction.assessment_date}
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  <p className="text-3xl font-semibold text-slate-800">
                    {prediction.confidence_percentage.toFixed(1)}%
                  </p>
                  <p className="text-xs text-slate-500">Model confidence</p>
                </div>
              </Stack>
              <p className="mt-4 text-sm text-slate-500">
                These are model probabilities, not calibrated clinical
                confidence or a guarantee of future performance.
              </p>
              <div
                className="mt-5 flex h-4 w-full overflow-hidden rounded-full bg-slate-100"
                role="img"
                aria-label={classes
                  .map(
                    (item) =>
                      `${item.short}: ${(prediction.confidence_percentages[item.label] || 0).toFixed(1)}%`,
                  )
                  .join(", ")}
              >
                {classes.map((item) => (
                  <div
                    key={item.label}
                    className={item.color}
                    style={{
                      width: `${prediction.confidence_percentages[item.label] || 0}%`,
                    }}
                  />
                ))}
              </div>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                sx={{ mt: 2, gap: 2, justifyContent: "space-between" }}
              >
                {classes.map((item) => (
                  <p
                    key={item.label}
                    className="flex items-center gap-2 text-sm text-slate-600"
                  >
                    <span
                      className={`inline-block size-2.5 rounded-full ${item.color}`}
                    />
                    {item.short}
                    <strong className="ml-auto sm:ml-1">
                      {(
                        prediction.confidence_percentages[item.label] || 0
                      ).toFixed(1)}
                      %
                    </strong>
                  </p>
                ))}
              </Stack>
            </>
          )}
        <ForecastSupportNotice />
        {prediction.imputed_fields.length > 0 && (
          <p className="mt-5 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            Inputs left blank:{" "}
            {prediction.imputed_fields
              .map((field) => field.replaceAll("_", " "))
              .join(", ")}
            . Household details are excluded from this research prediction.
            Missing child demographics use training defaults, which do not
            describe the learner’s actual family circumstances.
          </p>
        )}
      </section>
      <section aria-labelledby="baseline-title">
        <h2
          id="baseline-title"
          className="mb-1 text-lg font-semibold text-slate-800"
        >
          Baseline profile
        </h2>
        <p className="mb-2 text-sm font-medium text-slate-700">
          Overall PRE interpretation (scoring table):{" "}
          {prediction.pre_interpretation ?? "Unavailable"}
        </p>
        <p className="mb-4 text-sm text-slate-500">
          PRE scaled scores · local planning tiers: ≤3 Delay, 4–6 Slight Delay,
          ≥7 Average. These domain support tiers are separate from the overall
          PRE interpretation.
        </p>
        <Stack
          direction="row"
          sx={{
            flexWrap: "wrap",
            gap: 2,
            "& > div": {
              flex: {
                xs: "1 1 100%",
                sm: "1 1 calc(50% - 1rem)",
                lg: "1 1 calc(25% - 1rem)",
              },
              minWidth: 0,
            },
          }}
        >
          {prediction.baseline_domains.map((domain) => (
            <div key={domain.domain} className={card}>
              <p className="text-sm font-medium text-slate-600">
                {domain.name}
              </p>
              <p className="my-3 text-3xl font-semibold text-slate-800">
                {domain.pre_scaled_score}
              </p>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${tierTone(domain.tier)}`}
              >
                {domain.tier}
              </span>
            </div>
          ))}
        </Stack>
      </section>
      <section className={card} aria-labelledby="interventions-title">
        <h2
          id="interventions-title"
          className="text-lg font-semibold text-slate-800"
        >
          Prescriptive interventions
        </h2>
        <p className="mt-1 mb-5 text-sm leading-relaxed text-slate-500">
          Locally authored classroom and home activities aligned at domain level
          to the DepEd Kindergarten Curriculum Guide. Teacher review required;
          no claim of official endorsement or proven treatment effect.
          Activities follow observed PRE gaps independently of the prediction.
        </p>
        <Stack sx={{ gap: 2 }}>
          {prediction.interventions.map((guide) => (
            <details key={guide.domain} className="rounded-xl bg-slate-50 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                {guide.name}
                <span
                  className={`ml-2 inline-block rounded-full px-2 py-1 text-xs ${tierTone(guide.tier)}`}
                >
                  {guide.tier}
                </span>
              </summary>
              <Stack sx={{ mt: 2, gap: 2 }}>
                <p className="text-sm text-slate-600">{guide.goal}</p>
                {guide.di_kaya_items.length > 0 && (
                  <p className="text-xs text-slate-500">
                    Observed DI-KAYA items (domain positions):{" "}
                    {guide.di_kaya_items.join(", ")}
                  </p>
                )}
                <Stack direction={{ xs: "column", md: "row" }} sx={{ gap: 3 }}>
                  <div className="flex-1">
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand">
                      <SchoolOutlined fontSize="small" />
                      In the classroom
                    </h3>
                    <p className="text-sm leading-relaxed text-slate-600">
                      {guide.classroom_activity}
                    </p>
                  </div>
                  <div className="flex-1">
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-800">
                      <HomeOutlined fontSize="small" />
                      At home
                    </h3>
                    <p className="text-sm leading-relaxed text-slate-600">
                      {guide.home_activity}
                    </p>
                  </div>
                </Stack>
                <p className="text-sm text-slate-600">
                  <strong>Practice:</strong> {guide.practice}.{" "}
                  {guide.scaffolding}.
                </p>
                <p className="text-sm text-slate-600">
                  <strong>Review in {guide.review_days} days:</strong>{" "}
                  {guide.success_check}
                </p>
                <p className="text-xs text-slate-500">
                  Curriculum area: {guide.curriculum_area}
                </p>
                <a
                  href={guide.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-brand underline"
                >
                  DepEd curriculum reference
                </a>
              </Stack>
            </details>
          ))}
          {prediction.interventions.length === 0 && (
            <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
              No domains meet the support trigger in this profile. Continue
              ordinary classroom observation and play.
            </p>
          )}
        </Stack>
      </section>
    </Stack>
  );
}

interface StudentEvaluationProps {
  sectionId: number;
  tabs: ReactNode;
  active: boolean;
}

function StudentEvaluation({
  sectionId,
  tabs,
  active,
}: StudentEvaluationProps) {
  const { section } = useTeacher();
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudentModal, setSelectedStudentModal] =
    useState<StudentOption | null>(null);
  const { values, change } = useDurableForm(`ml_selection_${sectionId}`, {
    studentId: "",
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [batchStudents, setBatchStudents] = useState<StudentOption[]>([]);
  const [pendingStudentIds, setPendingStudentIds] = useState<number[]>([]);
  const [error, setError] = useState<string>("");
  const [predictionsByStudentId, setPredictionsByStudentId] = useState<
    Partial<Record<number, Prediction>>
  >({});
  const [refresh, setRefresh] = useState<number>(0);
  const running = batchStudents.length > 0;
  const readyStudents = students.filter((student) => student.pre_complete);
  const selected =
    students.find(
      (student) => student.student_id === selectedStudentModal?.student_id,
    ) ?? selectedStudentModal;
  const openStudentModal = (student: StudentOption) => {
    change({ studentId: String(student.student_id) });
    setSelectedStudentModal(student);
  };
  const closeStudentModal = () => setSelectedStudentModal(null);
  const selectedPending =
    !!selected && pendingStudentIds.includes(selected.student_id);
  const prediction =
    selected?.pre_complete && !selectedPending
      ? predictionsByStudentId[selected.student_id]
      : undefined;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void API.get<StudentOption[]>("/api/ml/students", {
      params: { section_id: sectionId },
      signal: controller.signal,
    })
      .then(({ data }) => {
        if (!controller.signal.aborted) {
          setStudents(data);
          setError("");
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [sectionId, refresh]);
  useEffect(() => {
    if (batchStudents.length === 0) return;
    const controller = new AbortController();
    void settleWithConcurrency(
      batchStudents,
      3,
      async (student) => {
        try {
          const { data } = await API.post<Prediction>(
            `/api/ml/predict/student/${student.student_id}`,
            undefined,
            { signal: controller.signal },
          );
          if (!controller.signal.aborted) {
            setPredictionsByStudentId((previous) => ({
              ...previous,
              [student.student_id]: data,
            }));
          }
        } finally {
          if (!controller.signal.aborted) {
            setPendingStudentIds((previous) =>
              previous.filter((id) => id !== student.student_id),
            );
          }
        }
      },
      controller.signal,
    ).then((results) => {
      if (controller.signal.aborted) return;
      setError(
        results
          .flatMap((result, index) =>
            result.status === "rejected"
              ? [
                  `${batchStudents[index].student_name}: ${errorMessage(result.reason)}`,
                ]
              : [],
          )
          .join(" "),
      );
      setBatchStudents([]);
    });
    return () => controller.abort();
  }, [batchStudents]);
  useEffect(() => {
    const retry = () => setRefresh((value) => value + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);
  return (
    <Stack sx={{ gap: 1.5, minWidth: 0 }}>
      <Stack
        direction="row"
        className="rounded-xl border border-slate-200/80 bg-white p-2 shadow-xs"
        sx={{
          flexWrap: "wrap",
          gap: 1,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {tabs}
        {active && (
          <Stack
            direction="row"
            sx={{
              flexWrap: "wrap",
              alignItems: "center",
              gap: 1.5,
              ml: "auto",
            }}
          >
            <p className="text-xs text-slate-500">
              {loading
                ? "Loading learners…"
                : `${students.length} ${students.length === 1 ? "learner" : "learners"} in your active section · ${readyStudents.length} ready for prediction`}
            </p>
            <button
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={readyStudents.length === 0 || running || loading}
              onClick={() => {
                setPredictionsByStudentId({});
                setPendingStudentIds(
                  readyStudents.map((student) => student.student_id),
                );
                setError("");
                setBatchStudents(readyStudents);
              }}
            >
              <PlayArrowRounded fontSize="small" />
              {running ? "Predicting..." : "Predict All Students"}
            </button>
          </Stack>
        )}
      </Stack>
      <section
        role="tabpanel"
        id="panel-student"
        aria-labelledby="tab-student"
        hidden={!active}
        className="min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs"
      >
        <div className="overflow-x-auto">
          <table
            className="w-full table-fixed text-left text-sm"
            aria-label="Student evaluation"
          >
            <thead className="bg-slate-100/70 text-xs tracking-wider text-slate-600 uppercase [&_th]:border-b [&_th]:border-slate-200">
              <tr className="border-b border-slate-200 last:border-b">
                <th
                  scope="col"
                  className="px-2 py-4 font-medium tracking-wider text-slate-600 sm:px-4"
                >
                  Student Name
                </th>
                <th
                  scope="col"
                  className="px-2 py-4 font-medium tracking-wider text-slate-600 sm:px-4"
                >
                  PRE Assessment Status
                </th>
                <th
                  scope="col"
                  className="px-2 py-4 font-medium tracking-wider text-slate-600 sm:px-4"
                >
                  Prediction Result
                </th>
              </tr>
            </thead>
            <tbody
              className="[&_td]:border-b [&_td]:border-slate-100 [&_tr:last-child_td]:border-b-0"
              aria-busy={loading}
            >
              {loading ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    Loading learners…
                  </td>
                </tr>
              ) : (
                students.map((student) => {
                  const active =
                    values.studentId === String(student.student_id);
                  const pending =
                    student.pre_complete &&
                    pendingStudentIds.includes(student.student_id);
                  const ready =
                    student.pre_complete &&
                    !!predictionsByStudentId[student.student_id];
                  return (
                    <tr
                      key={student.student_id}
                      tabIndex={0}
                      aria-selected={active}
                      aria-haspopup="dialog"
                      onClick={() => openStudentModal(student)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openStudentModal(student);
                        }
                      }}
                      className={`cursor-pointer border-b border-slate-100 transition-colors last:border-b-0 focus-visible:outline-2 focus-visible:outline-brand focus-visible:-outline-offset-2 ${active ? "bg-brand/5 hover:bg-brand/10" : "hover:bg-slate-50/80"}`}
                    >
                      <td className="px-2 py-4 font-medium wrap-anywhere text-slate-800 sm:px-4">
                        {student.student_name}
                      </td>
                      <td className="px-2 py-4 sm:px-4">
                        <span
                          className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${student.pre_complete ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
                        >
                          {student.pre_complete ? "Ready" : "Not Ready"}
                        </span>
                      </td>
                      <td className="px-2 py-4 sm:px-4">
                        <span
                          className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium wrap-anywhere ${pending ? "bg-brand/10 text-brand" : ready ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500"}`}
                        >
                          {pending
                            ? "Predicting..."
                            : ready
                              ? "Ready"
                              : "Not Ready"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
              {!loading && students.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No active learners in this section yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {error && (
          <div
            role="alert"
            className="m-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800"
          >
            {error}
            <button
              className="ml-3 underline"
              onClick={() => setRefresh((value) => value + 1)}
            >
              Refresh learners
            </button>
          </div>
        )}
      </section>
      <Modal
        open={selectedStudentModal !== null}
        onClose={closeStudentModal}
        className="fixed inset-0 flex items-center justify-center p-4"
        slotProps={{
          backdrop: { className: "!bg-black/50 backdrop-blur-xs" },
        }}
      >
        <Stack
          role="dialog"
          aria-modal="true"
          aria-labelledby="student-evaluation-modal-title"
          aria-describedby="student-evaluation-modal-subtitle"
          tabIndex={-1}
          sx={{
            position: "relative",
            width: "100%",
            minWidth: 0,
            maxWidth: "56rem",
            maxHeight: "90dvh",
            overflowY: "auto",
            borderRadius: 3,
            border: "1px solid",
            borderColor: "#e2e8f0",
            bgcolor: "#f8fafc",
            p: { xs: 2, sm: 3 },
            gap: 3,
            outline: "none",
          }}
          className="shadow-2xl"
        >
          <header className="pr-12">
            <h2
              id="student-evaluation-modal-title"
              className="text-xl font-bold wrap-anywhere text-slate-800 sm:text-2xl"
            >
              {selected?.student_name}
            </h2>
            <p
              id="student-evaluation-modal-subtitle"
              className="mt-1 text-sm text-slate-500"
            >
              Active section: {section?.section_name}
            </p>
          </header>
          <button
            type="button"
            aria-label="Close student evaluation"
            autoFocus
            onClick={closeStudentModal}
            className="absolute top-4 right-4 rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-brand sm:top-6 sm:right-6"
          >
            ✕
          </button>
          {prediction ? (
            <PredictionView prediction={prediction} />
          ) : (
            <Stack
              role="status"
              sx={{ gap: 3, alignItems: "center" }}
              className={`rounded-xl p-6 text-center text-sm ${selected?.pre_complete ? "bg-slate-50 text-slate-600" : "bg-amber-50 text-amber-900"}`}
            >
              <p>
                {!selected?.pre_complete
                  ? "This learner's PRE assessment is incomplete. Complete the PRE assessment in the Assessments tab to enable post-test predictions and prescriptive guides."
                  : selectedPending
                    ? "Predicting this learner's post-test outcome..."
                    : "Prediction has not been generated yet for this learner. Click 'Run Prediction' or use 'Predict All Students' on the main table."}
              </p>
              {selected?.pre_complete && !selectedPending && (
                <button
                  type="button"
                  disabled={running || loading}
                  onClick={() => {
                    setPendingStudentIds([selected.student_id]);
                    setError("");
                    setBatchStudents([selected]);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PlayArrowRounded fontSize="small" />
                  Run Prediction
                </button>
              )}
            </Stack>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800"
            >
              {error}
            </p>
          )}
          <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={closeStudentModal}
              className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-brand"
            >
              Close
            </button>
          </Stack>
        </Stack>
      </Modal>
    </Stack>
  );
}

function validInteger(value: string, min: number, max: number): boolean {
  const number = Number(value);
  return (
    value.trim() !== "" &&
    Number.isInteger(number) &&
    number >= min &&
    number <= max
  );
}

function derivedSandboxValues(values: SandboxInputs): SandboxValues {
  const age = Number(values.age_months_pre);
  const validAge = validInteger(values.age_months_pre, 36, 71);
  const scaled = {} as Pick<FeatureValues, DomainFeature>;
  for (const domain of domains) {
    scaled[domain.key] =
      validAge && validInteger(values[domain.rawKey], 0, domain.maxRaw)
        ? String(
            sandboxScaledScore(domain.code, Number(values[domain.rawKey]), age),
          )
        : "";
  }
  const validDomains = domains.every((domain) => scaled[domain.key] !== "");
  const scores = domains.map((domain) => Number(scaled[domain.key]));
  const total = scores.reduce((sum, score) => sum + score, 0);
  return {
    ...values,
    ...scaled,
    pre_total_scaled: validDomains ? String(total) : "",
    pre_delayed_domains_count: validDomains
      ? String(scores.filter((score) => score <= 6).length)
      : "",
    pre_standard_score:
      validDomains && validAge ? String(sandboxStandardScore(total, age)) : "",
  };
}

function SandboxSimulator() {
  const { user } = useAuth();
  const [legacyValues] = useState(
    () =>
      readDraft<FeatureValues>(`ames_draft_${user?.id || 0}_ml_sandbox_v1`)
        ?.values,
  );
  const [startingValues] = useState<SandboxInputs>(() => {
    const next = { ...initialSandbox };
    if (legacyValues) {
      for (const field of Object.keys(
        initialSandbox,
      ) as (keyof SandboxInputs)[]) {
        if (field in legacyValues)
          next[field] = legacyValues[field as keyof FeatureValues];
      }
    }
    return next;
  });
  const {
    values: draftValues,
    change,
    key,
  } = useDurableForm<SandboxInputs>("ml_sandbox_raw_v2", startingValues);
  const [submittedResult, setSubmittedResult] = useState<{
    revision: string;
    data: Prediction;
  } | null>(null);
  const requestVersion = useRef(0);
  const [error, setError] = useState<string>("");
  const [running, setRunning] = useState<boolean>(false);
  const [retry, setRetry] = useState<number>(0);
  const values = useMemo(
    () => derivedSandboxValues(draftValues),
    [draftValues],
  );
  // Bind rendering to the complete input snapshot, including restored drafts.
  const revision = JSON.stringify([key, draftValues]);
  const prediction =
    submittedResult?.revision === revision ? submittedResult.data : null;
  const update = (field: keyof SandboxInputs, value: string) => {
    ++requestVersion.current;
    setSubmittedResult(null);
    setError("");
    setRunning(true);
    change({ ...draftValues, [field]: value });
  };
  const fieldErrors: Partial<Record<keyof SandboxValues, string>> = {};
  for (const domain of domains) {
    if (!validInteger(values[domain.rawKey], 0, domain.maxRaw))
      fieldErrors[domain.rawKey] =
        `Enter a whole-number raw score from 0 to ${domain.maxRaw}.`;
  }
  for (const [field, min, max] of [
    ["age_months_pre", 36, 71],
    ["num_siblings", 0, 30],
    ["birth_order", 1, 31],
  ] as const) {
    if (
      (field === "age_months_pre" || values[field] !== "") &&
      !validInteger(values[field], min, max)
    )
      fieldErrors[field] = `Enter a whole number from ${min} to ${max}.`;
  }
  const invalid = Object.keys(fieldErrors).length > 0;
  useEffect(() => {
    const controller = new AbortController();
    const version = ++requestVersion.current;
    const currentRequest = () =>
      !controller.signal.aborted && requestVersion.current === version;
    setSubmittedResult(null);
    setError("");
    setRunning(true);
    const timer = window.setTimeout(() => {
      const draft = readDraft<SandboxInputs>(key);
      const markPending = (pending: boolean) => {
        const current = readDraft<SandboxInputs>(key);
        if (draft && current?.revision === draft.revision)
          storeDraft(key, { ...current, is_pending_sync: pending });
      };
      if (draft?.is_pending_sync && retry === 0) {
        setError(
          "Your draft is saved on this device. Reconnect and submit again.",
        );
        setRunning(false);
        return;
      }
      if (!navigator.onLine) {
        markPending(true);
        setError(
          "Your draft is saved on this device. Reconnect and submit again.",
        );
        setRunning(false);
        return;
      }
      if (invalid) {
        setError(
          "Enter valid raw scores and PRE age, and review the highlighted fields to run the simulation.",
        );
        setRunning(false);
        return;
      }
      const optionalNumber = (value: string): number | null =>
        value === "" ? null : Number(value);
      const payload: SandboxPredictionRequest = {
        gm_pre_scaled: Number(values.gm_pre_scaled),
        fm_pre_scaled: Number(values.fm_pre_scaled),
        sh_pre_scaled: Number(values.sh_pre_scaled),
        rl_pre_scaled: Number(values.rl_pre_scaled),
        el_pre_scaled: Number(values.el_pre_scaled),
        cog_pre_scaled: Number(values.cog_pre_scaled),
        se_pre_scaled: Number(values.se_pre_scaled),
        pre_standard_score: Number(values.pre_standard_score),
        pre_total_scaled: Number(values.pre_total_scaled),
        pre_delayed_domains_count: Number(values.pre_delayed_domains_count),
        age_months_pre: Number(values.age_months_pre),
        gender: values.gender || null,
        handedness: values.handedness || null,
        father_education_level: values.father_education_level || null,
        mother_education_level: values.mother_education_level || null,
        household_occupation_tier: values.household_occupation_tier || null,
        num_siblings: optionalNumber(values.num_siblings),
        birth_order: optionalNumber(values.birth_order),
        raw_scores: {
          GM: Number(values.GM_pre_raw),
          FM: Number(values.FM_pre_raw),
          SH: Number(values.SH_pre_raw),
          RL: Number(values.RL_pre_raw),
          EL: Number(values.EL_pre_raw),
          C: Number(values.C_pre_raw),
          SE: Number(values.SE_pre_raw),
        },
      };
      void API.post<Prediction>("/api/ml/predict/sandbox", payload, {
        signal: controller.signal,
      })
        .then(({ data }) => {
          if (currentRequest()) {
            setSubmittedResult({ revision, data });
            markPending(false);
          }
        })
        .catch((err: unknown) => {
          if (currentRequest()) {
            markPending(true);
            setError(
              isNetworkError(err)
                ? "Your draft is saved on this device. Reconnect and submit again."
                : errorMessage(err),
            );
          }
        })
        .finally(() => {
          if (currentRequest()) setRunning(false);
        });
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [values, key, retry, invalid, revision]);
  const numberField = (
    field: keyof SandboxValues,
    label: string,
    min: number,
    max: number,
    readOnly = false,
    helper?: string,
  ) => (
    <label key={field} className="text-sm font-medium text-slate-600">
      <span>{label}</span>
      <input
        className={`${input} mt-2 ${readOnly ? "bg-slate-50" : ""}`}
        type="number"
        min={min}
        max={max}
        step={1}
        aria-label={label}
        aria-invalid={Boolean(fieldErrors[field])}
        aria-describedby={`${field}-helper`}
        value={values[field]}
        readOnly={readOnly}
        onChange={(event) => {
          if (!readOnly)
            update(field as keyof SandboxInputs, event.target.value);
        }}
      />
      <span
        id={`${field}-helper`}
        className={`mt-1 block text-xs ${fieldErrors[field] ? "text-amber-800" : "text-slate-500"}`}
      >
        {fieldErrors[field] || helper}
      </span>
    </label>
  );
  const selectField = (
    field: keyof SandboxInputs,
    label: string,
    options: string[],
  ) => (
    <label key={field} className="text-sm font-medium text-slate-600">
      {label}
      <select
        className={`${input} mt-2`}
        value={values[field]}
        onChange={(event) => update(field, event.target.value)}
      >
        <option value="">Not provided</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <Stack sx={{ gap: 3 }}>
      <section className={card}>
        <h2 className="text-lg font-semibold text-slate-800">
          Sandbox simulator
        </h2>
        <p className="mt-1 mb-5 text-sm leading-relaxed text-slate-500">
          Explore hypothetical inputs. Predictions update as you adjust values.
          Enter each domain’s raw score (number of KAYA answers). Scaled scores,
          total scaled score, standard score and delayed-domain count are
          calculated using the PRE age and official ECCD lookup table. Sandbox
          inputs stay on this device across reloads. Age changes within the same
          scoring bracket can leave scores unchanged.
        </p>
        <Stack
          component="section"
          aria-label="Live ECCD scoring summary"
          sx={{ gap: 2, mb: 3, p: { xs: 2, sm: 3 }, borderRadius: 3 }}
          className="bg-slate-50 shadow-xs"
        >
          <h3 className="font-semibold text-slate-800">
            Live ECCD scoring summary
          </h3>
          <p className="text-sm text-slate-500">
            Raw KAYA counts → official scaled scores for the selected PRE age.
          </p>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2 }}>
            {domains.map((domain) => (
              <Stack
                key={domain.code}
                sx={{
                  gap: 0.5,
                  flex: {
                    xs: "1 1 100%",
                    sm: "1 1 calc(50% - 1rem)",
                    lg: "1 1 calc(25% - 1rem)",
                  },
                  minWidth: 0,
                }}
              >
                <p className="text-sm text-slate-500">{domain.name}</p>
                <p className="text-sm font-semibold text-slate-700">
                  {domain.code}:{" "}
                  {validInteger(values[domain.rawKey], 0, domain.maxRaw)
                    ? values[domain.rawKey]
                    : "—"}
                  /{domain.maxRaw} (Scaled: {values[domain.key] || "—"})
                </p>
              </Stack>
            ))}
          </Stack>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2 }}>
            {[
              ["Total scaled score", values.pre_total_scaled],
              ["Standard score", values.pre_standard_score],
              [
                "DepEd interpretation",
                values.pre_total_scaled !== ""
                  ? sandboxStandardResult(
                      Number(values.pre_total_scaled),
                      Number(values.age_months_pre),
                    ).interpretation
                  : "",
              ],
              ["Delayed domains (scaled ≤6)", values.pre_delayed_domains_count],
            ].map(([label, value]) => (
              <Stack
                key={label}
                sx={{ gap: 0.5, flex: "1 1 10rem", minWidth: 0 }}
              >
                <p className="text-sm text-slate-500">{label}</p>
                <p className="font-semibold text-slate-800">{value || "—"}</p>
              </Stack>
            ))}
          </Stack>
        </Stack>
        {legacyValues && (
          <details className="mb-5 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            <summary>
              Previous scaled-score draft retained for reference
            </summary>
            <p className="my-2">
              Enter raw scores below. Your previous scaled scores are preserved
              separately.
            </p>
            <ul>
              {domains.map((domain) => (
                <li key={domain.key}>
                  {domain.name}: {legacyValues[domain.key]}
                </li>
              ))}
            </ul>
          </details>
        )}
        <Stack
          direction="row"
          sx={{
            flexWrap: "wrap",
            gap: 3,
            "& > label": {
              flex: {
                xs: "1 1 100%",
                sm: "1 1 calc(50% - 1.5rem)",
                lg: "1 1 calc(33.333% - 1.5rem)",
              },
              minWidth: 0,
            },
          }}
        >
          {numberField(
            "age_months_pre",
            "Age at PRE (completed months)",
            36,
            71,
            false,
            validInteger(values.age_months_pre, 36, 71)
              ? `Decimal age: ${sandboxAge(Number(values.age_months_pre)).decimalAge.toFixed(1)} years · ${sandboxAge(Number(values.age_months_pre)).bracket}`
              : undefined,
          )}
          {domains.map((domain) =>
            numberField(
              domain.rawKey,
              `${domain.name} raw score`,
              0,
              domain.maxRaw,
              false,
              values[domain.key] !== ""
                ? `Calculated scaled score: ${values[domain.key]}`
                : `KAYA answers, 0–${domain.maxRaw}`,
            ),
          )}
          {numberField(
            "pre_standard_score",
            "PRE standard score (calculated)",
            0,
            200,
            true,
          )}
          {numberField(
            "pre_total_scaled",
            "PRE total scaled (calculated)",
            0,
            133,
            true,
          )}
          {numberField(
            "pre_delayed_domains_count",
            "Domains ≤6 (calculated)",
            0,
            7,
            true,
          )}
          {selectField("gender", "Gender", ["MALE", "FEMALE"])}
          {selectField("handedness", "Handedness", ["Left", "Right"])}
          {selectField("father_education_level", "Father’s education", [
            "Elementary",
            "High School",
            "Vocational",
            "College",
          ])}
          {selectField("mother_education_level", "Mother’s education", [
            "Elementary",
            "High School",
            "Vocational",
            "College",
          ])}
          {selectField(
            "household_occupation_tier",
            "Household occupation tier",
            [
              "Unemployed",
              "Informal_Daily_Wage",
              "Skilled_Regular",
              "Professional",
            ],
          )}
          {numberField("num_siblings", "Siblings (blank if unknown)", 0, 30)}
          {numberField("birth_order", "Birth order (blank if unknown)", 1, 31)}
        </Stack>
        <div role="status" className="mt-5 text-sm text-slate-500">
          {running
            ? "Updating model prediction…"
            : error
              ? "Prediction needs attention · inputs retained"
              : "Prediction up to date"}
        </div>
        {error && (
          <div
            role="alert"
            className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
          >
            {error}
            <button
              className="ml-3 underline"
              onClick={() => setRetry((previous) => previous + 1)}
            >
              Retry prediction
            </button>
          </div>
        )}
      </section>
      {prediction && <PredictionView prediction={prediction} sandbox />}
    </Stack>
  );
}

export default function MlInsights() {
  const { section, loading } = useTeacher();
  const { user } = useAuth();
  const [tab, setTab] = useState<"student" | "sandbox">("student");
  const tabs = (
    <div
      role="tablist"
      aria-label="ML testing mode"
      className="flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1"
    >
      {(["student", "sandbox"] as const).map((mode) => (
        <button
          key={mode}
          id={`tab-${mode}`}
          role="tab"
          aria-selected={tab === mode}
          aria-controls={`panel-${mode}`}
          onClick={() => setTab(mode)}
          className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${tab === mode ? "bg-white text-brand shadow-xs" : "text-slate-500 hover:bg-brand/5 hover:text-brand"}`}
        >
          {mode === "student" ? "Student Evaluation" : "Sandbox Simulator"}
        </button>
      ))}
    </div>
  );
  return (
    <Stack
      sx={{
        gap: 1.5,
        width: "100%",
        minWidth: 0,
        "& :focus-visible": { outlineColor: "var(--color-brand)" },
      }}
      className="rounded-2xl bg-slate-50 p-2 sm:p-3"
    >
      <header>
        <h1 className="flex items-start gap-3 text-2xl leading-snug font-bold tracking-tight text-slate-900">
          <AutoAwesomeRounded className="mt-1 shrink-0 text-brand" />
          Early Performance ML Insights &amp; Prescription Guides
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Explore PRE profiles, possible Post-Test outcomes, and targeted
          teaching activities.
        </p>
        <Stack
          component="aside"
          direction="row"
          sx={{
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1.5,
          }}
          className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/70 p-2.5 text-xs leading-relaxed text-amber-950"
          aria-label="Research prototype notice"
        >
          <details className="group min-w-0 flex-[1_1_34rem]">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 [&::-webkit-details-marker]:hidden">
              <span className="font-semibold">
                <span aria-hidden="true">⚠️ </span>
                Educational research prototype for instructional planning, not a
                formal clinical diagnosis.
              </span>
              <span className="inline-flex items-center gap-1 font-medium underline decoration-amber-400 underline-offset-2">
                Evaluation Limits{" "}
                <span
                  aria-hidden="true"
                  className="transition-transform group-open:rotate-180"
                >
                  ▾
                </span>
              </span>
            </summary>
            <p className="mt-2">
              The model has no independent real-world validation. Official ECCD
              assessments remain the basis for evaluation. Advanced
              developmental categories are unsupported.
            </p>
            <p className="mt-2 font-medium">Understand the evaluation limits</p>
            <p className="mt-2">
              The evaluation report records 92.81% accuracy on 459 mixed
              real/synthetic holdout records, but only 37.5% accuracy on its
              eight real holdout learners. All 29 real learners had Average
              Post-Test outcomes, and all contributed to synthetic generation
              anchors. Household details are excluded from prediction. The
              synthetic generator uses simulation assumptions rather than causal
              findings. Model probabilities and activity suggestions do not
              demonstrate diagnostic validity or intervention effectiveness.
            </p>
          </details>
          <Stack
            direction="row"
            sx={{ flexWrap: "wrap", alignItems: "center", gap: 1, ml: "auto" }}
          >
            <span className="rounded border border-slate-200 bg-white/80 px-2 py-0.5 font-medium text-slate-600">
              Calibrated model · 18 inputs
            </span>
            <span className="rounded border border-slate-200 bg-white/80 px-2 py-0.5 font-medium text-slate-600">
              3 supported classes
            </span>
            <span className="rounded border border-amber-300 bg-amber-100/80 px-2 py-0.5 font-medium text-amber-800">
              Research prototype
            </span>
          </Stack>
        </Stack>
      </header>
      {section ? (
        <StudentEvaluation
          key={`${user?.id}_${section.section_id}`}
          sectionId={section.section_id}
          tabs={tabs}
          active={tab === "student"}
        />
      ) : (
        <Stack sx={{ gap: 1.5 }}>
          {tabs}
          <div
            role="tabpanel"
            id="panel-student"
            aria-labelledby="tab-student"
            hidden={tab !== "student"}
          >
            <p className={`${card} text-sm text-slate-500`}>
              {loading
                ? "Loading your assigned section…"
                : "An active section assignment is required to select a learner."}
            </p>
          </div>
        </Stack>
      )}
      <div
        role="tabpanel"
        id="panel-sandbox"
        aria-labelledby="tab-sandbox"
        hidden={tab !== "sandbox"}
      >
        {tab === "sandbox" && <SandboxSimulator key={user?.id} />}
      </div>
    </Stack>
  );
}
