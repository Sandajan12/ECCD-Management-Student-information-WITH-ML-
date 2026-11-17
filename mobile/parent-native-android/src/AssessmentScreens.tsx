import React, { useContext, useEffect, useRef, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { session } from "./session";
import { messageOf } from "./sessionCore";
import type {
  Assessment,
  Child,
  Dashboard,
  Period,
  Prediction,
  Readiness,
} from "./contracts";
import { PERIODS } from "./contracts";
import { canPredict, released, visibleMark } from "./policy";
import {
  BrandColor,
  Badge,
  Button,
  Card,
  Copy,
  Heading,
  Icon,
  Label,
  Notice,
  PeriodTabs,
  Progress,
  Screen,
  Segments,
  Title,
  styles,
} from "./ui";
import { Feedback, useResource } from "./resources";
import type { Resource } from "./resources";
import {
  checklistDomains,
  overviewStatus,
  TEACHER_LOCK,
  statusColor,
  tierColor,
} from "./presentation";

export function OverviewSummary({
  child,
  state,
  assessment,
  insights,
  results,
}: {
  child: Child;
  state: Resource<Dashboard>;
  assessment: Assessment | null;
  insights: () => void;
  results: () => void;
}) {
  const data = state.data,
    primary = useContext(BrandColor);
  const [progressExpanded, setProgressExpanded] = useState(false);
  const status = overviewStatus(child, data, assessment);
  const allowed = status === "available";
  const placeholder =
    status === "locked"
      ? TEACHER_LOCK
      : status === "empty"
        ? "Not evaluated"
        : "Loading assessment…";
  return (
    <>
      <Card>
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <Heading title="ECCD Phase" icon="checklist" />
          <Badge icon={status === "locked" ? "lock" : "clock"}>
            {allowed ? data?.currentPhase : placeholder}
          </Badge>
        </View>
        <Feedback {...state} />
      </Card>
      {data && (
        <>
          <Card>
            <Copy>Overall Status</Copy>
            <Badge
              icon={allowed ? "check" : "lock"}
              color={allowed ? statusColor(data.overallStatusColor) : "#64748b"}
            >
              {allowed ? data.overallStatus : placeholder}
            </Badge>
            {allowed ? (
              <>
                <Title>{data.interpretation || data.overallStatus}</Title>
                <Copy>
                  KAYA: {data.totalKaya ?? "—"} · DI-KAYA:{" "}
                  {data.totalDiKaya ?? "—"}
                </Copy>
                {data.assessmentMastered && (
                  <Notice tone="success">
                    All indicators in this assessment have been mastered.
                  </Notice>
                )}
              </>
            ) : null}
          </Card>
          <Card>
            <Icon name="star" color={primary} />
            <Copy>Excels In · Strongest Area</Copy>
            <Title style={{ fontSize: 16 }}>
              {allowed ? data.excelsIn : placeholder}
            </Title>
          </Card>
          <Card>
            <Icon name="support" color="#b45309" />
            <Copy>Needs Support In</Copy>
            <Title style={{ fontSize: 16 }}>
              {allowed ? data.needsSupportIn : placeholder}
            </Title>
          </Card>
        </>
      )}
      <Card style={{ borderLeftWidth: 3, borderLeftColor: primary }}>
        <Heading
          title="Early Developmental Insights & Home Activities"
          icon="insights"
        />
        <Button title="View ML Insights" icon="insights" onPress={insights} />
      </Card>
      <Card>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: progressExpanded }}
          onPress={() => setProgressExpanded((value) => !value)}
          style={[styles.row, { minHeight: 44, flexWrap: "nowrap" }]}
        >
          <Icon name="checklist" />
          <Label style={{ flex: 1 }}>Assessment Progress</Label>
          <Icon name={progressExpanded ? "up" : "down"} />
        </Pressable>
        {progressExpanded && !allowed && <Notice>{placeholder}</Notice>}
        {progressExpanded &&
          allowed &&
          data?.domainCards.map((domain) => (
            <Card key={domain.domain_id}>
              <Label>{domain.domain_name}</Label>
              <View style={[styles.row, { justifyContent: "space-between" }]}>
                <Copy>{domain.scoreText}</Copy>
                <Badge color={statusColor(domain.statusColor)}>
                  {domain.statusText}
                </Badge>
              </View>
              <Progress
                value={domain.progress}
                color={statusColor(domain.statusColor)}
                label={`${domain.domain_name} completion`}
              />
              <Copy>{domain.progress ?? "—"}% completion</Copy>
            </Card>
          ))}
      </Card>
      <Button
        secondary
        icon="checklist"
        title="View ECCD Checklist"
        onPress={results}
      />
    </>
  );
}
export function ResultsTab({
  child,
  refreshChildren,
}: {
  child: Child;
  refreshChildren: () => Promise<void>;
}) {
  const state = useResource<Assessment>(
    `/api/eccd/parent/assessment/${child.student_id}`,
    JSON.stringify(child),
  );
  const [period, setPeriod] = useState<Period>("PRE"),
    [expanded, setExpanded] = useState<number | null>(null);
  const [tab, setTab] = useState<"official" | "checklist">("official");
  const data = state.data;
  const domains = data ? checklistDomains(child, data, period) : [];
  return (
    <Screen
      onRefresh={async () => {
        await Promise.all([state.reload(), refreshChildren()]);
      }}
    >
      <Heading title="ECCD Assessment & Results" icon="checklist" />
      <Feedback {...state} />
      <Segments
        options={[
          { value: "official", label: "Official Evaluation Summary" },
          { value: "checklist", label: "ECCD Checklists" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {data &&
        (tab === "official" ? (
          <>
            {PERIODS.map((p) => {
              const summary = data.summary[p],
                allowed = released(child, data, p);
              return (
                <Card key={p} style={{ borderRadius: 16 }}>
                  <View
                    style={[styles.row, { justifyContent: "space-between" }]}
                  >
                    <Label>
                      {p === "PRE"
                        ? "Pretest"
                        : p === "MID"
                          ? "Midtest"
                          : "Posttest"}{" "}
                      · {p}
                    </Label>
                    <Badge
                      icon={allowed ? "check" : "lock"}
                      color={
                        allowed && summary.isEvaluated ? "#15803d" : "#64748b"
                      }
                    >
                      {!allowed
                        ? TEACHER_LOCK
                        : summary.isEvaluated
                          ? "Evaluated"
                          : "Not Evaluated"}
                    </Badge>
                  </View>
                  {!allowed ? (
                    <View
                      style={{
                        alignItems: "center",
                        gap: 10,
                        paddingVertical: 20,
                      }}
                    >
                      <Icon name="lock" size={36} />
                      <Label style={styles.center}>{TEACHER_LOCK}</Label>
                    </View>
                  ) : (
                    <>
                      <Metric
                        label="Assessment Date"
                        value={summary.assessmentDate}
                      />
                      <Metric label="Decimal Age" value={summary.decimalAge} />
                      <Metric
                        label="Standard Score"
                        value={summary.standardScore}
                      />
                      <Metric
                        label="Sum of Scaled Scores"
                        value={summary.sumOfScaledScores}
                      />
                      <Notice>
                        {summary.interpretation || "Evaluation Not Started"}
                      </Notice>
                      {Object.keys(summary.rawScores || {}).map((code) => (
                        <Copy key={code}>
                          {code} · Raw {summary.rawScores?.[code] ?? "—"} ·
                          Scaled {summary.scaledScores?.[code] ?? "—"}
                        </Copy>
                      ))}
                    </>
                  )}
                </Card>
              );
            })}
            <Card>
              <Heading title="DepEd Official ECCD Summary Matrix" />
              <View style={styles.row}>
                <Label style={{ flex: 2 }}>Domain</Label>
                {PERIODS.map((p) => (
                  <Label key={p} style={{ flex: 1, textAlign: "center" }}>
                    {p}
                  </Label>
                ))}
              </View>
              {data.matrix.map((row) => (
                <View
                  key={row.domain_id}
                  style={[
                    styles.row,
                    {
                      flexWrap: "nowrap",
                      borderTopWidth: 1,
                      borderTopColor: "#f1f5f9",
                      paddingTop: 10,
                    },
                  ]}
                >
                  <Copy style={{ flex: 2, color: "#333333" }}>
                    {row.domain_name}
                  </Copy>
                  {PERIODS.map((p) => (
                    <View key={p} style={{ flex: 1, alignItems: "center" }}>
                      {released(child, data, p) ? (
                        <Label>{row.scores[p] ?? "—"}</Label>
                      ) : (
                        <Icon name="lock" size={16} />
                      )}
                    </View>
                  ))}
                </View>
              ))}
            </Card>
          </>
        ) : (
          <>
            <PeriodTabs value={period} onChange={setPeriod} />
            {!(
              child.allow_parent_view_eccd_marks &&
              data.permissions.allow_parent_view_eccd_marks &&
              data.allow_parent_view_eccd_marks
            ) && <Notice>{TEACHER_LOCK}</Notice>}
            {!domains.length && (
              <Notice>No indicators available.</Notice>
            )}
            {domains.map((domain) => (
              <Card key={domain.domain_id}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    expanded: expanded === domain.domain_id,
                  }}
                  onPress={() =>
                    setExpanded(
                      expanded === domain.domain_id ? null : domain.domain_id,
                    )
                  }
                  style={[styles.row, { flexWrap: "nowrap", minHeight: 44 }]}
                >
                  <Icon name="checklist" />
                  <Label style={{ flex: 1 }}>{domain.domain_name}</Label>
                  <Badge>{domain.questions.length}</Badge>
                  <Icon name={expanded === domain.domain_id ? "up" : "down"} />
                </Pressable>
                {expanded === domain.domain_id &&
                  domain.questions.map((q) => {
                    const visible = visibleMark(child, data, q, period);
                    return (
                      <View
                        key={q.question_id}
                        style={{
                          gap: 8,
                          paddingVertical: 12,
                          borderTopWidth: 1,
                          borderTopColor: "#f1f5f9",
                        }}
                      >
                        <Label>
                          {q.sequence_order}. {q.question_text}
                        </Label>
                        <Badge
                          icon={q.is_home_based ? "home" : "school"}
                          color="#64748b"
                        >
                          {q.is_home_based
                            ? "Home-based indicator"
                            : "School indicator"}
                        </Badge>
                        <Badge
                          icon={visible ? "check" : "lock"}
                          color={
                            visible && q.answers[period] === "KAYA"
                              ? "#15803d"
                              : visible && q.answers[period] === "DI-KAYA"
                                ? "#b45309"
                                : "#64748b"
                          }
                        >
                          {visible
                            ? (q.answers[period] ?? "Not yet marked")
                            : TEACHER_LOCK}
                        </Badge>
                        {visible && (
                          <>
                            <Copy>
                              {q.evaluator_roles[period]
                                ? `Recorded by ${q.evaluator_roles[period]}`
                                : "Not evaluated"}
                            </Copy>
                            {!!q.parent_submitted_at[period] && (
                              <Copy>
                                Parent submitted:{" "}
                                {q.parent_submitted_at[period]}
                              </Copy>
                            )}
                            {!!q.teacher_marked_at[period] && (
                              <Copy>
                                Teacher saved: {q.teacher_marked_at[period]}
                              </Copy>
                            )}
                          </>
                        )}
                      </View>
                    );
                  })}
              </Card>
            ))}
          </>
        ))}
      {data && (
        <Card>
          <Label>Teacher access</Label>
          <Copy>
            Student information:{" "}
            {child.allow_parent_view_student_info &&
            data.permissions.allow_parent_view_student_info
              ? "Available"
              : TEACHER_LOCK}
          </Copy>
          <Copy>
            Profile editing:{" "}
            {child.allow_parent_edit_student_info &&
            data.permissions.allow_parent_edit_student_info
              ? "Allowed"
              : TEACHER_LOCK}
          </Copy>
          <Copy>
            Home observations:{" "}
            {child.allow_parent_edit_home_based_eccd &&
            data.permissions.allow_parent_edit_home_based_eccd &&
            data.can_edit_home_based
              ? "Enabled in open period windows"
              : TEACHER_LOCK}
          </Copy>
          <Copy>
            Prediction access:{" "}
            {child.allow_parent_predictions &&
            data.permissions.allow_parent_predictions
              ? "Enabled; PRE readiness and release also required"
              : TEACHER_LOCK}
          </Copy>
        </Card>
      )}
    </Screen>
  );
}
function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <View
      style={[
        styles.row,
        {
          justifyContent: "space-between",
          borderBottomWidth: 1,
          borderBottomColor: "#f1f5f9",
          paddingBottom: 8,
        },
      ]}
    >
      <Copy>{label}</Copy>
      <Label>{value ?? "—"}</Label>
    </View>
  );
}
export function InsightsTab({
  child,
  refreshChildren,
}: {
  child: Child;
  refreshChildren: () => Promise<void>;
}) {
  const state = useResource<Readiness>(
    `/api/ml/parent/readiness/${child.student_id}`,
    JSON.stringify(child),
  );
  const [prediction, setPrediction] = useState<Prediction | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [expanded, setExpanded] = useState<string | null>(null);
  const mounted = useRef(true),
    version = useRef(0);
  useEffect(
    () => () => {
      mounted.current = false;
      version.current++;
    },
    [],
  );
  const allowed = state.data ? canPredict(child, state.data) : false;
  useEffect(() => {
    version.current++;
    setPrediction(null);
  }, [allowed, child.student_id]);
  const predict = async () => {
    if (!allowed || busy) return;
    const request = ++version.current;
    setBusy(true);
    setError("");
    try {
      const result = await session.request<Prediction>(
        `/api/ml/parent/predict/${child.student_id}`,
        "POST",
      );
      if (mounted.current && request === version.current) setPrediction(result);
    } catch (e) {
      if (mounted.current && request === version.current)
        setError(messageOf(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <Screen
      onRefresh={async () => {
        await Promise.all([state.reload(), refreshChildren()]);
      }}
    >
      <Heading title="Early Developmental Insights" icon="insights" />
      <Card>
        <Feedback {...state} />
        <Badge
          color={allowed ? "#15803d" : "#b45309"}
          icon={allowed ? "check" : "lock"}
        >
          {allowed
            ? "PRE ready for insights"
            : !child.allow_parent_predictions ||
                !child.allow_parent_view_eccd_pre ||
                (state.data &&
                  (!state.data.allow_parent_predictions ||
                    !state.data.is_published))
              ? TEACHER_LOCK
              : "PRE assessment incomplete"}
        </Badge>
        {state.data &&
          child.allow_parent_predictions &&
          child.allow_parent_view_eccd_pre &&
          state.data.allow_parent_predictions &&
          state.data.is_published && <Copy>{state.data.readiness_note}</Copy>}
        <Button
          icon="insights"
          title={busy ? "Generating insights…" : "Generate insights"}
          disabled={!allowed || busy}
          onPress={() => void predict()}
        />
        {!!error && <Notice error>{error}</Notice>}
      </Card>
      {allowed && prediction && (
        <>
          <Card>
            <Copy>Predicted Post-Test Outcome</Copy>
            <Title style={{ fontSize: 24, lineHeight: 34 }}>
              {prediction.predicted_post_interpretation ?? "Unavailable"}
            </Title>
            <Badge icon="insights">Research prediction · POST</Badge>
            {Object.entries(prediction.confidence_percentages).map(
              ([label, value]) => (
                <View key={label} style={{ gap: 6 }}>
                  <View
                    style={[styles.row, { justifyContent: "space-between" }]}
                  >
                    <Copy>{label}</Copy>
                    <Label>{value.toFixed(1)}%</Label>
                  </View>
                  <Progress value={value} label={`${label} confidence`} />
                </View>
              ),
            )}
            <Notice>{prediction.interpretation_note}</Notice>
            <Notice tone="warning">{prediction.research_notice}</Notice>
          </Card>
          <Heading title="Baseline Development Profile" />
          {prediction.baseline_domains.map((d) => (
            <Card key={d.domain}>
              <Copy>{d.name}</Copy>
              <View style={[styles.row, { justifyContent: "space-between" }]}>
                <Title style={{ fontSize: 28, lineHeight: 38 }}>
                  {d.pre_scaled_score}
                </Title>
                <Badge color={tierColor(d.tier)}>{d.tier}</Badge>
              </View>
            </Card>
          ))}
          <Heading title="Prescriptive Intervention Guides" />
          {!prediction.interventions.length && (
            <Notice tone="success">
              Continue playful daily routines and check in with your child’s
              teacher.
            </Notice>
          )}
          {prediction.interventions.map((d, index) => (
            <Card
              key={`${d.domain}_${index}`}
              style={{ backgroundColor: "#f4faf7" }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: expanded === d.domain }}
                onPress={() =>
                  setExpanded(expanded === d.domain ? null : d.domain)
                }
                style={[styles.row, { minHeight: 44 }]}
              >
                <Icon name="home" />
                <Label style={{ flex: 1 }}>{d.name}</Label>
                <Icon name={expanded === d.domain ? "up" : "down"} />
              </Pressable>
              <Badge color={tierColor(d.tier)}>{d.tier}</Badge>
              <Copy>{d.goal}</Copy>
              {expanded === d.domain && (
                <>
                  <Label>At home</Label>
                  <Copy>{d.home_activity}</Copy>
                  <Label>Practice</Label>
                  <Copy>{d.practice}</Copy>
                  <Label>Support</Label>
                  <Copy>{d.scaffolding}</Copy>
                  <Badge icon="clock">Review after {d.review_days} days</Badge>
                  <Label>Success check</Label>
                  <Copy>{d.success_check}</Copy>
                  {d.source_url.startsWith("https://") && (
                    <Button
                      secondary
                      title="Read activity source"
                      onPress={() => {
                        void Linking.openURL(d.source_url).catch((e) =>
                          setError(messageOf(e)),
                        );
                      }}
                    />
                  )}
                </>
              )}
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
