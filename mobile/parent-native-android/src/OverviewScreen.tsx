import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Assessment, Child, Dashboard, Period, User } from "./contracts";
import { session } from "./session";
import { messageOf } from "./sessionCore";
import { drafts, useDraft } from "./drafts";
import { homeKey, HomeObservations } from "./homeObservations";
import type { HomeValues } from "./homeObservations";
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
}: {
  domain: Assessment["domains"][number];
  child: Child;
  user: User;
  assessment: Assessment;
  period: Period;
  service: HomeObservations;
  busy: boolean;
}) {
  const { snapshot, ready, storageError } = useDraft<HomeValues>(
    homeKey(child.student_id, period, domain.domain_id, user.id),
    user.id,
  );
  const [expanded, setExpanded] = useState(false);
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
              <View style={styles.row}>
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
  const [confirming, setConfirming] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const confirmedIds =
    confirmed[homeScope(user.id, child.student_id, period)] || [];
  const remaining = state.data
    ? remainingHomeDomains(state.data, period, confirmedIds)
    : [];
  const homeCount =
    state.data?.domains.reduce(
      (total, domain) =>
        total + domain.questions.filter((q) => q.is_home_based).length,
      0,
    ) || 0;
  const editable =
    !!state.data &&
    child.allow_parent_edit_home_based_eccd &&
    state.data.permissions.allow_parent_edit_home_based_eccd &&
    state.data.can_edit_home_based &&
    state.data.parent_assessment_access[WINDOWS[period]];
  const service = useMemo(
    () =>
      new HomeObservations(drafts, user.id, child.student_id, (payload) =>
        session.request("/api/eccd/parent/evaluate", "POST", payload),
      ),
    [user.id, child.student_id],
  );
  const submit = async () => {
    if (busy || !state.data) return;
    setBusy(true);
    setNotice("");
    try {
      const saved = await service.submit(
        child,
        state.data,
        period,
        confirmedIds,
      );
      onConfirmed(period, saved.questionIds);
      if (!mounted.current) return;
      setNotice(saved.cleanupWarning || "Observations saved.");
      await Promise.all([state.reload(), dashboard.reload()]);
    } catch (error) {
      if (mounted.current) setNotice(messageOf(error));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const disabled = busy || !editable || !remaining.length;
  const toggle = () => setExpanded((value) => !value);
  return (
    <Screen
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
            onPress={() => setConfirming(true)}
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
              Choose KAYA or DI-KAYA for each home-based question, then tap
              Submit Observations.
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
              {homeCount
                ? "All home observations submitted"
                : "No home-based questions available."}
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
      {confirming && (
        <Dialog title="Submit Answers" close={() => setConfirming(false)}>
          <Copy>
            Submitted evaluations cannot be changed. Any unanswered questions
            can still be completed later.
          </Copy>
          <Badge icon="checklist">{period} · Home observations</Badge>
          <Button
            secondary
            title="Cancel"
            onPress={() => setConfirming(false)}
          />
          <Button
            title="Submit Answers"
            icon="save"
            disabled={disabled}
            onPress={() => {
              setConfirming(false);
              void submit();
            }}
          />
        </Dialog>
      )}
    </Screen>
  );
}
