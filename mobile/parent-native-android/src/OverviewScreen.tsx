import React, { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import type { Assessment, Child, Period, User } from "./contracts";
import { session } from "./session";
import { messageOf } from "./sessionCore";
import { drafts, useDraft } from "./drafts";
import { homeKey, HomeObservations } from "./homeObservations";
import type { HomeValues } from "./homeObservations";
import { homeLock, visibleMark, WINDOWS } from "./policy";
import { Feedback, useResource } from "./resources";
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
  const questions = domain.questions
    .filter((q) => q.is_home_based)
    .sort((a, b) => a.sequence_order - b.sequence_order);
  if (!questions.length) return null;
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
          Your draft is saved on this device. Reconnect and submit again. A
          previous submission is unconfirmed. Drafts never send automatically.
          Refresh the saved answers, then submit eligible observations manually.
        </Notice>
      )}
      {!!snapshot?.error && <Notice error>{snapshot.error}</Notice>}
      {expanded &&
        questions.map((question) => {
          const lock = homeLock(child, assessment, question, period);
          const value = snapshot?.values.answers[String(question.question_id)];
          const saved = visibleMark(child, assessment, question, period)
            ? question.answers[period]
            : null;
          return (
            <View
              key={question.question_id}
              style={{ gap: 8, paddingVertical: 8 }}
            >
              <Label>
                {question.sequence_order}. {question.question_text}
              </Label>
              {saved && (
                <Badge
                  icon="check"
                  color={saved === "KAYA" ? "#15803d" : "#b45309"}
                >
                  Saved observation: {saved}
                </Badge>
              )}
              {!!lock && (
                <>
                  <Badge icon="lock" color="#64748b">
                    {question.parent_locked[period]
                      ? question.evaluator_roles[period] === "teacher"
                        ? "Teacher-verified · Locked"
                        : "Submitted · Locked"
                      : "Editing locked"}
                  </Badge>
                  <Copy>{lock}</Copy>
                </>
              )}
              <Copy>Local draft: {value || "Not answered"}</Copy>
              <View style={styles.row}>
                {(["KAYA", "DI-KAYA"] as const).map((answer) => (
                  <Button
                    key={answer}
                    title={answer}
                    icon={answer === "KAYA" ? "check" : "support"}
                    color={answer === "KAYA" ? "#15803d" : "#b45309"}
                    secondary={(value || saved) !== answer}
                    disabled={!ready || !!lock || busy}
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
                {!!value && (
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
  changed,
  header,
  children,
}: {
  child: Child;
  user: User;
  changed: () => void;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const state = useResource<Assessment>(
    `/api/eccd/parent/assessment/${child.student_id}`,
    JSON.stringify(child),
  );
  const [period, setPeriod] = useState<Period>("PRE");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [expanded, setExpanded] = useState(false);
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
      await service.submit(child, state.data, period);
      setNotice("Observations saved. Confirmed answers are now locked.");
      changed();
      const refreshed = await Promise.allSettled([
        state.reload(),
        session.request(`/api/eccd/parent/dashboard-stats/${child.student_id}`),
      ]);
      if (refreshed.some((result) => result.status === "rejected"))
        setNotice(
          "Observations saved. Reconnect and refresh to load the latest dashboard.",
        );
    } catch (error) {
      setNotice(messageOf(error));
    } finally {
      setBusy(false);
    }
  };
  const disabled =
    busy ||
    !state.data ||
    !child.allow_parent_edit_home_based_eccd ||
    !state.data.permissions.allow_parent_edit_home_based_eccd ||
    !state.data.can_edit_home_based ||
    !state.data.parent_assessment_access[WINDOWS[period]];
  return (
    <Screen
      footer={
        expanded && (
          <>
            <Copy>Local drafts · Saved separately from school records</Copy>
            {!!notice && <Notice>{notice}</Notice>}
            <Button
              icon="save"
              title={busy ? "Submitting…" : "Submit Observations"}
              disabled={disabled}
              onPress={() => setConfirming(true)}
            />
          </>
        )
      }
    >
      {header}
      <Card>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Home-Based Observations"
          accessibilityState={{ expanded, disabled: busy }}
          disabled={busy}
          onPress={() => setExpanded((value) => !value)}
          style={[styles.row, { minHeight: 44, flexWrap: "nowrap" }]}
        >
          <Icon name="home" />
          <Label style={{ flex: 1 }}>Home-Based Observations</Label>
          <Icon name={expanded ? "up" : "down"} />
        </Pressable>
        <Copy>
          Everyday moments. Meaningful milestones.{" "}
          {expanded ? "Hide" : "Expand to answer"} the home checklist.
        </Copy>
      </Card>
      {expanded && (
        <>
          <Card>
            <Feedback {...state} />
            <Copy>
              Choose KAYA or DI-KAYA for home-based indicators. You may edit or
              remove local answers before submitting. Saved school observations
              cannot be changed here.
            </Copy>
            <Notice>
              Drafts stay on this device across logout and connection loss.
              Every submission requires a tap on Submit Observations.
            </Notice>
            {state.data &&
              (!child.allow_parent_edit_home_based_eccd ||
              !state.data.permissions.allow_parent_edit_home_based_eccd ||
              !state.data.can_edit_home_based ? (
                <Notice>
                  Home observations are locked by the Class Adviser.
                </Notice>
              ) : !state.data.parent_assessment_access[WINDOWS[period]] ? (
                <Notice>
                  The {period} editing window is closed by the teacher.
                </Notice>
              ) : null)}
            <PeriodTabs
              value={period}
              disabled={busy}
              onChange={(p) => {
                setPeriod(p);
                setNotice("");
              }}
            />
          </Card>
          {state.data?.domains.map((domain) => (
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
      {children}
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
