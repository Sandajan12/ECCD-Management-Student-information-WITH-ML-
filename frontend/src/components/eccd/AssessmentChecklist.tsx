import { useState } from "react";
import { errorMessage } from "../../services/api";
import { useDurableForm } from "../../utils/drafts";
import type { Answer, Assessment, Domain, Period, Question } from "../../types";
import { PERIOD_LABELS, PERIODS } from "../../types";
import { Button, Empty, Field, Notice } from "../ui";

function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function PeriodTabs({
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
export function Checklist({
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
