import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {launchImageLibrary} from "react-native-image-picker";
import type { Assessment, Child, Dashboard, Period, User } from "./contracts";
import { session } from "./session";
import { messageOf } from "./sessionCore";
import { drafts, useDraft } from "./drafts";
import { homeKey, HomeObservations, MissingPhotoMarksError } from "./homeObservations";
import type { HomeValues, MissingPhotoMark } from "./homeObservations";
import { homeLock, WINDOWS } from "./policy";
import { homeScope, remainingHomeDomains, TEACHER_LOCK } from "./presentation";
import type { HomeConfirmations } from "./presentation";
import { Feedback, useResource } from "./resources";
import { OverviewSummary } from "./AssessmentScreens";
import {
  Badge,
  Button,
  Card,
  Copy,
  Dialog,
  Icon,
  Label,
  Notice,
  PeriodTabs,
  Screen,
  styles,
} from "./ui";

function HomeDomain({
  domain,
  child,
  user,
  assessment,
  period,
  service,
  busy,
  target,
  reveal,
}: {
  domain: Assessment["domains"][number];
  child: Child;
  user: User;
  assessment: Assessment;
  period: Period;
  service: HomeObservations;
  busy: boolean;
  target?: MissingPhotoMark;
  reveal: (row: View) => void;
}) {
  const { snapshot, ready, storageError } = useDraft<HomeValues>(
    homeKey(child.student_id, period, domain.domain_id, user.id),
    user.id,
  );
  const [expanded, setExpanded] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const targetRow = useRef<View>(null);
  useEffect(() => {
    if (target) setExpanded(true);
  }, [target]);
  useEffect(() => {
    if (target && expanded && targetRow.current) reveal(targetRow.current);
  }, [target, expanded, reveal]);
  const questions = domain.questions;
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
        style={[styles.row, { flexWrap: "nowrap", minHeight: 44 }]}
      >
        <Icon name="home" />
        <Label style={{ flex: 1 }}>{domain.domain_name}</Label>
        <Badge>{questions.length}</Badge>
        <Icon name={expanded ? "up" : "down"} />
      </Pressable>
      {!!storageError && <Notice error>{storageError}</Notice>}
      {!!photoError && <Notice error>{photoError}</Notice>}
      {snapshot?.is_pending_sync && (
        <Notice>
          Your draft is saved on this device. Reconnect and submit again.
        </Notice>
      )}
      {!!snapshot?.error && <Notice error>{snapshot.error}</Notice>}
      {expanded &&
        questions.map((question) => {
          const lock = homeLock(child, assessment, question, period);
          const carried = question.carry_forward?.[period] === "locked";
          const value = carried
            ? "KAYA"
            : snapshot?.values.answers[String(question.question_id)];
          return (
            <View
              key={question.question_id}
              ref={target?.questionId === question.question_id ? targetRow : undefined}
              onLayout={() => {
                if (target?.questionId === question.question_id && targetRow.current) reveal(targetRow.current);
              }}
              style={{ gap: 8, paddingVertical: 8 }}
            >
              <Label>
                {question.sequence_order}. {question.question_text}
              </Label>
              {!!lock && (
                <Badge icon="lock" color="#64748b">
                  {lock}
                </Badge>
              )}
              {carried && !lock && (
                <Text style={styles.copy} numberOfLines={1}>
                  draft-not save
                </Text>
              )}
              <View style={[styles.row, target?.questionId === question.question_id && {
                borderWidth: 2, borderColor: "#b45309", borderRadius: 12, padding: 8,
              }]}>
                {(["KAYA", "DI-KAYA"] as const).map((answer) => (
                  <Button
                    key={answer}
                    title={answer}
                    icon={answer === "KAYA" ? "check" : "support"}
                    color={answer === "KAYA" ? "#15803d" : "#b45309"}
                    secondary={value !== answer}
                    disabled={
                      !ready ||
                      !!lock ||
                      busy ||
                      (carried && answer === "DI-KAYA")
                    }
                    onPress={() => {
                      void service
                        .change(
                          domain.domain_id,
                          period,
                          question.question_id,
                          answer,
                        )
                        .catch(() => {});
                    }}
                  />
                ))}
                {!!value && !carried && (
                  <Button
                    secondary
                    title="Remove local answer"
                    disabled={!ready || !!lock || busy}
                    onPress={() => {
                      void service
                        .change(
                          domain.domain_id,
                          period,
                          question.question_id,
                          null,
                        )
                        .catch(() => {});
                    }}
                  />
                )}
              </View>
              {question.photo_eligible?.[period] === true && !lock && <Button secondary title="Optional photo" disabled={!ready || busy} onPress={() => {
                void (async () => {
                  try {
                    setPhotoError("");
                    const result = await launchImageLibrary({mediaType: "photo", selectionLimit: 1, includeBase64: false, includeExtra: false, maxWidth: 2048, maxHeight: 2048, quality: 0.8});
                    if (result.didCancel) return;
                    if (result.errorCode) throw new Error(result.errorMessage || "Photo selection failed.");
                    const asset = result.assets?.[0];
                    if (!asset?.uri || !asset.type) throw new Error("Select a JPEG, PNG or WebP photo.");
                    if ((asset.fileSize || 0) > 5 * 1024 * 1024) throw new Error("Photo must be at most 5 MiB.");
                    await service.photo(domain.domain_id, period, question.question_id, {uri: asset.uri, type: asset.type, name: asset.fileName || "home-photo.jpg"});
                  } catch(error) {setPhotoError(messageOf(error));}
                })();
              }}/>}
              {snapshot?.values.photos?.[String(question.question_id)] && <>
                <Copy>{snapshot.values.photos[String(question.question_id)].name} · Photo selected on this device.</Copy>
                {question.photo_eligible?.[period] !== true && <Notice>An earlier KAYA now carries forward. Remove this optional photo before submitting.</Notice>}
                <Button secondary title="Remove photo" disabled={busy} onPress={() => {void service.photo(domain.domain_id, period, question.question_id, null).catch(error => setPhotoError(messageOf(error)));}}/>
              </>}
            </View>
          );
        })}
    </Card>
  );
}
export function OverviewScreen({
  child,
  user,
  refreshChildren,
  header,
  insights,
  results,
  confirmed,
  onConfirmed,
}: {
  child: Child;
  user: User;
  refreshChildren: () => Promise<void>;
  header: React.ReactNode;
  insights: () => void;
  results: () => void;
  confirmed: HomeConfirmations;
  onConfirmed: (period: Period, ids: readonly number[]) => void;
}) {
  const state = useResource<Assessment>(
    `/api/eccd/parent/assessment/${child.student_id}`,
    JSON.stringify(child),
  );
  const dashboard = useResource<Dashboard>(
    `/api/eccd/parent/dashboard-stats/${child.student_id}`,
    JSON.stringify(child),
  );
  const [period, setPeriod] = useState<Period>("PRE");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [photoWarning, setPhotoWarning] = useState<{ scope: string; error: MissingPhotoMarksError } | null>(null);
  const [navigation, setNavigation] = useState<{ scope: string; question: MissingPhotoMark } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const actionLock = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const submittedDeclines = useRef(new Map<string, object>());
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const scope = homeScope(user.id, child.student_id, period);
  const liveScope = useRef(scope);
  useEffect(() => {
    liveScope.current = scope;
    setPhotoWarning(null);
    setNavigation(null);
    setConfirming(null);
  }, [scope]);
  const confirmedIds = (confirmed[scope] || []).filter((id) => {
    const review = state.data?.domains.flatMap(d => d.questions)
      .find(q => q.question_id === id)?.home_observations?.[period];
    // A fresh decline reopens a prior confirmation; a just-resubmitted decline stays hidden during refresh.
    return review?.status !== "declined" || submittedDeclines.current.get(`${scope}_${id}`) === review;
  });
  const editable =
    !!state.data &&
    child.allow_parent_edit_home_based_eccd &&
    state.data.permissions.allow_parent_edit_home_based_eccd &&
    state.data.can_edit_home_based &&
    state.data.parent_assessment_access[WINDOWS[period]];
  const remaining = state.data && editable
    ? remainingHomeDomains(state.data, period, confirmedIds)
    : [];
  const service = useMemo(
    () =>
      new HomeObservations(drafts, user.id, child.student_id, (payload) =>
        session.request("/api/eccd/parent/evaluate", "POST", payload),
        async (question, selectedPeriod, photo) => {
          const form = new FormData();
          form.append("file", {uri: photo.uri, type: photo.type, name: photo.name} as unknown as Blob);
          const uploaded = await session.request<{photo_id: string}>(`/api/eccd/parent/home-photos/${child.student_id}/${question}/${selectedPeriod}`, "POST", form);
          return uploaded.photo_id;
        },
        () => session.snapshot().session?.user.id === user.id &&
          liveScope.current === scope,
      ),
    [user.id, child.student_id, scope],
  );
  const reveal = useCallback((row: View) => {
    if (!contentRef.current || liveScope.current !== scope) return;
    row.measureLayout(contentRef.current, (_x, y) => {
      if (liveScope.current === scope) scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }, () => {});
  }, [scope]);
  const prepareSubmission = async () => {
    if (actionLock.current || !state.data || !editable) return;
    actionLock.current = true;
    setBusy(true);
    try {
      await service.validatePhotos(child, state.data, period, confirmedIds);
      if (liveScope.current === scope && mounted.current) setConfirming(scope);
    } catch (error) {
      if (liveScope.current !== scope || !mounted.current) return;
      if (error instanceof MissingPhotoMarksError) setPhotoWarning({ scope, error });
      else setNotice(messageOf(error));
    } finally {
      actionLock.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const submit = async () => {
    if (actionLock.current || busy || !state.data || !editable) return;
    actionLock.current = true;
    setBusy(true);
    setNotice("");
    try {
      const saved = await service.submit(
        child,
        state.data,
        period,
        confirmedIds,
      );
      if (!mounted.current || liveScope.current !== scope) return;
      for (const id of saved.questionIds) {
        const review = state.data.domains.flatMap(d => d.questions)
          .find(q => q.question_id === id)?.home_observations?.[period];
        if (review?.status === "declined") submittedDeclines.current.set(`${scope}_${id}`, review);
      }
      onConfirmed(period, saved.questionIds);
      if (!mounted.current || liveScope.current !== scope) return;
      setNotice(saved.cleanupWarning || "Submitted — awaiting teacher review.");
      await Promise.all([state.reload(), dashboard.reload()]);
    } catch (error) {
      if (mounted.current && liveScope.current === scope) {
        if (error instanceof MissingPhotoMarksError) setPhotoWarning({ scope, error });
        else setNotice(messageOf(error));
      }
    } finally {
      actionLock.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const disabled = busy || !editable || !remaining.length;
  const toggle = () => setExpanded((value) => !value);
  return (
    <Screen
      scrollRef={scrollRef}
      contentRef={contentRef}
      onRefresh={async () => {
        await Promise.all([
          refreshChildren(),
          state.reload(),
          dashboard.reload(),
        ]);
      }}
      footer={
        expanded &&
        remaining.length > 0 && (
          <Button
            icon="save"
            title={busy ? "Submitting…" : "Submit Observations"}
            disabled={disabled}
            onPress={() => { void prepareSubmission(); }}
          />
        )
      }
    >
      {header}
      <Card style={{ padding: 0 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Assess Home-Based Questions"
          accessibilityState={{ expanded, disabled: busy }}
          disabled={busy}
          onPress={toggle}
          style={[
            styles.row,
            { minHeight: 56, flexWrap: "nowrap", padding: 16 },
          ]}
        >
          <Icon name="home" />
          <Label style={{ flex: 1 }}>Assess Home-Based Questions</Label>
          <Icon name={expanded ? "up" : "down"} />
        </Pressable>
      </Card>
      {expanded && (
        <>
          <Card>
            <Feedback {...state} />
            <Copy>
              Choose KAYA or DI-KAYA for one or more home-based questions, then tap Submit Observations. Photos are optional and removed after the teacher saves a review.
            </Copy>
            {state.data && !editable && <Notice>{TEACHER_LOCK}</Notice>}
            {!!notice && <Notice>{notice}</Notice>}
            <PeriodTabs
              value={period}
              disabled={busy}
              onChange={(p) => {
                setPeriod(p);
                setNotice("");
              }}
            />
          </Card>
          {editable && !remaining.length && (
            <Notice tone="success">
              All home observations submitted
            </Notice>
          )}
          {remaining.map((domain) => (
            <HomeDomain
              key={`${domain.domain_id}_${period}`}
              domain={domain}
              child={child}
              user={user}
              assessment={state.data!}
              period={period}
              service={service}
              busy={busy}
              target={navigation?.scope === scope && navigation.question.domainId === domain.domain_id ? navigation.question : undefined}
              reveal={reveal}
            />
          ))}
        </>
      )}
      <OverviewSummary
        child={child}
        state={dashboard}
        assessment={state.data}
        insights={insights}
        results={results}
      />
      {photoWarning?.scope === scope && editable && (
        <Dialog title="Mark the questions with photos" close={() => setPhotoWarning(null)}>
          <Copy>{photoWarning.error.message}</Copy>
          {photoWarning.error.questions.map(question => (
            <Card key={question.questionId}>
              <Label>{question.domainName}</Label>
              <Copy>{question.number}. {question.text}</Copy>
              <Button secondary title="Go to question" onPress={() => {
                setPhotoWarning(null);
                setExpanded(true);
                setNavigation({ scope, question });
              }} />
            </Card>
          ))}
          <Button secondary title="Close" onPress={() => setPhotoWarning(null)} />
        </Dialog>
      )}
      {confirming === scope && editable && (
        <Dialog title="Submit Answers" close={() => setConfirming(null)}>
          <Copy>
            Submitted evaluations cannot be changed. Any unanswered questions
            can still be completed later.
          </Copy>
          <Badge icon="checklist">{period} · Home observations</Badge>
          <Button
            secondary
            title="Cancel"
            onPress={() => setConfirming(null)}
          />
          <Button
            title="Submit Answers"
            icon="save"
            disabled={disabled}
            onPress={() => {
              setConfirming(null);
              void submit();
            }}
          />
        </Dialog>
      )}
    </Screen>
  );
}
