import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import HomeOutlined from "@mui/icons-material/HomeOutlined";
import API, { errorMessage } from "../../services/api";
import { useChildren } from "../../hooks/useChildren";

interface Readiness {
  student_id: number;
  student_name: string;
  pre_complete: boolean;
  readiness_note: string;
  allow_parent_predictions: boolean;
  is_published: boolean;
}
interface BaselineDomain {
  domain: string;
  name: string;
  pre_scaled_score: number;
  tier: "Delay" | "Slight Delay" | "Average";
}
interface HomeGuide extends BaselineDomain {
  goal: string;
  home_activity: string;
  practice: string;
  scaffolding: string;
  review_days: number;
  success_check: string;
  source_url: string;
}
interface Prediction {
  student_id: number;
  student_name: string;
  assessment_date: string;
  predicted_post_interpretation: string;
  confidence_percentages: Record<string, number>;
  confidence_percentage: number;
  baseline_domains: BaselineDomain[];
  interventions: HomeGuide[];
  interpretation_note: string;
  research_notice: string;
}
interface ReadinessState {
  studentId: number;
  data: Readiness | null;
  error: string;
}
interface RequestError {
  studentId: number;
  message: string;
}
interface PredictionResultsProps {
  prediction: Prediction;
}
const outcomes = [
  {
    label: "Average Overall Development",
    short: "Average",
    color: "#10b981",
    tone: "success",
  },
  {
    label: "Suggests Slight Delay in Overall Development",
    short: "Slight Delay",
    color: "#f59e0b",
    tone: "warning",
  },
  {
    label: "Suggests Significant Delay in Overall Development",
    short: "Significant Delay",
    color: "#f87171",
    tone: "error",
  },
] as const;
const card = {
  p: 2,
  "@media (min-width: 640px)": { p: 2.5 },
  borderRadius: 3,
  boxShadow: "0 4px 20px rgba(15,23,42,0.05)",
  minWidth: 0,
  overflowWrap: "anywhere",
};
const wrappingChip = {
  maxWidth: "100%",
  height: "auto",
  "& .MuiChip-label": { whiteSpace: "normal", py: 0.5 },
};
const tierColor = (tier: BaselineDomain["tier"]) =>
  tier === "Average"
    ? "success"
    : tier === "Slight Delay"
      ? "warning"
      : "error";

function PredictionResults({ prediction }: PredictionResultsProps) {
  const outcome = outcomes.find(
    (item) => item.label === prediction.predicted_post_interpretation,
  );
  return (
    <Stack
      sx={{ gap: 2, minWidth: 0, "@media (min-width: 640px)": { gap: 3 } }}
      aria-label="Child prediction"
    >
      <Paper elevation={1} sx={card}>
        <Stack
          sx={{
            gap: 2,
            minWidth: 0,
            "@media (min-width: 640px)": {
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            },
          }}
        >
          <Stack sx={{ gap: 2, minWidth: 0 }}>
            <Typography variant="overline" sx={{ color: "text.secondary" }}>
              Predicted Post-Test Outcome
            </Typography>
            <Alert
              severity={outcome?.tone || "info"}
              icon={false}
              sx={{
                borderRadius: 3,
                fontWeight: 600,
                minWidth: 0,
                "& .MuiAlert-message": { minWidth: 0 },
              }}
            >
              {prediction.predicted_post_interpretation}
            </Alert>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              PRE assessment: {prediction.assessment_date}
            </Typography>
          </Stack>
          <Box sx={{ flexShrink: 0 }}>
            <Typography variant="h4" sx={{ fontWeight: 600 }}>
              {prediction.confidence_percentage.toFixed(1)}%
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Model confidence
            </Typography>
          </Box>
        </Stack>
        <Stack
          direction="row"
          role="img"
          aria-label={outcomes
            .map(
              (item) =>
                `${item.short}: ${(prediction.confidence_percentages[item.label] || 0).toFixed(1)}%`,
            )
            .join(", ")}
          sx={{
            mt: 3,
            overflow: "hidden",
            borderRadius: 6,
            width: "100%",
            height: "0.875rem",
            bgcolor: "grey.100",
          }}
        >
          {outcomes.map((item) => (
            <Box
              key={item.label}
              sx={{
                bgcolor: item.color,
                width: `${prediction.confidence_percentages[item.label] || 0}%`,
              }}
            />
          ))}
        </Stack>
        <Stack
          sx={{
            gap: 1,
            mt: 2,
            flexWrap: "wrap",
            alignItems: "flex-start",
            "@media (min-width: 480px)": { flexDirection: "row" },
            "@media (min-width: 640px)": { gap: 2.5, alignItems: "center" },
          }}
        >
          {outcomes.map((item) => (
            <Stack
              key={item.label}
              direction="row"
              sx={{ gap: 1, alignItems: "center" }}
            >
              <Box
                component="span"
                sx={{ color: item.color }}
                aria-hidden="true"
              >
                ●
              </Box>
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                  fontSize: "0.75rem",
                  "@media (min-width: 640px)": { fontSize: "0.875rem" },
                }}
              >
                {item.short}{" "}
                {(prediction.confidence_percentages[item.label] || 0).toFixed(
                  1,
                )}
                %
              </Typography>
            </Stack>
          ))}
        </Stack>
        <Typography
          variant="body2"
          sx={{
            mt: 3,
            color: "#64748b",
            fontSize: "0.75rem",
            lineHeight: 1.625,
          }}
        >
          These are model probabilities, not calibrated clinical confidence or a
          guarantee of future performance.
        </Typography>
        <Typography
          variant="caption"
          sx={{ display: "block", mt: 1, color: "#64748b", lineHeight: 1.625 }}
        >
          {prediction.interpretation_note}
        </Typography>
      </Paper>
      <Stack
        component="section"
        sx={{ gap: 2 }}
        aria-labelledby="parent-baseline-title"
      >
        <Box>
          <Typography
            id="parent-baseline-title"
            component="h2"
            variant="h6"
            sx={{ fontWeight: 600 }}
          >
            Baseline Development Profile
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            PRE scaled scores · planning tiers: ≤3 Delay, 4–6 Slight Delay, ≥7
            Average.
          </Typography>
        </Box>
        {/* Local priorities override the inherited, unlayered parent grid utilities. */}
        <Grid className="grid min-w-0 grid-cols-1! gap-2.5 min-[480px]:grid-cols-2! sm:grid-cols-2! sm:gap-3! md:grid-cols-3! lg:grid-cols-7!">
          {prediction.baseline_domains.map((domain) => (
            <Paper
              key={domain.domain}
              elevation={1}
              sx={{
                ...card,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 1,
                p: 2,
                "@media (min-width: 640px)": { p: 2 },
                "@media (min-width: 1024px)": { p: 1 },
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                  flex: 1,
                  fontSize: "0.8125rem",
                  "@media (min-width: 1024px)": { fontSize: "0.75rem" },
                }}
              >
                {domain.domain === "SE" ? "Social-Emotional" : domain.name}
              </Typography>
              <Typography variant="h4" sx={{ my: 0.5, fontWeight: 600 }}>
                {domain.pre_scaled_score}
              </Typography>
              <Chip
                label={domain.tier}
                color={tierColor(domain.tier)}
                size="small"
                variant="outlined"
                sx={{ ...wrappingChip, fontSize: "0.6875rem" }}
              />
            </Paper>
          ))}
        </Grid>
      </Stack>
      <Paper
        component="section"
        elevation={1}
        sx={card}
        aria-labelledby="parent-guides-title"
      >
        <Stack sx={{ gap: 3 }}>
          <Box>
            <Typography
              id="parent-guides-title"
              component="h2"
              variant="h6"
              sx={{ fontWeight: 600 }}
            >
              Prescriptive Intervention Guides
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
              Small home activities and supportive routines for areas needing
              extra care. These guides follow observed PRE needs independently
              of the prediction. Discuss activities with your child's teacher.
            </Typography>
          </Box>
          {prediction.interventions.length === 0 && (
            <Alert severity="success" sx={{ borderRadius: 3 }}>
              No targeted PRE support activities were identified. Continue
              playful daily routines and check in with your child's teacher.
            </Alert>
          )}
          {prediction.interventions.map((guide) => (
            <Stack
              component="article"
              key={guide.domain}
              sx={{
                gap: 2,
                bgcolor: "#f4faf7",
                borderRadius: 3,
                p: 2,
                minWidth: 0,
                "@media (min-width: 640px)": { p: 2.5 },
                "& strong, & h4": { fontWeight: 700 },
              }}
            >
              <Stack
                direction="row"
                sx={{ gap: 2, alignItems: "center", flexWrap: "wrap" }}
              >
                <HomeOutlined color="primary" />
                <Typography
                  component="h3"
                  variant="subtitle1"
                  sx={{ fontWeight: 600 }}
                >
                  {guide.name}
                </Typography>
                <Chip
                  label={guide.tier}
                  color={tierColor(guide.tier)}
                  size="small"
                  sx={wrappingChip}
                />
              </Stack>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {guide.goal}
              </Typography>
              <Box>
                <Typography component="h4" variant="subtitle2">
                  At home
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {guide.home_activity}
                </Typography>
              </Box>
              <Typography variant="body2">
                <strong>Daily routine:</strong> {guide.practice}
              </Typography>
              <Typography variant="body2">
                <strong>Parenting support:</strong> {guide.scaffolding}
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                <strong>Look for:</strong> {guide.success_check} Review together
                after {guide.review_days} days.
              </Typography>
              <Typography
                component="a"
                href={guide.source_url}
                target="_blank"
                rel="noreferrer"
                variant="caption"
                sx={{
                  color: "primary.main",
                  overflowWrap: "anywhere",
                  alignSelf: "flex-start",
                  py: 0.75,
                  minHeight: "2.75rem",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                Curriculum reference
              </Typography>
            </Stack>
          ))}
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Locally authored guidance aligned at domain level to the DepEd
            Kindergarten Curriculum Guide. Teacher review required; no claim of
            official endorsement or proven treatment effect.
          </Typography>
        </Stack>
      </Paper>
    </Stack>
  );
}

export default function ParentMlInsights() {
  const {
    children,
    child,
    selected,
    select,
    loading,
    error: childrenError,
  } = useChildren();
  const [readiness, setReadiness] = useState<ReadinessState | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [requestError, setRequestError] = useState<RequestError | null>(null);
  const [predicting, setPredicting] = useState<number | null>(null);
  const predictionVersion = useRef(0);
  const predictionController = useRef<AbortController | null>(null);
  const childId = child?.student_id;
  const ready = readiness?.studentId === selected ? readiness.data : null;
  const readinessError =
    readiness?.studentId === selected ? readiness.error : "";
  const canPredict =
    !!ready?.allow_parent_predictions &&
    ready.pre_complete &&
    ready.is_published &&
    !readinessError;
  const activePrediction =
    canPredict && prediction?.student_id === selected ? prediction : null;
  const name =
    ready?.student_name ||
    [child?.first_name, child?.middle_name, child?.last_name]
      .filter(Boolean)
      .join(" ");

  useEffect(() => {
    if (!selected || !childId) return;
    let current = true;
    let version = 0;
    const controller = new AbortController();
    const invalidate = () => {
      ++predictionVersion.current;
      predictionController.current?.abort();
      setPredicting(null);
      setPrediction(null);
    };
    const refresh = async () => {
      const request = ++version;
      try {
        const response = await API.get<Readiness>(
          `/api/ml/parent/readiness/${selected}`,
          { signal: controller.signal },
        );
        if (!current || request !== version) return;
        setReadiness({ studentId: selected, data: response.data, error: "" });
        if (
          !response.data.allow_parent_predictions ||
          !response.data.pre_complete ||
          !response.data.is_published
        )
          invalidate();
      } catch (err) {
        if (!current || request !== version) return;
        setReadiness({
          studentId: selected,
          data: null,
          error: errorMessage(err),
        });
        invalidate();
      }
    };
    void refresh();
    const reload = () => void refresh();
    const timer = window.setInterval(reload, 20000);
    window.addEventListener("focus", reload);
    window.addEventListener("online", reload);
    return () => {
      current = false;
      controller.abort();
      ++predictionVersion.current;
      predictionController.current?.abort();
      setPredicting(null);
      setPrediction(null);
      window.clearInterval(timer);
      window.removeEventListener("focus", reload);
      window.removeEventListener("online", reload);
    };
  }, [selected, childId]);

  const predict = async () => {
    if (!canPredict || predicting === selected) return;
    const studentId = selected;
    const version = ++predictionVersion.current;
    const controller = new AbortController();
    predictionController.current = controller;
    setPredicting(studentId);
    setRequestError(null);
    try {
      const response = await API.post<Prediction>(
        `/api/ml/parent/predict/${studentId}`,
        undefined,
        { signal: controller.signal },
      );
      if (version !== predictionVersion.current) return;
      setPrediction(response.data);
    } catch (err) {
      if (version !== predictionVersion.current) return;
      setPrediction(null);
      setRequestError({ studentId, message: errorMessage(err) });
      // A server rejection may reflect a newly closed adviser permission.
      setReadiness(null);
      try {
        const response = await API.get<Readiness>(
          `/api/ml/parent/readiness/${studentId}`,
          { signal: controller.signal },
        );
        if (version === predictionVersion.current)
          setReadiness({ studentId, data: response.data, error: "" });
      } catch {
        /* Keep access closed until a successful readiness refresh. */
      }
    } finally {
      if (version === predictionVersion.current) setPredicting(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl min-w-0 space-y-3 overflow-x-hidden px-3 py-3 break-words sm:space-y-5 sm:px-6 sm:py-6 [&_.MuiAlert-message]:min-w-0 [&_.MuiAlert-message]:[overflow-wrap:anywhere]">
      <header>
        <h1 className="text-lg! leading-tight! font-bold text-slate-900 sm:text-2xl!">
          Early Performance ML Insights &amp; Prescription Guides
        </h1>
        <p className="mt-1 line-clamp-2 text-xs text-slate-500 sm:line-clamp-none sm:text-sm">
          Explore developmental milestones, possible post-test outcomes, and
          recommended home activities.
        </p>
      </header>
      <details
        className="min-w-0 rounded-lg border border-amber-200/80 bg-amber-50/70 p-2 text-[11px] text-amber-900 sm:p-2.5 sm:text-xs"
        aria-label="Research prototype notice"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-1 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            ⚠️ Educational research prototype only.
          </span>
          <span className="shrink-0 font-medium">[Limits ▾]</span>
        </summary>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Educational research prototype for instructional planning, not a
          formal clinical diagnosis. Research evaluation uses a mostly synthetic
          holdout of 459 records. All 29 observed real POST outcomes were
          Average and contributed generator anchors; there is no independent
          real-world validation. Probabilities are not calibrated clinical
          confidence. Advanced developmental classes are unsupported. Home
          activities do not establish treatment effectiveness.
        </Typography>
      </details>
      {childrenError && (
        <Alert severity="error" sx={{ borderRadius: 3 }}>
          {childrenError}
        </Alert>
      )}
      {loading ? (
        <Stack direction="row" sx={{ gap: 2 }}>
          <CircularProgress size="1.5rem" />
          <Typography>Loading linked children…</Typography>
        </Stack>
      ) : !child ? (
        <Paper sx={card}>
          <Typography>
            No synced children available. Link your enrolled child in Child
            Information to get started.
          </Typography>
        </Paper>
      ) : (
        <>
          <Paper elevation={1} sx={card}>
            <Stack
              sx={{
                gap: 1.5,
                justifyContent: "space-between",
                "@media (min-width: 640px)": {
                  flexDirection: "row",
                  flexWrap: "wrap",
                  alignItems: "center",
                },
              }}
            >
              <Stack
                sx={{
                  gap: 1,
                  minWidth: 0,
                  "@media (min-width: 640px)": { flex: "1 1 12rem" },
                }}
              >
                <Typography
                  variant="overline"
                  sx={{
                    color: "#94a3b8",
                    fontSize: "0.625rem",
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    lineHeight: 1.5,
                    textTransform: "uppercase",
                    "@media (min-width: 640px)": { fontSize: "0.75rem" },
                  }}
                >
                  Your child's developmental insights
                </Typography>
                <Typography
                  component="h2"
                  variant="h6"
                  sx={{
                    color: "#0f172a",
                    fontSize: "1rem",
                    fontWeight: 700,
                    lineHeight: 1.4,
                    overflowWrap: "anywhere",
                    "@media (min-width: 640px)": { fontSize: "1.25rem" },
                  }}
                >
                  {name}
                </Typography>
                {ready && (
                  <Chip
                    sx={{ ...wrappingChip, alignSelf: "flex-start" }}
                    size="small"
                    label={
                      !ready.allow_parent_predictions
                        ? "Adviser Access Restricted"
                        : !ready.pre_complete
                          ? "Not Ready · PRE Incomplete"
                          : !ready.is_published
                            ? "Results Pending Adviser Release"
                            : "Ready for Prediction"
                    }
                    color={
                      !ready.allow_parent_predictions
                        ? "warning"
                        : canPredict
                          ? "success"
                          : "default"
                    }
                  />
                )}
              </Stack>
              <Stack
                sx={{
                  gap: 1.5,
                  minWidth: 0,
                  width: "100%",
                  "@media (min-width: 640px)": {
                    flexDirection: "row",
                    flexWrap: "wrap",
                    alignItems: "center",
                    width: "auto",
                    maxWidth: "100%",
                  },
                }}
              >
                {children.length >= 2 && (
                  <TextField
                    select
                    label="Select child"
                    value={selected}
                    onChange={(event) => select(Number(event.target.value))}
                    size="small"
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      width: "100%",
                      "@media (min-width: 640px)": {
                        width: "auto",
                        minWidth: "10rem",
                        maxWidth: "18rem",
                      },
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 3,
                        minHeight: "2.75rem",
                      },
                      "& .MuiSelect-select": {
                        whiteSpace: "normal",
                        overflowWrap: "anywhere",
                      },
                    }}
                  >
                    {children.map((item) => (
                      <MenuItem
                        key={item.student_id}
                        value={item.student_id}
                        sx={{ whiteSpace: "normal", overflowWrap: "anywhere" }}
                      >
                        {[item.first_name, item.middle_name, item.last_name]
                          .filter(Boolean)
                          .join(" ")}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
                <Button
                  variant="contained"
                  startIcon={
                    predicting === selected ? (
                      <CircularProgress size="1rem" color="inherit" />
                    ) : (
                      <AutoAwesomeRounded />
                    )
                  }
                  disabled={!canPredict || predicting === selected}
                  onClick={() => void predict()}
                  sx={{
                    borderRadius: 2,
                    px: 2,
                    py: 1,
                    fontSize: "0.75rem",
                    fontWeight: 500,
                    gap: 0.75,
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 1px 2px rgb(15 23 42 / 0.08)",
                    whiteSpace: "normal",
                    width: "100%",
                    height: "2.5rem",
                    minHeight: "2.5rem",
                    "& .MuiButton-startIcon": { m: 0 },
                    "& .MuiButton-startIcon > *:first-of-type": {
                      fontSize: "1rem",
                    },
                    "@media (min-width: 640px)": {
                      width: "auto",
                      fontSize: "0.875rem",
                    },
                  }}
                >
                  {predicting === selected
                    ? "Predicting..."
                    : "Predict Post-Test Outcome"}
                </Button>
              </Stack>
            </Stack>
          </Paper>
          {readinessError && (
            <Alert severity="error" sx={{ borderRadius: 3 }}>
              {readinessError}
            </Alert>
          )}
          {requestError?.studentId === selected && (
            <Alert severity="error" sx={{ borderRadius: 3 }}>
              {requestError.message}
            </Alert>
          )}
          {!ready && !readinessError && (
            <Typography sx={{ color: "text.secondary" }}>
              Checking prediction access and PRE readiness…
            </Typography>
          )}
          {ready && !ready.allow_parent_predictions && (
            <Alert severity="warning" sx={{ ...card, bgcolor: "#fff8eb" }}>
              Adviser Access Restricted: Post-test predictions are currently
              disabled by your child's adviser. Please contact the teacher for
              more information.
            </Alert>
          )}
          {ready?.allow_parent_predictions && !ready.pre_complete && (
            <Paper sx={card}>
              <Typography sx={{ color: "text.secondary" }}>
                The baseline PRE assessment for {name} has not been completed
                yet. Once your child's teacher completes the PRE assessment,
                post-test prediction and home guidance activities will become
                available.
              </Typography>
            </Paper>
          )}
          {ready?.allow_parent_predictions &&
            ready.pre_complete &&
            !ready.is_published && (
              <Alert severity="info" sx={{ borderRadius: 3 }}>
                Results Pending Adviser Release: Your child's PRE assessment is
                complete. The adviser must release PRE results before baseline
                scores and home guidance can be shared.
              </Alert>
            )}
          {canPredict && !activePrediction && (
            <Paper sx={card}>
              <Typography sx={{ color: "text.secondary" }}>
                {name}'s baseline assessment is complete. Click 'Predict
                Post-Test Outcome' above to generate their developmental
                insights and recommended home activities.
              </Typography>
            </Paper>
          )}
          {activePrediction && (
            <PredictionResults prediction={activePrediction} />
          )}
        </>
      )}
    </div>
  );
}
