import { useEffect, useState } from "react";
import { Stack } from "@mui/material";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import SchoolOutlined from "@mui/icons-material/SchoolOutlined";
import HomeOutlined from "@mui/icons-material/HomeOutlined";
import API, { errorMessage, isNetworkError } from "../../services/api";
import { useTeacher } from "../../context/TeacherContext";
import { useAuth } from "../../context/AuthContext";
import { readDraft, storeDraft, useDurableForm } from "../../utils/drafts";

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
interface Prediction {
  student_id: number | null;
  student_name: string | null;
  assessment_date: string | null;
  predicted_post_interpretation: string;
  confidence_percentage: number;
  confidence_percentages: Record<string, number>;
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
type SandboxValues = { [K in keyof MLFeatures]: string };
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
}
const domains: DomainInput[] = [
  { key: "gm_pre_scaled", name: "Gross Motor" },
  { key: "fm_pre_scaled", name: "Fine Motor" },
  { key: "sh_pre_scaled", name: "Self-Help" },
  { key: "rl_pre_scaled", name: "Receptive Language" },
  { key: "el_pre_scaled", name: "Expressive Language" },
  { key: "cog_pre_scaled", name: "Cognitive" },
  { key: "se_pre_scaled", name: "Socio-Emotional" },
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
const card = "min-w-0 rounded-2xl bg-white p-5 shadow-sm sm:p-6";
const input =
  "w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
const initialSandbox: SandboxValues = {
  pre_standard_score: "80",
  pre_total_scaled: "49",
  pre_delayed_domains_count: "0",
  gm_pre_scaled: "7",
  fm_pre_scaled: "7",
  sh_pre_scaled: "7",
  rl_pre_scaled: "7",
  el_pre_scaled: "7",
  cog_pre_scaled: "7",
  se_pre_scaled: "7",
  age_months_pre: "66",
  gender: "",
  handedness: "",
  father_education_level: "",
  household_occupation_tier: "",
  mother_education_level: "",
  num_siblings: "",
  birth_order: "",
};
const numericFields: (keyof MLFeatures)[] = [
  ...domains.map((d) => d.key),
  "pre_standard_score",
  "pre_total_scaled",
  "pre_delayed_domains_count",
  "age_months_pre",
  "num_siblings",
  "birth_order",
];
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
          These are model probabilities, not calibrated clinical confidence or a
          guarantee of future performance.
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
                {(prediction.confidence_percentages[item.label] || 0).toFixed(
                  1,
                )}
                %
              </strong>
            </p>
          ))}
        </Stack>
        {prediction.imputed_fields.length > 0 && (
          <p className="mt-5 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            Training median/mode used for missing inputs:{" "}
            {prediction.imputed_fields
              .map((field) => field.replaceAll("_", " "))
              .join(", ")}
            . These estimates do not describe the learner’s actual family
            circumstances. Free-text occupations have no reviewed tier mapping.
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
        <p className="mb-4 text-sm text-slate-500">
          PRE scaled scores · local planning tiers: ≤3 Delay, 4–6 Slight Delay,
          ≥7 Average.
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
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-800">
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
                  className="text-sm font-medium text-blue-700 underline"
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

function StudentEvaluation({ sectionId }: { sectionId: number }) {
  const [students, setStudents] = useState<StudentOption[]>([]);
  const { values, change } = useDurableForm(`ml_selection_${sectionId}`, {
    studentId: "",
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [running, setRunning] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [refresh, setRefresh] = useState<number>(0);
  const selected = students.find(
    (student) => String(student.student_id) === values.studentId,
  );
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
    if (!running || !selected) return;
    const controller = new AbortController();
    void API.post<Prediction>(
      `/api/ml/predict/student/${selected.student_id}`,
      undefined,
      { signal: controller.signal },
    )
      .then(({ data }) => {
        if (!controller.signal.aborted) {
          setPrediction(data);
          setError("");
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setRunning(false);
      });
    return () => controller.abort();
  }, [running, selected]);
  useEffect(() => {
    const retry = () => setRefresh((value) => value + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);
  return (
    <Stack sx={{ gap: 3 }}>
      <section className={card}>
        <h2 className="mb-4 text-lg font-semibold text-slate-800">
          Student evaluation
        </h2>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          sx={{ gap: 2, alignItems: { sm: "end" } }}
        >
          <label className="min-w-0 flex-1 text-sm font-medium text-slate-600">
            Learner in your active section
            <select
              className={`${input} mt-2`}
              value={values.studentId}
              disabled={loading}
              onChange={(event) => {
                change({ studentId: event.target.value });
                setPrediction(null);
                setError("");
                setRunning(false);
              }}
            >
              <option value="">
                {loading ? "Loading learners…" : "Choose a learner"}
              </option>
              {students.map((student) => (
                <option key={student.student_id} value={student.student_id}>
                  {student.student_name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!selected?.pre_complete || running || loading}
            onClick={() => {
              setPrediction(null);
              setError("");
              setRunning(true);
            }}
          >
            <PlayArrowRounded fontSize="small" />
            {running ? "Running prediction…" : "Run Prediction"}
          </button>
        </Stack>
        {selected && (
          <p
            className={`mt-4 rounded-xl px-3 py-2 text-sm ${selected.pre_complete ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
          >
            {selected.pre_complete ? "PRE complete · " : "PRE unavailable · "}
            {selected.readiness_note}
          </p>
        )}
        {!loading && !error && students.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">
            No active learners in this section yet.
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800"
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
      {prediction && <PredictionView prediction={prediction} />}
      {!prediction && !running && (
        <p className="p-6 text-center text-sm text-slate-500">
          Choose a learner with a completed PRE assessment to explore the
          baseline and support activities.
        </p>
      )}
    </Stack>
  );
}

function SandboxSimulator() {
  const { values, change, key } = useDurableForm<SandboxValues>(
    "ml_sandbox_v1",
    initialSandbox,
  );
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [error, setError] = useState<string>("");
  const [running, setRunning] = useState<boolean>(false);
  const [retry, setRetry] = useState<number>(0);
  const update = (field: keyof MLFeatures, value: string) => {
    const next = { ...values, [field]: value };
    if (domains.some((domain) => domain.key === field)) {
      next.pre_total_scaled = String(
        domains.reduce((sum, domain) => sum + Number(next[domain.key]), 0),
      );
      next.pre_delayed_domains_count = String(
        domains.filter((domain) => Number(next[domain.key]) <= 6).length,
      );
    }
    change(next);
  };
  useEffect(() => {
    const online = () => setRetry((previous) => previous + 1);
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setPrediction(null);
    setError("");
    setRunning(true);
    const timer = window.setTimeout(() => {
      const draft = readDraft<SandboxValues>(key);
      const markPending = (pending: boolean) => {
        const current = readDraft<SandboxValues>(key);
        if (draft && current?.revision === draft.revision)
          storeDraft(key, { ...current, is_pending_sync: pending });
      };
      if (!navigator.onLine) {
        markPending(true);
        setError(
          "You’re offline. Your inputs are kept on this device and will be tested when you reconnect.",
        );
        setRunning(false);
        return;
      }
      const requiredNumeric = numericFields.filter(
        (field) => field !== "num_siblings" && field !== "birth_order",
      );
      if (requiredNumeric.some((field) => values[field].trim() === "")) {
        setError(
          "Enter all baseline scores and the PRE age to run the simulation.",
        );
        setRunning(false);
        return;
      }
      const payload = Object.fromEntries(
        Object.entries(values).map(([field, value]) => [
          field,
          value === ""
            ? null
            : numericFields.includes(field as keyof MLFeatures)
              ? Number(value)
              : value,
        ]),
      );
      void API.post<Prediction>("/api/ml/predict/sandbox", payload, {
        signal: controller.signal,
      })
        .then(({ data }) => {
          if (!controller.signal.aborted) {
            setPrediction(data);
            markPending(false);
          }
        })
        .catch((err: unknown) => {
          if (!controller.signal.aborted) {
            markPending(isNetworkError(err));
            setError(errorMessage(err));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setRunning(false);
        });
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [values, key, retry]);
  const numberField = (
    field: keyof MLFeatures,
    label: string,
    min: number,
    max: number,
    readOnly = false,
  ) => (
    <label key={field} className="text-sm font-medium text-slate-600">
      {label}
      <input
        className={`${input} mt-2 ${readOnly ? "bg-slate-50" : ""}`}
        type="number"
        min={min}
        max={max}
        step={1}
        value={values[field]}
        readOnly={readOnly}
        onChange={(event) => update(field, event.target.value)}
      />
    </label>
  );
  const selectField = (
    field: keyof MLFeatures,
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
        <option value="">Missing · use training imputer</option>
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
          Total scaled score and delayed-domain count follow the seven domains;
          set the standard score separately. Inconsistent hypothetical standard
          scores may produce unrealistic profiles. Sandbox inputs stay on this
          device across reloads.
        </p>
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
          {domains.map((domain) =>
            numberField(domain.key, `${domain.name} scaled score`, 0, 19),
          )}
          {numberField("pre_standard_score", "PRE standard score", 0, 200)}
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
          {numberField(
            "age_months_pre",
            "Age at PRE (completed months)",
            1,
            216,
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
  return (
    <Stack sx={{ gap: 3, width: "100%", minWidth: 0 }}>
      <header>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
            Random Forest · 18 inputs
          </span>
          <span className="rounded-full bg-violet-50 px-3 py-1 text-violet-700">
            3 supported classes
          </span>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">
            Research prototype
          </span>
        </div>
        <h1 className="flex items-start gap-3 text-2xl leading-snug font-semibold tracking-tight text-slate-800">
          <AutoAwesomeRounded className="mt-1 shrink-0 text-blue-600" />
          Early Performance Analytics &amp; ML Insights
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Explore PRE profiles, possible Post-Test outcomes, and targeted
          teaching activities.
        </p>
      </header>
      <aside
        className="rounded-2xl bg-amber-50 p-5 text-sm leading-relaxed text-amber-950"
        aria-label="Research prototype notice"
      >
        <p className="flex items-start gap-2 font-semibold">
          <ScienceOutlined fontSize="small" />
          Educational research prototype for instructional planning, not a
          formal clinical diagnosis.
        </p>
        <p className="mt-2">
          The model has no independent real-world validation. Official ECCD
          assessments remain the basis for evaluation. Advanced developmental
          categories are unsupported.
        </p>
        <details className="mt-3">
          <summary className="cursor-pointer font-medium">
            Understand the evaluation limits
          </summary>
          <p className="mt-2">
            The evaluation report records 88.9% accuracy on 459 mixed
            real/synthetic holdout records, but only 25% accuracy on its eight
            real holdout learners. All 29 real learners had Average Post-Test
            outcomes, and all contributed to synthetic generation anchors.
            Household effects reflect simulation assumptions; they are not
            causal findings. Model probabilities and activity suggestions do not
            demonstrate diagnostic validity or intervention effectiveness.
          </p>
        </details>
      </aside>
      <div
        role="tablist"
        aria-label="ML testing mode"
        className="flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-1.5"
      >
        {(["student", "sandbox"] as const).map((mode) => (
          <button
            key={mode}
            id={`tab-${mode}`}
            role="tab"
            aria-selected={tab === mode}
            aria-controls={`panel-${mode}`}
            onClick={() => setTab(mode)}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${tab === mode ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:bg-white/50"}`}
          >
            {mode === "student" ? "Student Evaluation" : "Sandbox Simulator"}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="panel-student"
        aria-labelledby="tab-student"
        hidden={tab !== "student"}
      >
        {section ? (
          <StudentEvaluation
            key={`${user?.id}_${section.section_id}`}
            sectionId={section.section_id}
          />
        ) : (
          <p className={`${card} text-sm text-slate-500`}>
            {loading
              ? "Loading your assigned section…"
              : "An active section assignment is required to select a learner."}
          </p>
        )}
      </div>
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
