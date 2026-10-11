import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import API, {
  downloadFile,
  errorMessage,
  isNetworkError,
} from "../services/api";
import { useDurableForm } from "../utils/drafts";
import type {
  Answer,
  Assessment,
  Domain,
  DomainProgress,
  Period,
  Question,
  Student,
} from "../types";
import { PERIOD_LABELS, PERIODS, studentName } from "../types";
import { ChildSelector, useChildren } from "./ChildrenWorkspace";
import {
  Button,
  Empty,
  Field,
  Loading,
  Notice,
  PageHeader,
  Progress,
  Select,
} from "../components/ui";
function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function PeriodTabs({
  period,
  select,
}: {
  period: Period;
  select: (value: Period) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Testing period"
      className="flex flex-wrap gap-2 rounded-xl bg-slate-100 p-1.5"
    >
      {PERIODS.map((p) => (
        <Button
          key={p}
          variant={period === p ? "primary" : "secondary"}
          aria-pressed={period === p}
          onClick={() => select(p)}
        >
          {PERIOD_LABELS[p]}
        </Button>
      ))}
    </div>
  );
}
function Checklist({
  data,
  domain,
  period,
  parent = false,
  onSaved,
}: {
  data: Assessment;
  domain: Domain;
  period: Period;
  parent?: boolean;
  onSaved: () => void;
}) {
  const questions = parent
    ? (data.homeBasedChecklist || []).filter(
        (q) => q.domain_id === domain.domain_id,
      )
    : domain.questions;
  const initialAnswers: Record<string, Answer> = {};
  for (const q of questions) {
    if (q.answers?.[period]) initialAnswers[q.question_id] = q.answers[period]!;
  }
  const { values, change, save } = useDurableForm(
    `eccd_${data.student_id}_${period}_${domain.domain_id}${parent ? "_home" : ""}`,
    {
      answers: initialAnswers,
      evaluation_date: data.periodDates[period] || today(),
    },
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const canEdit = !parent || data.can_edit_home_based === true;
  const setAnswer = (q: Question, answer: Answer) =>
    change({
      ...values,
      answers: { ...values.answers, [q.question_id]: answer },
    });
  const answered = questions.filter(
    (q) => values.answers[q.question_id],
  ).length;
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canEdit || busy) return;
        setBusy(true);
        setError("");
        setMessage("");
        const evaluations = questions
          .filter((q) => values.answers[q.question_id])
          .map((q) => ({
            question_id: q.question_id,
            testing_period: period,
            answer: values.answers[q.question_id],
          }));
        try {
          const result = await save(
            parent ? "/api/eccd/parent/evaluate" : "/api/eccd/evaluate",
            "post",
            {
              student_id: data.student_id,
              evaluations,
              ...(!parent && {
                testing_period: period,
                assessment_date: values.evaluation_date,
              }),
            },
          );
          setMessage(
            result === "saved"
              ? "Assessment saved successfully."
              : "Saved on this device and queued for reconnection.",
          );
          if (result === "saved") onSaved();
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">{domain.domain_name}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {answered} of {questions.length} items answered •{" "}
            {PERIOD_LABELS[period]}
          </p>
        </div>
        {!parent && (
          <Field
            label="Assessment date"
            type="date"
            required
            min={data.student_birth_date || undefined}
            value={values.evaluation_date}
            onChange={(e) =>
              change({ ...values, evaluation_date: e.target.value })
            }
          />
        )}
      </div>
      <Notice tone="error">{error}</Notice>
      <Notice tone="success">{message}</Notice>
      {parent && !canEdit && (
        <Notice>
          Your adviser has locked home-based assessments. These items are
          read-only.
        </Notice>
      )}
      {!questions.length ? (
        <Empty>
          No home-based questions have been assigned in this domain.
        </Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th>Checklist question</th>
                {PERIODS.map((p) => (
                  <th key={p}>{PERIOD_LABELS[p]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <tr key={q.question_id}>
                  <td className="min-w-48 leading-6">
                    <span className="mr-2 text-xs text-slate-400">
                      {q.sequence_order}.
                    </span>
                    {q.question_text}
                  </td>
                  {PERIODS.map((p) => (
                    <td key={p} className="min-w-36">
                      {p === period ? (
                        <div className="flex flex-col gap-2">
                          {(["KAYA", "DI-KAYA"] as Answer[]).map((answer) => (
                            <label
                              key={answer}
                              className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${values.answers[q.question_id] === answer ? (answer === "KAYA" ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700") : "bg-slate-50 text-slate-500"}`}
                            >
                              <input
                                type="radio"
                                name={`answer_${q.question_id}_${p}`}
                                checked={
                                  values.answers[q.question_id] === answer
                                }
                                disabled={!canEdit || busy}
                                onChange={() => setAnswer(q, answer)}
                              />
                              {answer}
                            </label>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">
                          {parent && !data.summary?.[p]?.is_published
                            ? "Pending release"
                            : q.answers?.[p] || "—"}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Drafts stay on this device until the server confirms your save.
        </p>
        <Button
          type="submit"
          disabled={busy || !canEdit || (parent && answered === 0)}
        >
          {busy ? "Saving…" : "Save assessment"}
        </Button>
      </div>
    </form>
  );
}
function useAssessment(id: number, parent: boolean) {
  const { user } = useAuth();
  const [data, setData] = useState<Assessment | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const requestVersion = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!id) {
      setData(null);
      return;
    }
    setLoading(true);
    const cacheKey = `ames_assessment_cache_${user?.id}_${id}`;
    try {
      const res = await API.get<Assessment>(
        `/api/eccd/${parent ? "parent/" : ""}assessment/${id}`,
      );
      if (version !== requestVersion.current) return;
      setData(res.data);
      if (!parent) localStorage.setItem(cacheKey, JSON.stringify(res.data));
      setError("");
    } catch (err) {
      if (version !== requestVersion.current) return;
      setError(errorMessage(err));
      if (!parent && isNetworkError(err)) {
        try {
          setData(
            JSON.parse(
              localStorage.getItem(cacheKey) || "null",
            ) as Assessment | null,
          );
        } catch {
          setData(null);
        }
      } else setData(null);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [id, parent, user?.id]);
  useEffect(() => {
    setData(null);
    void refresh();
    const synced = () => void refresh();
    window.addEventListener("ames-record-synced", synced);
    return () => {
      ++requestVersion.current;
      window.removeEventListener("ames-record-synced", synced);
    };
  }, [refresh]);
  return {
    data: data?.student_id === id ? data : null,
    error,
    loading,
    refresh,
  };
}
export function TeacherAssessments() {
  const { user } = useAuth();
  const rosterKey = `ames_roster_${user?.id}`;
  const [students, setStudents] = useState<Student[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(rosterKey) || "[]") as Student[];
    } catch {
      return [];
    }
  });
  const [id, setId] = useState(
    Number(localStorage.getItem(`ames_assessment_student_${user?.id}`)) || 0,
  );
  const [period, setPeriod] = useState<Period>("PRE");
  const [domainId, setDomainId] = useState(0);
  const [classProgress, setClassProgress] = useState<DomainProgress[]>([]);
  const [downloadError, setDownloadError] = useState("");
  const [downloadBusy, setDownloadBusy] = useState(false);
  const { data, error, loading, refresh } = useAssessment(id, false);
  useEffect(() => {
    void API.get<Student[]>("/api/eccd/students")
      .then((res) => {
        setStudents(res.data);
        localStorage.setItem(rosterKey, JSON.stringify(res.data));
        setId((current) =>
          res.data.some((s) => s.student_id === current)
            ? current
            : res.data[0]?.student_id || 0,
        );
      })
      .catch((err) => setDownloadError(errorMessage(err)));
    void API.get<DomainProgress[]>("/api/eccd/domains-progress")
      .then((res) => setClassProgress(res.data))
      .catch(() => {});
  }, [rosterKey]);
  const domain =
    data?.domains.find((d) => d.domain_id === domainId) || data?.domains[0];
  const download = async (all = false) => {
    setDownloadBusy(true);
    try {
      await downloadFile(
        all ? "/api/teachers/download-all" : `/api/teachers/download/${id}`,
        all ? "ECCD_Checklists.zip" : "ECCD_Checklist.xlsx",
      );
    } catch (err) {
      setDownloadError(errorMessage(err));
    } finally {
      setDownloadBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        title="ECCD Assessments"
        subtitle="Record developmental milestones across the three testing periods."
        actions={
          <>
            <Button
              variant="secondary"
              disabled={!id || downloadBusy}
              onClick={() => void download()}
            >
              Download checklist
            </Button>
            <Button
              variant="secondary"
              disabled={downloadBusy}
              onClick={() => void download(true)}
            >
              Download all
            </Button>
          </>
        }
      />
      <div className="mb-5 space-y-3">
        <Notice tone="error">{error || downloadError}</Notice>
      </div>
      <div className="card mb-6">
        <div className="grid items-end gap-5 md:grid-cols-2">
          <Select
            label="Select student"
            value={id || ""}
            onChange={(e) => {
              const next = Number(e.target.value);
              localStorage.setItem(
                `ames_assessment_student_${user?.id}`,
                String(next),
              );
              setId(next);
            }}
          >
            {!students.length && (
              <option value="">No students available</option>
            )}
            {students.map((s) => (
              <option key={s.student_id} value={s.student_id}>
                {studentName(s)} • {s.masked_lrn}
              </option>
            ))}
          </Select>
          <PeriodTabs period={period} select={setPeriod} />
        </div>
      </div>
      {loading && !data ? (
        <Loading />
      ) : !data ? (
        <Empty>Add a student to start an assessment.</Empty>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_3fr]">
          <aside className="card space-y-2">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Development domains
            </h2>
            {data.domains.map((d) => (
              <button
                key={d.domain_id}
                className={`w-full rounded-xl p-3 text-left text-sm ${domain?.domain_id === d.domain_id ? "bg-blue-50 font-semibold text-blue-700" : "hover:bg-slate-50"}`}
                onClick={() => setDomainId(d.domain_id)}
              >
                {d.domain_name}
                <span className="mt-2 block">
                  <Progress
                    value={Math.round(
                      (d.questions.filter((q) => !!q.answers?.[period]).length /
                        Math.max(1, d.questions.length)) *
                        100,
                    )}
                  />
                </span>
              </button>
            ))}
          </aside>
          <section className="card">
            {domain && (
              <Checklist
                key={`${id}_${period}_${domain.domain_id}`}
                data={data}
                domain={domain}
                period={period}
                onSaved={() => void refresh()}
              />
            )}
          </section>
        </div>
      )}
      {classProgress.length > 0 && (
        <section className="card mt-6">
          <h2 className="mb-4 font-semibold">Class assessment completion</h2>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {classProgress.map((d) => (
              <div key={d.domain_id}>
                <p className="mb-2 text-sm">{d.domain_name}</p>
                <Progress
                  value={
                    period === "PRE"
                      ? d.pre_progress
                      : period === "MID"
                        ? d.mid_progress
                        : d.post_progress
                  }
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
export function ParentAssessments() {
  const {
    children,
    child,
    selected,
    select,
    error: childError,
    loading: childrenLoading,
  } = useChildren();
  const { data, error, loading, refresh } = useAssessment(selected, true);
  const [tab, setTab] = useState<"official" | "checklist">("official");
  const [period, setPeriod] = useState<Period>("PRE");
  const [domainId, setDomainId] = useState(0);
  const domain =
    data?.domains.find((d) => d.domain_id === domainId) || data?.domains[0];
  return (
    <>
      <PageHeader
        title="ECCD Management"
        subtitle="View official results and complete your child’s home-based checklist."
      />
      <div className="card mb-6">
        <ChildSelector
          children={children}
          selected={selected}
          select={select}
        />
      </div>
      <Notice tone="error">{childError || error}</Notice>
      {childrenLoading || (loading && !data) ? (
        <Loading />
      ) : !child || !data ? (
        <Empty>
          Link a child from Child Information to access their assessments.
        </Empty>
      ) : (
        <>
          <div className="my-6 flex flex-wrap gap-2 rounded-2xl bg-white p-2 shadow-sm">
            <Button
              className="flex-1"
              variant={tab === "official" ? "primary" : "secondary"}
              onClick={() => setTab("official")}
            >
              Official Evaluation Summary
            </Button>
            <Button
              className="flex-1"
              variant={tab === "checklist" ? "primary" : "secondary"}
              onClick={() => setTab("checklist")}
            >
              Home-Based Checklist
            </Button>
          </div>
          {tab === "official" ? (
            <>
              <div className="mb-6 grid gap-5 md:grid-cols-3">
                {PERIODS.map((p) => {
                  const summary = data.summary?.[p];
                  return (
                    <section className="card" key={p}>
                      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                        <h2 className="font-semibold">{PERIOD_LABELS[p]}</h2>
                        <span className="badge">
                          {summary?.is_published
                            ? summary.isEvaluated
                              ? "Evaluated"
                              : "Not evaluated"
                            : "Unreleased"}
                        </span>
                      </div>
                      {!summary?.is_published ? (
                        <Empty>Results Pending Adviser Release</Empty>
                      ) : (
                        <>
                          <p className="text-sm text-slate-500">
                            Standard score
                          </p>
                          <p className="my-3 text-4xl font-bold text-blue-600">
                            {summary.standardScore ?? "—"}
                          </p>
                          <p className="text-sm font-medium">
                            {summary.interpretation ||
                              "Assessment not yet completed"}
                          </p>
                          <dl className="mt-4 space-y-2 text-xs text-slate-500">
                            <div>Date: {summary.assessmentDate || "—"}</div>
                            <div>
                              Age at evaluation: {summary.decimalAge ?? "—"}
                            </div>
                            <div>
                              Sum of scaled scores:{" "}
                              {summary.sumOfScaledScores ?? "—"}
                            </div>
                          </dl>
                        </>
                      )}
                    </section>
                  );
                })}
              </div>
              <section className="card">
                <h2 className="mb-4 font-semibold">Domain score matrix</h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th>Domain</th>
                        {PERIODS.map((p) => (
                          <th key={p}>{PERIOD_LABELS[p]} • Raw / scaled</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.matrix?.map((d) => (
                        <tr key={d.domain_id}>
                          <td>{d.domain_name}</td>
                          {PERIODS.map((p) => (
                            <td key={p}>
                              {data.summary?.[p]?.is_published ? (
                                `${data.summary[p].rawScores?.[d.domain_code] ?? "—"} / ${d.scores[p] ?? "—"}`
                              ) : (
                                <span className="text-xs text-slate-400">
                                  Pending release
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <>
              <div className="card mb-5">
                <div className="grid items-end gap-5 md:grid-cols-2">
                  <Select
                    label="Development domain"
                    value={domain?.domain_id || ""}
                    onChange={(e) => setDomainId(Number(e.target.value))}
                  >
                    {data.domains.map((d) => (
                      <option key={d.domain_id} value={d.domain_id}>
                        {d.domain_name}
                      </option>
                    ))}
                  </Select>
                  <PeriodTabs period={period} select={setPeriod} />
                </div>
              </div>
              <section className="card">
                {domain && (
                  <Checklist
                    key={`${selected}_${period}_${domain.domain_id}_home`}
                    parent
                    data={data}
                    domain={domain}
                    period={period}
                    onSaved={() => void refresh()}
                  />
                )}
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}
