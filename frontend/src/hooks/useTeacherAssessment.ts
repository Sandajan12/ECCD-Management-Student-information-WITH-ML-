import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useAssessment } from "./useAssessment";
import API, { errorMessage, isNetworkError } from "../services/api";
import { isAxiosError } from "axios";
import {
  confirmDraft,
  isTeacherEccdDraft,
  listPending,
  readDraft,
  storeDraft,
  syncDrafts,
} from "../utils/drafts";
import type { Draft } from "../utils/drafts";
import { calculateDecimalAge } from "../utils/dateUtils";
import {
  resolveTeacherDrafts,
  teacherDomainProgress,
} from "../utils/eccdDrafts";
import type { TeacherAssessmentDraft as AssessmentDraft } from "../utils/eccdDrafts";
import { PERIODS } from "../types";
import type { Answer, Domain, Period } from "../types";

interface AssessmentPayload {
  edited_question_ids: number[];
  student_id: number;
  testing_period: Period;
  assessment_date: string;
  evaluations: {
    question_id: number;
    testing_period: Period;
    answer: Answer;
  }[];
}
export interface AssessmentFeedback {
  open: boolean;
  message: string;
  severity: "success" | "info" | "warning" | "error";
}
export function localToday(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Keep teacher-only virtual carry-over out of the shared parent checklist.
export function useTeacherAssessment(
  studentId: number,
  domain: Domain | null,
  period: Period,
  onSaved: () => void,
  canSave: boolean,
  onConflict: (period: Period) => Promise<void>,
) {
  const { user } = useAuth();
  const owner = user?.id || 0;
  const {
    data,
    error: loadError,
    loading,
    refresh,
  } = useAssessment(studentId, false);
  const [, rerender] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingDraftsCount, setPendingDraftsCount] = useState(0);
  const [snackbar, setSnackbar] = useState<AssessmentFeedback>({
    open: false,
    message: "",
    severity: "info",
  });
  const submissionLock = useRef(false);
  const syncLock = useRef(false);
  const keyFor = (p: Period) =>
    `eccd_draft_${studentId}_${p}_${domain?.domain_id}_${owner}`;
  const questions =
    data?.domains.find((d) => d.domain_id === domain?.domain_id)?.questions ||
    domain?.questions ||
    [];
  const drafts: Partial<Record<Period, AssessmentDraft>> = {};
  for (const p of PERIODS) {
    const draft = readDraft<AssessmentDraft>(keyFor(p));
    if (draft?.owner_id === owner) drafts[p] = draft.values;
  }
  const preKayaQuestionIds = data?.pre_kaya_question_ids || [];
  const isCarryLocked = (questionId: number, p: string): boolean => {
    const question = questions.find((q) => q.question_id === questionId);
    return question?.carry_forward
      ? question.carry_forward[p as Period] === "locked"
      : p !== "PRE" && preKayaQuestionIds.includes(questionId);
  };
  const resolved = resolveTeacherDrafts(questions, drafts, preKayaQuestionIds);
  const dates: Record<Period, string> = {
    PRE: localToday(),
    MID: localToday(),
    POST: localToday(),
  };
  for (const p of PERIODS) {
    if (Object.keys(resolved[p].savedAnswers).length)
      dates[p] = data?.periodDates[p] || localToday();
    if (drafts[p]) dates[p] = drafts[p].evaluation_date;
  }
  const assessmentDate = dates[period];
  const gradingDates = data?.gradingDates;
  const evalAges = { ...data?.evalAges };
  if (domain) {
    evalAges[domain.domain_id] = {
      PRE: null,
      MID: null,
      POST: null,
      ...data?.evalAges[domain.domain_id],
    };
    for (const p of PERIODS) {
      // Grading dates include the server's safe parent-only preview fallback.
      // An unsaved date picker value must not replace that resolved date.
      const gradingDate = gradingDates?.[p];
      if (data?.student_birth_date && gradingDate) {
        const age = calculateDecimalAge(data.student_birth_date, gradingDate);
        evalAges[domain.domain_id][p] = age === "" || age < 0 ? null : age;
      } else if (gradingDates) evalAges[domain.domain_id][p] = null;
    }
  }
  const periodProgress = Object.fromEntries(
    PERIODS.map((p) => [
      p,
      teacherDomainProgress(
        questions,
        resolved[p],
        Boolean(
          drafts[p] &&
          drafts[p].evaluation_date !== (data?.periodDates[p] || localToday()),
        ),
      ),
    ]),
  ) as Record<Period, ReturnType<typeof teacherDomainProgress>>;
  const persist = (p: Period, next: AssessmentDraft) => {
    const key = keyFor(p);
    // Editing a queued record cancels its old submission intent, retaining inputs.
    storeDraft(key, {
      owner_id: owner,
      values: next,
      revision: crypto.randomUUID(),
      is_pending_sync: false,
    });
    rerender((v) => v + 1);
  };
  const handleAnswerChange = (
    questionId: number,
    p: string,
    answer: Answer,
  ) => {
    if (p !== period || !data || loading || !domain) return;
    if (
      !questions.some((q) => q.question_id === questionId) ||
      isCarryLocked(questionId, p)
    )
      return;
    // Read the latest revision so rapid edits cannot replace another selection.
    const draft = readDraft<AssessmentDraft>(keyFor(period));
    const previous = draft?.owner_id === owner ? draft.values : undefined;
    persist(period, {
      original_answers: {
        ...previous?.original_answers,
        [questionId]:
          questions.find((q) => q.question_id === questionId)?.answers[
            period
          ] || null,
      },
      answers: {
        ...(draft?.owner_id === owner ? draft.values.answers : {}),
        [questionId]: answer,
      },
      evaluation_date: assessmentDate,
    });
  };
  const handleDateChange = (date: string) => {
    if (!data || loading || !domain) return;
    const draft = readDraft<AssessmentDraft>(keyFor(period));
    persist(period, {
      original_answers:
        draft?.owner_id === owner ? draft.values.original_answers : undefined,
      answers: draft?.owner_id === owner ? draft.values.answers : {},
      evaluation_date: date,
    });
  };
  const validateDate = (): string => {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(assessmentDate) ||
      Number.isNaN(Date.parse(assessmentDate))
    )
      return "Select a valid assessment date.";
    if (data?.student_birth_date && assessmentDate < data.student_birth_date)
      return "Assessment date cannot be before the student's birth date.";
    for (const p of PERIODS) {
      if (p === period) continue;
      const previousDate = data?.periodDates[p];
      if (
        previousDate &&
        (PERIODS.indexOf(p) < PERIODS.indexOf(period)
          ? assessmentDate <= previousDate
          : assessmentDate >= previousDate)
      )
        return "Assessment dates must follow PRE < MID < POST.";
    }
    return "";
  };
  const getDateBounds = (p: Period): { min?: string; max?: string } => {
    const shift = (date: string, days: number) => {
      const value = new Date(date + "T12:00:00");
      value.setDate(value.getDate() + days);
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    };
    const earlier = PERIODS.slice(0, PERIODS.indexOf(p)).flatMap((previous) =>
      data?.periodDates[previous]
        ? [shift(data.periodDates[previous]!, 1)]
        : [],
    );
    const later = PERIODS.slice(PERIODS.indexOf(p) + 1).flatMap((next) =>
      data?.periodDates[next] ? [shift(data.periodDates[next]!, -1)] : [],
    );
    const minimum = [
      ...earlier,
      ...(data?.student_birth_date ? [data.student_birth_date] : []),
    ]
      .sort()
      .at(-1);
    return { min: minimum, max: later.sort()[0] };
  };
  const evaluations = Object.fromEntries(
    PERIODS.map((p) => [
      p,
      {
        ...resolved[p],
        date: data?.periodDates[p] || "",
        isSaved: Boolean(
          periodProgress[p].savedCount &&
          !periodProgress[p].draftCount &&
          !periodProgress[p].hasDateChange,
        ),
      },
    ]),
  ) as Record<
    Period,
    (typeof resolved)[Period] & { date: string; isSaved: boolean }
  >;
  const handleSave = async () => {
    if (submissionLock.current || !studentId || !domain || !data || loading)
      return;
    if (!canSave) return;
    const dateError = validateDate();
    const evaluations = questions.flatMap((q) =>
      resolved[period].answers[q.question_id]
        ? [
            {
              question_id: q.question_id,
              testing_period: period,
              answer: resolved[period].answers[q.question_id],
            },
          ]
        : [],
    );
    if (dateError || !evaluations.length) {
      setSnackbar({
        open: true,
        message: dateError || "Answer at least one indicator before saving.",
        severity: "error",
      });
      return;
    }
    const key = keyFor(period);
    const payload: AssessmentPayload = {
      edited_question_ids: questions
        .filter((q) => {
          const original = drafts[period]?.original_answers?.[q.question_id];
          return (
            original != null &&
            original !== resolved[period].answers[q.question_id]
          );
        })
        .map((q) => q.question_id),
      student_id: studentId,
      testing_period: period,
      assessment_date: assessmentDate,
      evaluations,
    };
    const draft: Draft<AssessmentDraft> = {
      owner_id: owner,
      // Explicit Save confirms the displayed answers for this period only.
      values: {
        original_answers: drafts[period]?.original_answers,
        answers: resolved[period].answers,
        evaluation_date: assessmentDate,
      },
      revision: crypto.randomUUID(),
      is_pending_sync: true,
      request: { path: "/api/eccd/evaluate", method: "post", data: payload },
    };
    submissionLock.current = true;
    setSaving(true);
    storeDraft(key, draft);
    try {
      if (!navigator.onLine) {
        setSnackbar({
          open: true,
          message:
            "Saved locally on device. Will automatically sync once reconnected.",
          severity: "info",
        });
        return;
      }
      const response = await API.post("/api/eccd/evaluate", payload);
      if (response.status !== 200 && response.status !== 201)
        throw new Error("The server did not confirm this save.");
      // Refresh first so confirmed answers do not disappear while fetching.
      await refresh();
      confirmDraft(key, draft.revision);
      onSaved();
      setSnackbar({
        open: true,
        message: "Assessment Saved Successfully!",
        severity: "success",
      });
    } catch (err) {
      if (isNetworkError(err))
        setSnackbar({
          open: true,
          message:
            "Saved locally on device. Will automatically sync once reconnected.",
          severity: "info",
        });
      else {
        if (readDraft<AssessmentDraft>(key)?.revision === draft.revision)
          storeDraft(key, {
            ...draft,
            is_pending_sync: false,
            error: errorMessage(err),
          });
        setSnackbar({
          open: true,
          message: errorMessage(err),
          severity: "error",
        });
        if (isAxiosError(err) && err.response?.status === 409) {
          await refresh();
          await onConflict(period);
        }
      }
    } finally {
      submissionLock.current = false;
      setSaving(false);
    }
  };
  const triggerBackgroundSync = useCallback(async () => {
    if (!owner || syncLock.current || !navigator.onLine) return;
    syncLock.current = true;
    setIsSyncing(true);
    try {
      await syncDrafts(owner);
    } finally {
      syncLock.current = false;
      setIsSyncing(false);
    }
  }, [owner]);
  useEffect(() => {
    const update = () => {
      setPendingDraftsCount(
        listPending(owner).filter(({ key, draft }) =>
          isTeacherEccdDraft(key, draft),
        ).length,
      );
      rerender((v) => v + 1);
    };
    const online = () => {
      setIsOnline(true);
      void triggerBackgroundSync();
    };
    const offline = () => {
      setIsOnline(false);
      setSnackbar({
        open: true,
        message:
          "You are currently offline. Evaluations will be saved locally on this device.",
        severity: "warning",
      });
    };
    const synced = (event: Event) => {
      if ((event as CustomEvent<string>).detail?.startsWith("eccd_draft_")) {
        setSnackbar({
          open: true,
          message:
            "Connection restored. Offline assessment synced successfully.",
          severity: "success",
        });
      }
    };
    update();
    void triggerBackgroundSync();
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("storage", update);
    window.addEventListener("ames-drafts-changed", update);
    window.addEventListener("ames-record-synced", synced);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("storage", update);
      window.removeEventListener("ames-drafts-changed", update);
      window.removeEventListener("ames-record-synced", synced);
    };
  }, [owner, triggerBackgroundSync]);
  return {
    assessment: data,
    assessmentDate,
    gradingDates,
    questions,
    periodProgress,
    evalAges,
    evaluations,
    dateError: studentId && !loading ? validateDate() : "",
    getDateBounds,
    evalLoading: loading,
    saving,
    isOnline,
    isSyncing,
    pendingDraftsCount,
    error: error || loadError,
    setError,
    snackbar,
    setSnackbar,
    handleAnswerChange,
    handleDateChange,
    handleSave,
    triggerBackgroundSync,
    isCarryLocked,
    getAnswer: (id: number, p: string) =>
      resolved[p as Period]?.answers[id] || null,
  };
}
