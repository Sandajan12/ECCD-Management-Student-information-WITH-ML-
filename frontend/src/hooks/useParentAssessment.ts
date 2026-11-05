import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { useAuth } from "../context/AuthContext";
import API, { errorMessage, isNetworkError } from "../services/api";
import {
  PERIODS,
  type Answer,
  type Domain,
  type Period,
  type Question,
  type Student,
} from "../types";
import {
  confirmDraft,
  readDraft,
  storeDraft,
  type Draft,
} from "../utils/drafts";
import { useAssessment } from "./useAssessment";

interface HomeValues {
  answers: Record<string, Answer>;
  evaluation_date?: string;
}
interface PeriodSelection {
  owner: number;
  child: number;
  period: Period | null;
}
interface HomeEvaluation {
  question_id: number;
  testing_period: Period;
  answer: Answer;
}
const VIEW_FLAGS = {
  PRE: "allow_parent_view_eccd_pre",
  MID: "allow_parent_view_eccd_mid",
  POST: "allow_parent_view_eccd_post",
} as const;
const EDIT_FLAGS = {
  PRE: "pre_test_parent_editable",
  MID: "mid_test_parent_editable",
  POST: "post_test_parent_editable",
} as const;

export function useParentAssessment(child?: Student, readOnly = false) {
  const { user } = useAuth();
  const id = child?.student_id || 0;
  const owner = user?.id || 0;
  const assessment = useAssessment(id, true);
  const data = assessment.data;
  const [selection, setSelection] = useState<{
    owner: number;
    child: number;
    domain: number;
  } | null>(null);
  const [, updateDrafts] = useState(0);
  const memoryDrafts = useRef(new Map<string, Draft<HomeValues>>());
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const saveLock = useRef(false);
  const identity = `${owner}_${id}`;
  const currentChild = useRef(identity);
  useLayoutEffect(() => {
    currentChild.current = identity;
  }, [identity]);
  const [periodSelection, setPeriodSelection] =
    useState<PeriodSelection | null>(null);
  const [feedback, setFeedback] = useState<{
    scope: string;
    error: string;
    success: string;
  }>({ scope: "", error: "", success: "" });
  useEffect(() => {
    const redraw = () => updateDrafts((version) => version + 1);
    const reload = () => void assessment.refresh();
    const reloadVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    const timer = window.setInterval(reloadVisible, 20000);
    window.addEventListener("ames-drafts-changed", redraw);
    window.addEventListener("storage", redraw);
    window.addEventListener("online", reload);
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", reloadVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", reloadVisible);
      window.removeEventListener("ames-drafts-changed", redraw);
      window.removeEventListener("storage", redraw);
      window.removeEventListener("online", reload);
      window.removeEventListener("focus", reload);
    };
  }, [assessment.refresh]);
  const canEditHomeBased =
    !readOnly &&
    data?.can_edit_home_based === true &&
    data.permissions?.allow_parent_edit_home_based_eccd === true &&
    child?.allow_parent_edit_home_based_eccd === true;
  const canEditPeriod = (period: Period) =>
    canEditHomeBased &&
    data?.parent_assessment_access?.[EDIT_FLAGS[period]] === true;
  const hasOpenPeriod = PERIODS.some(canEditPeriod);
  const editablePeriods = PERIODS.filter(canEditPeriod);
  const canViewMarks =
    child?.allow_parent_view_eccd_marks === true &&
    data?.permissions?.allow_parent_view_eccd_marks === true &&
    data.allow_parent_view_eccd_marks === true;
  const viewablePeriods = readOnly
    ? canViewMarks
      ? PERIODS
      : []
    : editablePeriods;
  const preferred =
    periodSelection?.owner === owner && periodSelection.child === id
      ? periodSelection.period
      : null;
  const selectedPeriod =
    preferred && viewablePeriods.includes(preferred)
      ? preferred
      : (viewablePeriods[0] ?? null);
  useEffect(() => {
    setPeriodSelection((previous) =>
      previous?.owner === owner &&
      previous.child === id &&
      previous.period === selectedPeriod
        ? previous
        : { owner, child: id, period: selectedPeriod },
    );
  }, [owner, id, selectedPeriod]);
  const setSelectedPeriod = (period: Period) => {
    if (viewablePeriods.includes(period) && !saving)
      setPeriodSelection({ owner, child: id, period });
  };
  const isPeriodReleased = (period: Period) =>
    child?.[VIEW_FLAGS[period]] === true &&
    data?.permissions?.[VIEW_FLAGS[period]] === true &&
    data.summary?.[period].isReleased === true &&
    data.summary?.[period].is_published === true;
  const checklistDomains = [...(data?.domains || [])].sort(
    (a, b) =>
      Number(b.questions.some((q) => q.is_home_based === true)) -
        Number(a.questions.some((q) => q.is_home_based === true)) ||
      a.domain_id - b.domain_id,
  );
  const activePeriod =
    selectedPeriod ?? PERIODS.find(isPeriodReleased) ?? "PRE";
  const activeDomain =
    selection?.owner === owner && selection.child === id
      ? checklistDomains.find(
          (domain) => domain.domain_id === selection.domain,
        ) || null
      : null;
  const setActiveDomain = (domain: Domain | null) =>
    setSelection(
      domain ? { owner, child: id, domain: domain.domain_id } : null,
    );
  const draftKey = (domain: number, period: Period) =>
    `eccd_draft_${id}_${period}_${domain}_home_${owner}`;
  const draftFor = (domain: number, period: Period) => {
    const key = draftKey(domain, period);
    const draft = memoryDrafts.current.get(key) || readDraft<HomeValues>(key);
    return draft?.owner_id === owner ? draft : null;
  };
  const write = (key: string, draft: Draft<HomeValues>) => {
    storeDraft(key, draft);
    if (readDraft<HomeValues>(key)?.revision === draft.revision)
      memoryDrafts.current.delete(key);
    else memoryDrafts.current.set(key, draft);
    updateDrafts((version) => version + 1);
  };
  const serverAnswer = (questionId: number, period: Period): Answer | null => {
    const question = checklistDomains
      .flatMap((domain) => domain.questions)
      .find((item) => item.question_id === questionId);
    if (
      !canViewMarks &&
      !(
        question?.is_home_based === true &&
        question.evaluator_roles?.[period] === "parent" &&
        canEditPeriod(period)
      )
    )
      return null;
    return question?.answers[period] || null;
  };
  const isQuestionLocked = (questionId: number, period: Period): boolean => {
    const question = checklistDomains
      .flatMap((domain) => domain.questions)
      .find((item) => item.question_id === questionId);
    return (
      question?.parent_locked?.[period] === true ||
      Boolean(question?.answers[period])
    );
  };
  const getAnswer = (questionId: number, period: string): Answer | null => {
    if (!PERIODS.includes(period as Period)) return null;
    const p = period as Period;
    const domain = checklistDomains.find((item) =>
      item.questions.some((question) => question.question_id === questionId),
    );
    const question = domain?.questions.find(
      (q) => q.question_id === questionId,
    );
    if (!domain || !question) return null;
    if (question.is_home_based !== true) return serverAnswer(questionId, p);
    // Own unsaved observations may be entered independently of official score release.
    // The API masks records using marks access and ownership, independently of scores.
    let source: Answer | null = null;
    let blocked = false;
    for (const current of PERIODS) {
      // Hidden records may contain a later DI-KAYA. Never infer through a
      // masked intermediate period or expose a hidden source as carry-over.
      if (!canViewMarks && !canEditPeriod(current)) source = null;
      const saved = serverAnswer(questionId, current);
      const locked = isQuestionLocked(questionId, current);
      if (locked && !saved) source = null;
      const local =
        !locked && (canEditHomeBased || isPeriodReleased(current))
          ? draftFor(domain.domain_id, current)?.values.answers[questionId]
          : null;
      if (saved) {
        source = saved;
        blocked = false;
      }
      const inherited = canEditPeriod(current) && !blocked && source === "KAYA";
      if (current === p)
        return locked ? saved : local || saved || (inherited ? "KAYA" : null);
      if (local === "DI-KAYA") blocked = true;
    }
    return null;
  };
  const handleAnswerChange = (
    questionId: number,
    period: string,
    answer: string,
  ) => {
    if (
      !canEditPeriod(period as Period) ||
      isQuestionLocked(questionId, period as Period) ||
      period !== selectedPeriod ||
      saving ||
      !PERIODS.includes(period as Period) ||
      !["KAYA", "DI-KAYA"].includes(answer)
    )
      return;
    const domain = checklistDomains.find((item) =>
      item.questions.some((question) => question.question_id === questionId),
    );
    if (
      !domain?.questions.some(
        (q) => q.question_id === questionId && q.is_home_based === true,
      )
    )
      return;
    const p = period as Period;
    const previous = draftFor(domain.domain_id, p);
    const answers = {
      ...previous?.values.answers,
      [questionId]: answer as Answer,
    };
    write(draftKey(domain.domain_id, p), {
      owner_id: owner,
      values: { ...previous?.values, answers },
      revision: crypto.randomUUID(),
      is_pending_sync: false,
    });
    setFeedback({ scope: identity, error: "", success: "" });
  };
  const handleSaveChecklist = async (confirmed = false) => {
    if (
      !selectedPeriod ||
      !canEditPeriod(selectedPeriod) ||
      assessment.loading ||
      saveLock.current
    )
      return;
    const period = selectedPeriod;
    const snapshots = checklistDomains.flatMap((domain) => {
      const evaluations: HomeEvaluation[] = domain.questions.flatMap(
        (question) => {
          if (
            question.is_home_based !== true ||
            isQuestionLocked(question.question_id, period)
          )
            return [];
          const answer = getAnswer(question.question_id, period);
          return answer === "KAYA" || answer === "DI-KAYA"
            ? [
                {
                  question_id: question.question_id,
                  testing_period: period,
                  answer,
                },
              ]
            : [];
        },
      );
      if (!evaluations.length) return [];
      const key = draftKey(domain.domain_id, period);
      const draft: Draft<HomeValues> = {
        owner_id: owner,
        values: {
          answers: {
            ...draftFor(domain.domain_id, period)?.values.answers,
            ...Object.fromEntries(
              evaluations.map((row) => [row.question_id, row.answer]),
            ),
          },
        },
        revision: crypto.randomUUID(),
        is_pending_sync: true,
        request: {
          path: "/api/eccd/parent/evaluate",
          method: "post",
          data: { student_id: id, testing_period: period, evaluations },
        },
      };
      return [{ key, draft, evaluations }];
    });
    if (!snapshots.length) {
      setFeedback({
        scope: identity,
        error: "Please answer at least one indicator before saving.",
        success: "",
      });
      return;
    }
    if (!confirmed) {
      setConfirmation(`${identity}_${period}`);
      return;
    }
    if (confirmation !== `${identity}_${period}`) return;
    setConfirmation(null);
    saveLock.current = true;
    setSaving(true);
    setFeedback({ scope: identity, error: "", success: "" });
    for (const snapshot of snapshots) write(snapshot.key, snapshot.draft);
    try {
      if (!navigator.onLine) {
        setFeedback({
          scope: identity,
          error: "",
          success:
            "Your draft is saved on this device. Reconnect and submit again.",
        });
        return {
          severity: "success" as const,
          message:
            "Your draft is saved on this device. Reconnect and submit again.",
        };
      }
      const response = await API.post("/api/eccd/parent/evaluate", {
        student_id: id,
        testing_period: period,
        evaluations: snapshots.flatMap((snapshot) => snapshot.evaluations),
      });
      if (response.status !== 200 && response.status !== 201)
        throw new Error("The server did not confirm this save.");
      for (const snapshot of snapshots) {
        const persisted = readDraft<HomeValues>(snapshot.key);
        if (persisted && persisted.revision !== snapshot.draft.revision)
          continue;
        const current = memoryDrafts.current.get(snapshot.key) || persisted;
        if (current?.revision !== snapshot.draft.revision) continue;
        const submittedIds = new Set(
          snapshot.evaluations.map((row) => String(row.question_id)),
        );
        const remaining = Object.fromEntries(
          Object.entries(current.values.answers).filter(
            ([questionId]) => !submittedIds.has(questionId),
          ),
        );
        if (Object.keys(remaining).length) {
          write(snapshot.key, {
            owner_id: owner,
            values: { ...current.values, answers: remaining },
            revision: crypto.randomUUID(),
            is_pending_sync: false,
          });
          continue;
        }
        confirmDraft(snapshot.key, snapshot.draft.revision);
        if (
          memoryDrafts.current.get(snapshot.key)?.revision ===
          snapshot.draft.revision
        )
          memoryDrafts.current.delete(snapshot.key);
      }
      updateDrafts((version) => version + 1);
      // Confirm the submitted child's exact keys, but leave a newly selected
      // child/account's page and feedback alone when the response arrives late.
      if (currentChild.current !== identity) return;
      setFeedback({
        scope: identity,
        error: "",
        success: "Assessment evaluations saved successfully!",
      });
      if (currentChild.current === identity) await assessment.refresh();
      return {
        severity: "success" as const,
        message: "Home-based evaluation saved successfully!",
      };
    } catch (err) {
      if (
        isNetworkError(err) ||
        (isAxiosError(err) && (err.response?.status || 0) >= 500)
      )
        setFeedback({
          scope: identity,
          error: "",
          success:
            "Your draft is saved on this device. Reconnect and submit again.",
        });
      else {
        for (const snapshot of snapshots) {
          if (
            (
              memoryDrafts.current.get(snapshot.key) ||
              readDraft<HomeValues>(snapshot.key)
            )?.revision === snapshot.draft.revision
          )
            write(snapshot.key, {
              ...snapshot.draft,
              is_pending_sync: false,
              error: errorMessage(err),
            });
        }
        setFeedback({ scope: identity, error: errorMessage(err), success: "" });
        if (currentChild.current === identity) void assessment.refresh();
      }
      const retained =
        isNetworkError(err) ||
        (isAxiosError(err) && (err.response?.status || 0) >= 500);
      if (currentChild.current !== identity) return;
      return {
        severity: (retained ? "success" : "error") as "success" | "error",
        message: retained
          ? "Your draft is saved on this device. Reconnect and submit again."
          : errorMessage(err),
      };
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };
  const sortedQuestions = (questions: Question[]) =>
    [...questions].sort(
      (a, b) =>
        Number(b.is_home_based === true) - Number(a.is_home_based === true) ||
        a.sequence_order - b.sequence_order ||
        a.question_id - b.question_id,
    );
  return {
    data,
    checklistDomains,
    activeDomain,
    setActiveDomain,
    canEditHomeBased,
    canEditPeriod,
    hasOpenPeriod,
    editablePeriods,
    viewablePeriods,
    canViewMarks,
    selectedPeriod,
    activePeriod,
    setSelectedPeriod,
    sortedQuestions,
    isPeriodReleased,
    getAnswer,
    handleAnswerChange,
    handleSaveChecklist,
    isQuestionLocked,
    confirmationOpen: confirmation === `${identity}_${selectedPeriod}`,
    cancelConfirmation: () => setConfirmation(null),
    saving,
    loading: assessment.loading,
    error:
      assessment.error || (feedback.scope === identity ? feedback.error : ""),
    saveSuccess: feedback.scope === identity ? feedback.success : "",
  };
}
