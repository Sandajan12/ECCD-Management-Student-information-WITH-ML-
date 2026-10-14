import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { useAuth } from "../context/AuthContext";
import API, { errorMessage, isNetworkError } from "../services/api";
import {
  PERIODS,
  type Answer,
  type Domain,
  type Period,
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
interface HomeEvaluation {
  question_id: number;
  testing_period: Period;
  answer: Answer;
}
const DOMAIN_NAMES: Record<string, string> = {
  GM: "Gross Motor",
  FM: "Fine Motor",
  SH: "Self-Help",
  RL: "Receptive Language",
  EL: "Expressive Language",
  C: "Cognitive",
  SE: "Socio-Emotional",
};
const VIEW_FLAGS = {
  PRE: "allow_parent_view_eccd_pre",
  MID: "allow_parent_view_eccd_mid",
  POST: "allow_parent_view_eccd_post",
} as const;

export function useParentAssessment(child?: Student) {
  const { user } = useAuth();
  const id = child?.student_id || 0;
  const owner = user?.id || 0;
  const assessment = useAssessment(id, true);
  const data = assessment.data;
  const [selection, setSelection] = useState<{
    child: number;
    domain: number;
  } | null>(null);
  const [, updateDrafts] = useState(0);
  const memoryDrafts = useRef(new Map<string, Draft<HomeValues>>());
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const currentChild = useRef(id);
  useLayoutEffect(() => {
    currentChild.current = id;
  }, [id]);
  const [feedback, setFeedback] = useState<{
    child: number;
    error: string;
    success: string;
  }>({ child: 0, error: "", success: "" });
  useEffect(() => {
    const redraw = () => updateDrafts((version) => version + 1);
    const reload = () => void assessment.refresh();
    window.addEventListener("ames-drafts-changed", redraw);
    window.addEventListener("storage", redraw);
    window.addEventListener("online", reload);
    window.addEventListener("focus", reload);
    return () => {
      window.removeEventListener("ames-drafts-changed", redraw);
      window.removeEventListener("storage", redraw);
      window.removeEventListener("online", reload);
      window.removeEventListener("focus", reload);
    };
  }, [assessment.refresh]);
  const canEditHomeBased =
    data?.can_edit_home_based === true &&
    data.permissions?.allow_parent_edit_home_based_eccd === true &&
    child?.allow_parent_edit_home_based_eccd === true;
  const isPeriodReleased = (period: Period) =>
    child?.[VIEW_FLAGS[period]] === true &&
    data?.permissions?.[VIEW_FLAGS[period]] === true &&
    data.summary?.[period].isReleased === true &&
    data.summary?.[period].is_published === true;
  const checklistDomains = data?.domains || [];
  const activeDomain =
    selection?.child === id
      ? checklistDomains.find(
          (domain) => domain.domain_id === selection.domain,
        ) || null
      : null;
  const setActiveDomain = (domain: Domain | null) =>
    setSelection(domain ? { child: id, domain: domain.domain_id } : null);
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
    if (!isPeriodReleased(period)) return null;
    return (
      checklistDomains
        .flatMap((domain) => domain.questions)
        .find((question) => question.question_id === questionId)?.answers[
        period
      ] || null
    );
  };
  const getAnswer = (questionId: number, period: string): Answer | null => {
    if (!PERIODS.includes(period as Period)) return null;
    const p = period as Period;
    const domain = checklistDomains.find((item) =>
      item.questions.some((question) => question.question_id === questionId),
    );
    if (!domain) return null;
    // Own unsaved observations may be entered independently of official score release.
    // Server answers remain masked until the matching period is released.
    const local = draftFor(domain.domain_id, p)?.values.answers[questionId];
    return (
      (canEditHomeBased || isPeriodReleased(p) ? local : null) ||
      serverAnswer(questionId, p)
    );
  };
  const handleAnswerChange = (
    questionId: number,
    period: string,
    answer: string,
  ) => {
    if (
      !canEditHomeBased ||
      saving ||
      !PERIODS.includes(period as Period) ||
      !["KAYA", "DI-KAYA"].includes(answer)
    )
      return;
    const domain = checklistDomains.find((item) =>
      item.questions.some((question) => question.question_id === questionId),
    );
    if (!domain) return;
    const p = period as Period;
    const set = (target: Period) => {
      const previous = draftFor(domain.domain_id, target);
      const answers = {
        ...previous?.values.answers,
        [questionId]: answer as Answer,
      };
      write(draftKey(domain.domain_id, target), {
        owner_id: owner,
        values: { ...previous?.values, answers },
        revision: crypto.randomUUID(),
        is_pending_sync: false,
      });
    };
    set(p);
    // Retain legacy mastery carry-forward/backfill for parent observations only.
    if (answer === "KAYA") {
      for (const target of PERIODS) {
        if (
          target !== p &&
          (PERIODS.indexOf(target) > PERIODS.indexOf(p) ||
            !getAnswer(questionId, target))
        )
          set(target);
      }
    }
    setFeedback({ child: id, error: "", success: "" });
  };
  const handleSaveChecklist = async () => {
    if (!canEditHomeBased || saveLock.current) return;
    const snapshots = checklistDomains.flatMap((domain) =>
      PERIODS.flatMap((period) => {
        const previous = draftFor(domain.domain_id, period);
        if (!previous) return [];
        const evaluations: HomeEvaluation[] = domain.questions.flatMap(
          (question) => {
            const answer = previous.values.answers[question.question_id];
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
          ...previous,
          revision: crypto.randomUUID(),
          is_pending_sync: true,
          request: {
            path: "/api/eccd/parent/evaluate",
            method: "post",
            data: { student_id: id, evaluations },
          },
        };
        return [{ key, draft, evaluations }];
      }),
    );
    if (!snapshots.length) {
      setFeedback({
        child: id,
        error: "Please answer at least one indicator before saving.",
        success: "",
      });
      return;
    }
    saveLock.current = true;
    setSaving(true);
    setFeedback({ child: id, error: "", success: "" });
    for (const snapshot of snapshots) write(snapshot.key, snapshot.draft);
    try {
      if (!navigator.onLine) {
        setFeedback({
          child: id,
          error: "",
          success:
            "Saved on this device. Observations will sync when your connection returns.",
        });
        return {
          severity: "success" as const,
          message:
            "Saved on this device. Observations will sync when your connection returns.",
        };
      }
      const response = await API.post("/api/eccd/parent/evaluate", {
        student_id: id,
        evaluations: snapshots.flatMap((snapshot) => snapshot.evaluations),
      });
      if (response.status !== 200 && response.status !== 201)
        throw new Error("The server did not confirm this save.");
      for (const snapshot of snapshots) {
        confirmDraft(snapshot.key, snapshot.draft.revision);
        if (
          memoryDrafts.current.get(snapshot.key)?.revision ===
          snapshot.draft.revision
        )
          memoryDrafts.current.delete(snapshot.key);
      }
      updateDrafts((version) => version + 1);
      setFeedback({
        child: id,
        error: "",
        success: "Assessment evaluations saved successfully!",
      });
      if (currentChild.current === id) await assessment.refresh();
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
          child: id,
          error: "",
          success:
            "Saved on this device. Observations are queued for synchronization.",
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
        setFeedback({ child: id, error: errorMessage(err), success: "" });
        if (currentChild.current === id) void assessment.refresh();
      }
      const queued =
        isNetworkError(err) ||
        (isAxiosError(err) && (err.response?.status || 0) >= 500);
      return {
        severity: (queued ? "success" : "error") as "success" | "error",
        message: queued
          ? "Saved on this device. Observations are queued for synchronization."
          : errorMessage(err),
      };
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };
  const summaryData = data
    ? {
        permissions: data.permissions,
        periods: Object.fromEntries(
          PERIODS.map((period) => {
            const summary = data.summary?.[period];
            const released = isPeriodReleased(period);
            return [
              period,
              {
                testing_period: period,
                evaluation_date: released ? summary?.assessmentDate : null,
                decimal_age: released ? summary?.decimalAge : null,
                sum_of_scaled_scores: released
                  ? summary?.sumOfScaledScores
                  : null,
                standard_score: released ? summary?.standardScore : null,
                interpretation: released
                  ? summary?.interpretation
                  : "Pending Adviser Release",
                is_published: released,
                domains: (data.matrix || []).map((domain) => ({
                  domain_code: domain.domain_code,
                  domain_name:
                    DOMAIN_NAMES[domain.domain_code] ||
                    domain.domain_name
                      .replace(/ Domain$/i, "")
                      .replace(/^Social-Emotional$/i, "Socio-Emotional"),
                  raw_score: released
                    ? (summary?.rawScores?.[domain.domain_code] ?? null)
                    : null,
                  scaled_score: released
                    ? (summary?.scaledScores?.[domain.domain_code] ??
                      domain.scores[period])
                    : null,
                })),
              },
            ];
          }),
        ) as Record<
          Period,
          {
            testing_period: Period;
            evaluation_date: string | null | undefined;
            decimal_age: number | null | undefined;
            sum_of_scaled_scores: number | null | undefined;
            standard_score: number | null | undefined;
            interpretation: string | null | undefined;
            is_published: boolean;
            domains: {
              domain_code: string;
              domain_name: string;
              raw_score: number | null;
              scaled_score: number | null;
            }[];
          }
        >,
      }
    : null;
  const evalAges = Object.fromEntries(
    checklistDomains.map((domain) => [
      String(domain.domain_id),
      Object.fromEntries(
        PERIODS.map((period) => [
          period,
          isPeriodReleased(period)
            ? (data?.evalAges[String(domain.domain_id)]?.[period] ?? null)
            : null,
        ]),
      ),
    ]),
  );
  return {
    data,
    checklistDomains,
    activeDomain,
    setActiveDomain,
    canEditHomeBased,
    isPeriodReleased,
    getAnswer,
    handleAnswerChange,
    handleSaveChecklist,
    saving,
    summaryData,
    evalAges,
    loading: assessment.loading,
    error: assessment.error || (feedback.child === id ? feedback.error : ""),
    saveSuccess: feedback.child === id ? feedback.success : "",
  };
}
