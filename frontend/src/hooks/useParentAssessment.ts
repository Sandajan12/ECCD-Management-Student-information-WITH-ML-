import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { useAuth } from "../context/AuthContext";
import API, {
  errorMessage,
  isNetworkError,
  getSessionUser,
} from "../services/api";
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
import { readFile, writeFile, confirmStoredFile } from "../utils/fileDrafts";

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
  const [confirmation, setConfirmation] = useState<{
    scope: string;
    signature: string;
    count: number;
  } | null>(null);
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
    window.addEventListener("ames-drafts-changed", redraw);
    window.addEventListener("storage", redraw);
    return () => {
      window.removeEventListener("ames-drafts-changed", redraw);
      window.removeEventListener("storage", redraw);
    };
  }, []);
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
        (question.evaluator_roles?.[period] === "parent" ||
          question.home_observations?.[period]?.answer) &&
        canEditPeriod(period)
      )
    )
      return null;
    return (
      question?.answers[period] ||
      (question?.home_observations?.[period]?.status !== "declined"
        ? question?.home_observations?.[period]?.answer
        : null) ||
      null
    );
  };
  const isQuestionSaved = (questionId: number, period: Period): boolean => {
    const question = checklistDomains
      .flatMap((domain) => domain.questions)
      .find((item) => item.question_id === questionId);
    return (
      question?.parent_locked?.[period] === true ||
      ["pending", "accepted", "submitted"].includes(
        question?.home_observations?.[period]?.status || "",
      ) ||
      question?.evaluator_roles?.[period] === "teacher" ||
      Boolean(question?.teacher_marked_at?.[period]) ||
      Boolean(question?.answers[period])
    );
  };
  const carryStatus = (questionId: number, period: Period) =>
    checklistDomains
      .flatMap((domain) => domain.questions)
      .find((question) => question.question_id === questionId)?.carry_forward?.[
      period
    ];
  const isQuestionLocked = (questionId: number, period: Period): boolean =>
    isQuestionSaved(questionId, period) ||
    ["locked", "restricted"].includes(carryStatus(questionId, period) || "");
  const isCarriedForward = (questionId: number, period: Period): boolean =>
    !isQuestionSaved(questionId, period) &&
    carryStatus(questionId, period) === "locked";
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
    if (question.carry_forward) {
      const saved = serverAnswer(questionId, p);
      if (isQuestionSaved(questionId, p)) return saved;
      if (!canEditPeriod(p) || question.carry_forward[p] === "restricted")
        return null;
      if (question.carry_forward[p] === "locked") return "KAYA";
      return draftFor(domain.domain_id, p)?.values.answers[questionId] || saved;
    }
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
            isQuestionSaved(question.question_id, period) ||
            carryStatus(question.question_id, period) === "restricted"
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
    const confirmationSnapshot = {
      scope: `${identity}_${period}`,
      signature: JSON.stringify(
        snapshots.flatMap((snapshot) => snapshot.evaluations),
      ),
      count: snapshots.reduce(
        (total, snapshot) => total + snapshot.evaluations.length,
        0,
      ),
    };
    if (!confirmed) {
      setConfirmation(confirmationSnapshot);
      return;
    }
    if (confirmation?.scope !== confirmationSnapshot.scope) return;
    if (confirmation.signature !== confirmationSnapshot.signature) {
      setConfirmation(confirmationSnapshot);
      return;
    }
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
      const files: { key: string; revision: string }[] = [];
      const photo_ids: Record<number, string> = {};
      for (const row of snapshots.flatMap((snapshot) => snapshot.evaluations)) {
        if (getSessionUser()?.id !== owner)
          throw new Error(
            "Account changed. Your original draft is preserved; sign in to that account to submit it.",
          );
        const key = `ames_file_${owner}_home_${id}_${period}_${row.question_id}`;
        const file = await readFile(key);
        if (!file) continue;
        const question = checklistDomains
          .flatMap((d) => d.questions)
          .find((q) => q.question_id === row.question_id);
        if (question?.photo_eligible?.[period] !== true)
          throw new Error(
            "An earlier KAYA now carries forward. Remove its optional photo before submitting.",
          );
        let photoId = file.photo_id;
        if (!photoId) {
          const form = new FormData();
          form.append("file", file.file);
          if (getSessionUser()?.id !== owner)
            throw new Error(
              "Account changed. Your original draft is preserved; sign in to that account to submit it.",
            );
          const uploaded = await API.post<{ photo_id: string }>(
            `/api/eccd/parent/home-photos/${id}/${row.question_id}/${period}`,
            form,
          );
          if (![200, 201].includes(uploaded.status))
            throw new Error("The server did not confirm the photo upload.");
          photoId = uploaded.data.photo_id;
          if ((await readFile(key))?.revision === file.revision)
            await writeFile(key, { ...file, photo_id: photoId });
        }
        photo_ids[row.question_id] = photoId;
        files.push({ key, revision: file.revision });
      }
      if (getSessionUser()?.id !== owner)
        throw new Error(
          "Account changed. Your original draft is preserved; sign in to that account to submit it.",
        );
      const response = await API.post("/api/eccd/parent/evaluate", {
        student_id: id,
        testing_period: period,
        ...(Object.keys(photo_ids).length ? { photo_ids } : {}),
        evaluations: snapshots.flatMap((snapshot) => snapshot.evaluations),
      });
      if (response.status !== 200 && response.status !== 201)
        throw new Error("The server did not confirm this save.");
      await Promise.allSettled(
        files.map((file) => confirmStoredFile(file.key, file.revision)),
      );
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
        success: "Submitted — awaiting teacher review.",
      });
      if (currentChild.current === identity) await assessment.refresh();
      return {
        severity: "success" as const,
        message: "Submitted — awaiting teacher review.",
      };
    } catch (err) {
      if (currentChild.current !== identity) return;
      const retained =
        isNetworkError(err) ||
        (isAxiosError(err) && (err.response?.status || 0) >= 500);
      const photoUploadFailed =
        isAxiosError(err) &&
        Boolean(err.response) &&
        err.config?.url?.startsWith("/api/eccd/parent/home-photos/");
      const message = photoUploadFailed
        ? `${errorMessage(err)} Your answers and photo are saved on this device. Submit again when photo uploads are available.`
        : retained
          ? "Your draft is saved on this device. Reconnect and submit again."
          : errorMessage(err);
      if (retained)
        setFeedback({
          scope: identity,
          error: photoUploadFailed ? message : "",
          success: photoUploadFailed ? "" : message,
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
              error: message,
            });
        }
        setFeedback({ scope: identity, error: message, success: "" });
        if (currentChild.current === identity) void assessment.refresh();
      }
      return {
        severity: (retained && !photoUploadFailed ? "success" : "error") as "success" | "error",
        message,
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
    submissionCount: confirmation?.count || 0,
    photoResource: (questionId: number, period: Period) =>
      `home_${id}_${period}_${questionId}`,
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
    isQuestionSaved,
    isCarriedForward,
    confirmationOpen: confirmation?.scope === `${identity}_${selectedPeriod}`,
    cancelConfirmation: () => setConfirmation(null),
    saving,
    loading: assessment.loading,
    error:
      assessment.error || (feedback.scope === identity ? feedback.error : ""),
    saveSuccess: feedback.scope === identity ? feedback.success : "",
  };
}
