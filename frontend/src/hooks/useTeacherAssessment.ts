import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useAssessment } from "./useAssessment";
import API, { errorMessage, isNetworkError } from "../services/api";
import { confirmDraft, listPending, readDraft, storeDraft, syncDrafts } from "../utils/drafts";
import type { Draft } from "../utils/drafts";
import { calculateDecimalAge } from "../utils/dateUtils";
import { PERIODS } from "../types";
import type { Answer, Domain, Period } from "../types";

interface AssessmentDraft {
  answers: Record<string, Answer>;
  evaluation_date: string;
}
interface AssessmentPayload {
  student_id: number;
  testing_period: Period;
  assessment_date: string;
  evaluations: { question_id: number; testing_period: Period; answer: Answer }[];
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
export function useTeacherAssessment(studentId: number, domain: Domain | null, period: Period, onSaved: () => void) {
  const { user } = useAuth();
  const owner = user?.id || 0;
  const { data, error: loadError, loading, refresh } = useAssessment(studentId, false);
  const [, rerender] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingDraftsCount, setPendingDraftsCount] = useState(0);
  const [snackbar, setSnackbar] = useState<AssessmentFeedback>({ open: false, message: "", severity: "info" });
  const submissionLock = useRef(false);
  const syncLock = useRef(false);
  const keyFor = (p: Period) => `eccd_draft_${studentId}_${p}_${domain?.domain_id}_${owner}`;
  const questions = data?.domains.find(d => d.domain_id === domain?.domain_id)?.questions || domain?.questions || [];
  const answers: Record<Period, Record<string, Answer>> = { PRE: {}, MID: {}, POST: {} };
  const saved: Record<Period, boolean> = { PRE: false, MID: false, POST: false };
  const dates: Record<Period, string> = { PRE: localToday(), MID: localToday(), POST: localToday() };
  for (const p of PERIODS) {
    for (const q of questions) {
      const answer = q.answers?.[p];
      if (answer) {
        answers[p][q.question_id] = answer;
        saved[p] = true;
      }
    }
    if (saved[p]) dates[p] = data?.periodDates[p] || localToday();
    const draft = readDraft<AssessmentDraft>(keyFor(p));
    if (draft?.owner_id === owner) {
      Object.assign(answers[p], draft.values.answers);
      dates[p] = draft.values.evaluation_date;
    }
  }
  // Stored answers and deliberate local edits always win over inherited answers.
  for (const q of questions) {
    if (!saved.MID && !answers.MID[q.question_id] && answers.PRE[q.question_id] === "KAYA") answers.MID[q.question_id] = "KAYA";
    if (!saved.POST && !answers.POST[q.question_id] && (answers.MID[q.question_id] === "KAYA" || answers.PRE[q.question_id] === "KAYA")) answers.POST[q.question_id] = "KAYA";
  }
  const assessmentDate = dates[period];
  const evalAges = { ...data?.evalAges };
  if (domain) {
    evalAges[domain.domain_id] = { PRE: null, MID: null, POST: null, ...data?.evalAges[domain.domain_id] };
    if (data?.student_birth_date && assessmentDate) {
      const age = calculateDecimalAge(data.student_birth_date, assessmentDate);
      evalAges[domain.domain_id][period] = age === "" || age < 0 ? null : age;
    }
  }
  const persist = (p: Period, next: AssessmentDraft) => {
    const key = keyFor(p);
    // Editing a queued record cancels its old submission intent, retaining inputs.
    storeDraft(key, { owner_id: owner, values: next, revision: crypto.randomUUID(), is_pending_sync: false });
    rerender(v => v + 1);
  };
  const handleAnswerChange = (questionId: number, p: string, answer: Answer) => {
    if (p !== period || !data || loading || !domain) return;
    persist(period, { answers: { ...answers[period], [questionId]: answer }, evaluation_date: assessmentDate });
    if (answer === "KAYA") {
      for (const next of PERIODS.slice(PERIODS.indexOf(period) + 1)) {
        if (!saved[next] && !answers[next][questionId])
          persist(next, { answers: { ...answers[next], [questionId]: answer }, evaluation_date: dates[next] });
      }
    }
  };
  const handleDateChange = (date: string) => {
    if (!data || loading || !domain) return;
    persist(period, { answers: answers[period], evaluation_date: date });
  };
  const validateDate = (): string => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(assessmentDate) || Number.isNaN(Date.parse(assessmentDate))) return "Select a valid assessment date.";
    if (data?.student_birth_date && assessmentDate < data.student_birth_date) return "Assessment date cannot be before the student's birth date.";
    for (const p of PERIODS) {
      if (p === period) continue;
      const previousDate = data?.periodDates[p];
      if (previousDate && (PERIODS.indexOf(p) < PERIODS.indexOf(period) ? assessmentDate <= previousDate : assessmentDate >= previousDate))
        return "Assessment dates must follow PRE < MID < POST.";
    }
    return "";
  };
  const handleSave = async () => {
    if (submissionLock.current || !studentId || !domain || !data || loading) return;
    const dateError = validateDate();
    const evaluations = questions.flatMap(q => answers[period][q.question_id] ? [{ question_id: q.question_id, testing_period: period, answer: answers[period][q.question_id] }] : []);
    if (dateError || !evaluations.length) {
      setSnackbar({ open: true, message: dateError || "Answer at least one indicator before saving.", severity: "error" });
      return;
    }
    const key = keyFor(period);
    const payload: AssessmentPayload = { student_id: studentId, testing_period: period, assessment_date: assessmentDate, evaluations };
    const draft: Draft<AssessmentDraft> = {
      owner_id: owner, values: { answers: answers[period], evaluation_date: assessmentDate }, revision: crypto.randomUUID(),
      is_pending_sync: true, request: { path: "/api/eccd/evaluate", method: "post", data: payload },
    };
    submissionLock.current = true;
    setSaving(true);
    storeDraft(key, draft);
    try {
      if (!navigator.onLine) {
        setSnackbar({ open: true, message: "Saved locally on device. Will automatically sync once reconnected.", severity: "info" });
        return;
      }
      const response = await API.post("/api/eccd/evaluate", payload);
      if (response.status !== 200 && response.status !== 201) throw new Error("The server did not confirm this save.");
      // Refresh first so confirmed answers do not disappear while fetching.
      await refresh();
      confirmDraft(key, draft.revision);
      onSaved();
      setSnackbar({ open: true, message: "Assessment Saved Successfully!", severity: "success" });
    } catch (err) {
      if (isNetworkError(err)) setSnackbar({ open: true, message: "Saved locally on device. Will automatically sync once reconnected.", severity: "info" });
      else {
        if (readDraft<AssessmentDraft>(key)?.revision === draft.revision) storeDraft(key, { ...draft, is_pending_sync: false, error: errorMessage(err) });
        setSnackbar({ open: true, message: errorMessage(err), severity: "error" });
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
    try { await syncDrafts(owner); }
    finally { syncLock.current = false; setIsSyncing(false); }
  }, [owner]);
  useEffect(() => {
    const update = () => {
      setPendingDraftsCount(listPending(owner).filter(item => item.key.startsWith("eccd_draft_") && item.draft.request?.path === "/api/eccd/evaluate").length);
      rerender(v => v + 1);
    };
    const online = () => { setIsOnline(true); void triggerBackgroundSync(); };
    const offline = () => {
      setIsOnline(false);
      setSnackbar({ open: true, message: "You are currently offline. Evaluations will be saved locally on this device.", severity: "warning" });
    };
    const synced = (event: Event) => {
      if ((event as CustomEvent<string>).detail?.startsWith("eccd_draft_")) {
        onSaved();
        setSnackbar({ open: true, message: "Connection restored. Offline assessment synced successfully.", severity: "success" });
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
  }, [owner, triggerBackgroundSync, onSaved]);
  return {
    assessmentDate, evalAges, evalLoading: loading, saving, isOnline, isSyncing, pendingDraftsCount,
    error: error || loadError, setError, snackbar, setSnackbar, handleAnswerChange, handleDateChange, handleSave, triggerBackgroundSync,
    getAnswer: (id: number, p: string) => answers[p as Period]?.[id] || null,
  };
}
