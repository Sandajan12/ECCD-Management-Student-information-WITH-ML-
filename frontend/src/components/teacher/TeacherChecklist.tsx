import { useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { readDraft, useDurableForm } from "../../utils/drafts";
import { calculateDecimalAge } from "../../utils/dateUtils";
import { errorMessage } from "../../services/api";
import type { Answer, Assessment, Domain, Period } from "../../types";
import { PERIOD_LABELS, PERIODS } from "../../types";
import { Button, Empty, Field, Notice, Select } from "../ui";

interface ChecklistValues {
  answers: Record<string, Answer>;
  evaluation_date: string;
}
interface TeacherChecklistProps {
  data: Assessment;
  domain: Domain;
  onSaved: () => void;
  onBusy: (busy: boolean) => void;
}
function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function offsetDate(date: string, days: number): string {
  const value = new Date(`${date.slice(0, 10)}T12:00:00`);
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
export default function TeacherChecklist({
  data,
  domain,
  onSaved,
  onBusy,
}: TeacherChecklistProps) {
  const { user } = useAuth();
  const periodKey = `ames_teacher_period_${user?.id}_${data.student_id}_${domain.domain_id}`;
  const [period, setPeriod] = useState<Period>(() => {
    const stored = localStorage.getItem(periodKey);
    return PERIODS.find((p) => p === stored) || "PRE";
  });
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const lock = useRef<boolean>(false);
  const initial = (p: Period): ChecklistValues => {
    const answers: Record<string, Answer> = {};
    const saved = domain.questions.some((q) => q.answers?.[p]);
    for (const q of domain.questions) {
      if (q.answers?.[p]) answers[q.question_id] = q.answers[p]!;
      else if (!saved) {
        for (const earlier of PERIODS.slice(0, PERIODS.indexOf(p))) {
          const draft = readDraft<ChecklistValues>(
            `eccd_draft_${data.student_id}_${earlier}_${domain.domain_id}_${user?.id}`,
          );
          if (
            (draft?.values.answers[q.question_id] || q.answers?.[earlier]) ===
            "KAYA"
          )
            answers[q.question_id] = "KAYA";
        }
      }
    }
    return {
      answers,
      evaluation_date: data.periodDates[p]?.slice(0, 10) || localDate(),
    };
  };
  // Keep the established owner/student/period/domain keys and HTTP-confirmed
  // revision eviction. All three forms stay mounted when changing periods.
  const pre = useDurableForm(
    `eccd_${data.student_id}_PRE_${domain.domain_id}`,
    initial("PRE"),
  );
  const mid = useDurableForm(
    `eccd_${data.student_id}_MID_${domain.domain_id}`,
    initial("MID"),
  );
  const post = useDurableForm(
    `eccd_${data.student_id}_POST_${domain.domain_id}`,
    initial("POST"),
  );
  const forms = { PRE: pre, MID: mid, POST: post };
  const active = forms[period];
  const answered = domain.questions.filter(
    (q) => active.values.answers[q.question_id],
  ).length;
  const kaya = domain.questions.filter(
    (q) => active.values.answers[q.question_id] === "KAYA",
  ).length;
  const savedDomain = domain.questions.some((q) => q.answers?.[period]);
  const dirty = !!readDraft<ChecklistValues>(active.key);
  const previousDates = PERIODS.slice(0, PERIODS.indexOf(period))
    .map((p) => data.periodDates[p])
    .filter((v): v is string => !!v)
    .sort();
  const laterDates = PERIODS.slice(PERIODS.indexOf(period) + 1)
    .map((p) => data.periodDates[p])
    .filter((v): v is string => !!v)
    .sort();
  const minimum = [
    data.student_birth_date?.slice(0, 10),
    previousDates.length ? offsetDate(previousDates.at(-1)!, 1) : undefined,
  ]
    .filter((v): v is string => !!v)
    .sort()
    .at(-1);
  const maximum = laterDates.length ? offsetDate(laterDates[0], -1) : undefined;
  const date = active.values.evaluation_date;
  const dateError = !date
    ? "Select an assessment date."
    : (minimum && date < minimum) || (maximum && date > maximum)
      ? "Assessment dates must follow Pre-Test < Mid-Test < Post-Test and be on or after the birth date."
      : "";
  const age = data.student_birth_date
    ? calculateDecimalAge(data.student_birth_date, date)
    : "";
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (lock.current || dateError || !answered) return;
        lock.current = true;
        setBusy(true);
        onBusy(true);
        setError("");
        setMessage("");
        try {
          const result = await active.save("/api/eccd/evaluate", "post", {
            student_id: data.student_id,
            testing_period: period,
            assessment_date: date,
            evaluations: domain.questions
              .filter((q) => active.values.answers[q.question_id])
              .map((q) => ({
                question_id: q.question_id,
                testing_period: period,
                answer: active.values.answers[q.question_id],
              })),
          });
          setMessage(
            result === "saved"
              ? "Assessment saved successfully."
              : "Saved on this device and queued for reconnection.",
          );
          if (result === "saved") onSaved();
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          lock.current = false;
          setBusy(false);
          onBusy(false);
        }
      }}
    >
      <div className="card flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">{domain.domain_name}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {domain.questions.length} Indicators Checklist
          </p>
          <span
            className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${dirty ? "bg-amber-50 text-amber-700" : savedDomain ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
          >
            {dirty
              ? "Unsaved Draft"
              : savedDomain
                ? "Saved"
                : answered
                  ? "Pre-filled Draft"
                  : "Not Started"}
          </span>
        </div>
        <Select
          label="Testing Period"
          value={period}
          disabled={busy}
          onChange={(e) => {
            setPeriod(e.target.value as Period);
            localStorage.setItem(periodKey, e.target.value);
            setError("");
            setMessage("");
          }}
        >
          {PERIODS.map((p) => (
            <option key={p} value={p}>
              {PERIOD_LABELS[p]}
              {p === "PRE" ? " (BoY)" : p === "POST" ? " (EoY)" : ""}
            </option>
          ))}
        </Select>
        <Field
          label="Assessment Date"
          type="date"
          required
          min={minimum}
          max={maximum}
          disabled={busy}
          value={date}
          onChange={(e) =>
            active.change({ ...active.values, evaluation_date: e.target.value })
          }
        />
        {age !== "" && (
          <span className="badge">Decimal Age: {age.toFixed(1)}</span>
        )}
      </div>
      <Notice tone="error">{error || dateError}</Notice>
      <Notice tone="success">{message}</Notice>
      {!domain.questions.length ? (
        <Empty>No developmental indicators found in this domain.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="w-full">
            <thead>
              <tr>
                <th className="w-2/5">Question / Indicator</th>
                {PERIODS.map((p) => (
                  <th
                    key={p}
                    className={`text-center ${p === period ? "text-blue-700" : ""}`}
                  >
                    {PERIOD_LABELS[p]}
                    <span className="mt-1 block text-[10px] font-normal normal-case">
                      {data.periodDates[p]?.slice(0, 10) || "Not yet evaluated"}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {domain.questions.map((q) => (
                <tr key={q.question_id}>
                  <td className="min-w-56 leading-6">
                    <span className="mr-2 text-xs text-slate-400">
                      {q.sequence_order}.
                    </span>
                    {q.question_text}
                  </td>
                  {PERIODS.map((p) => (
                    <td
                      key={p}
                      className={`min-w-36 ${p === period ? "bg-blue-50/30" : ""}`}
                    >
                      <div className="flex flex-col gap-2">
                        {(["KAYA", "DI-KAYA"] as Answer[]).map((answer) => (
                          <label
                            key={answer}
                            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${forms[p].values.answers[q.question_id] === answer ? (answer === "KAYA" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600") : "text-slate-400"}`}
                          >
                            <input
                              type="radio"
                              name={`answer_${data.student_id}_${q.question_id}_${p}`}
                              checked={
                                forms[p].values.answers[q.question_id] ===
                                answer
                              }
                              disabled={p !== period || busy}
                              onChange={() => {
                                active.change({
                                  ...active.values,
                                  answers: {
                                    ...active.values.answers,
                                    [q.question_id]: answer,
                                  },
                                });
                                if (answer === "KAYA")
                                  for (const later of PERIODS.slice(
                                    PERIODS.indexOf(p) + 1,
                                  )) {
                                    // Never overwrite a saved later period or a queued request.
                                    if (
                                      !domain.questions.some(
                                        (question) => question.answers?.[later],
                                      ) &&
                                      !readDraft<ChecklistValues>(
                                        forms[later].key,
                                      )?.is_pending_sync
                                    )
                                      forms[later].change({
                                        ...forms[later].values,
                                        answers: {
                                          ...forms[later].values.answers,
                                          [q.question_id]: "KAYA",
                                        },
                                      });
                                  }
                              }}
                            />
                            {answer}
                          </label>
                        ))}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="card grid gap-3 text-sm legacy-sm:grid-cols-3">
        <div>
          <p className="text-xs text-slate-500">Answered</p>
          <strong>
            {answered} / {domain.questions.length}
          </strong>
        </div>
        <div>
          <p className="text-xs text-slate-500">KAYA</p>
          <strong className="text-emerald-600">{kaya}</strong>
        </div>
        <div>
          <p className="text-xs text-slate-500">DI-KAYA</p>
          <strong className="text-rose-600">{answered - kaya}</strong>
        </div>
      </div>
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/95 p-4 shadow-lg backdrop-blur-sm">
        <div>
          <p className="text-sm font-semibold">
            Evaluating {PERIOD_LABELS[period]}: {answered} /{" "}
            {domain.questions.length} Answered
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Drafts stay on this device until the server confirms your save.
          </p>
        </div>
        <Button
          type="submit"
          className="bg-emerald-600"
          disabled={busy || !!dateError || !answered}
        >
          {busy ? "Saving…" : "Save Assessment"}
        </Button>
      </div>
    </form>
  );
}
