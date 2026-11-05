import React, { useState, useEffect, useRef } from "react";
import { isAxiosError } from "axios";
import type { SelectChangeEvent } from "@mui/material";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Avatar,
  Select,
  MenuItem,
  Grid,
  Snackbar,
  Stack,
} from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import HomeWorkIcon from "@mui/icons-material/HomeWork";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import TimelineIcon from "@mui/icons-material/Timeline";
import { useNavigate } from "react-router-dom";
import api, { errorMessage, isNetworkError } from "../../services/api";
import type { ParentLinkResponse } from "../../types";
import { useChildren } from "../../hooks/useChildren";
import { useParentAssessment } from "../../hooks/useParentAssessment";
import HomeAssessmentForm from "../../components/parent/HomeAssessmentForm";
import { PERIODS, PERIOD_LABELS } from "../../types";
import { useAuth } from "../../context/AuthContext";
import { userDisplayName } from "../../utils/displayName";
import {
  confirmDraft,
  readDraft,
  storeDraft,
  type Draft,
} from "../../utils/drafts";
import type {
  ChatMessage,
  Contact,
  DomainProgress,
  ParentStats,
  Answer,
  Period,
  Student,
  SessionUser,
} from "../../types";

interface HomeDraftValues {
  answers: Record<string, Answer>;
}

function parentGreeting(
  user: SessionUser | null,
  child: Student | undefined,
): string {
  // Match the synced account holder, excluding family-only records.
  const accountName = child?.parent_names?.trim().toLocaleLowerCase();
  const matches = child?.parents?.filter(
    (parent) => parent.fullname?.trim().toLocaleLowerCase() === accountName,
  );
  const parentName =
    accountName && matches?.length === 1 ? matches[0].fullname?.trim() : "";
  const displayName = userDisplayName(user, parentName || "");
  return displayName ? `Welcome back, ${displayName}!` : "Welcome back!";
}

const primaryColor = "var(--primary-color)";
const primaryTint = "color-mix(in srgb, var(--primary-color) 10%, white)";

const periodFlags = {
  PRE: { view: "allow_parent_view_eccd_pre" },
  MID: { view: "allow_parent_view_eccd_mid" },
  POST: { view: "allow_parent_view_eccd_post" },
} as const;

const surfaceSx = {
  minWidth: 0,
  height: "100%",
  borderRadius: 3,
  bgcolor: "white",
  color: "#0f172a",
  border: "1px solid rgba(226,232,240,0.8)",
  boxShadow: "0 2px 8px rgba(15,23,42,0.03)",
};
const contentSx = {
  p: { xs: 1.75, sm: 2.5 },
  "&:last-child": { pb: { xs: 1.75, sm: 2.5 } },
};
const actionSx = {
  width: { xs: "100%", sm: "auto" },
  minHeight: 40,
  borderRadius: 3,
  textTransform: "none",
  fontWeight: 600,
  whiteSpace: "normal",
  bgcolor: primaryColor,
  color: "#fff",
  boxShadow: "0 2px 4px rgba(15,23,42,0.08)",
  transition: "opacity 150ms ease, transform 150ms ease",
  "&:hover": { bgcolor: primaryColor, opacity: 0.9 },
  "&:active": { transform: "scale(0.98)" },
  "&:focus-visible": { outline: `2px solid ${primaryColor}`, outlineOffset: 3 },
  "&.Mui-disabled": { bgcolor: "#e2e8f0", color: "#64748b", boxShadow: "none" },
  "@media (max-width: 639.95px)": { width: "100%" },
};
const titleSx = { fontSize: "1.125rem", fontWeight: 600, color: "#0f172a" };

const linkFeedback = (status?: ParentLinkResponse["status"]): string =>
  status === "SYNCED"
    ? "Your child is now connected to your account."
    : status === "PENDING"
      ? "Link request submitted. Your child's teacher must approve it before records become available."
      : "Link request saved. Your child's connection has been refreshed.";

interface RecentMessage {
  message_id: number;
  senderName: string;
  sender_role: string;
  message_body: string;
  sent_at: string;
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const roster = useChildren();
  const linkedChildren = roster.children;
  const activeChild = roster.child;
  const assessment = useParentAssessment(activeChild);
  const activeChildIndex = Math.max(
    0,
    linkedChildren.findIndex((child) => child.student_id === roster.selected),
  );
  const loading = roster.loading;
  const owner = user?.id || 0;
  const linkKey = `ames_draft_${owner}_parent_link`;
  const [lrnModalOpen, setLrnModalOpen] = useState<boolean>(false);
  const [lrnNumber, setLrnValue] = useState<string>(
    () => readDraft<string>(linkKey)?.values ?? "",
  );
  const [error, setError] = useState<string>("");
  const [linkNotice, setLinkNotice] = useState<string>("");
  const [isLinking, setIsLinking] = useState<boolean>(false);
  const linkingLock = useRef(false);
  const linkRevision = useRef("");
  const [domains, setDomains] = useState<DomainProgress[]>([]);
  const [dashboardStats, setDashboardStats] = useState<ParentStats | null>(
    null,
  );
  const [recentMessages, setRecentMessages] = useState<RecentMessage[]>([]);
  const [hydratedChild, setHydratedChild] = useState<number>(0);
  const requestVersion = useRef(0);
  const setLrnNumber = (value: string) => {
    setLrnValue(value);
    linkRevision.current = crypto.randomUUID();
    storeDraft(linkKey, {
      owner_id: owner,
      values: value,
      revision: linkRevision.current,
      is_pending_sync: false,
    });
  };
  useEffect(() => {
    setLrnValue(readDraft<string>(linkKey)?.values ?? "");
  }, [linkKey]);
  useEffect(() => {
    if (!roster.loading && !roster.children.length) {
      setLrnModalOpen(true);
      setError(roster.error);
    }
  }, [roster.loading, roster.children.length, roster.error]);
  useEffect(() => {
    const version = ++requestVersion.current;
    const id = activeChild?.student_id;
    setDomains([]);
    setDashboardStats(null);
    setRecentMessages([]);
    setHydratedChild(0);
    if (!id) return;
    const load = async () => {
      const results = await Promise.allSettled([
        api.get<ParentStats>(`/api/eccd/parent/dashboard-stats/${id}`),
        api.get<DomainProgress[]>(`/api/eccd/parent/domains-progress/${id}`),
        api.get<{ myId: number | null; contacts: Contact[] }>(
          "/api/messages/contacts",
        ),
      ]);
      if (version !== requestVersion.current) return;
      const [stats, progress, contacts] = results;
      if (stats.status === "fulfilled") setDashboardStats(stats.value.data);
      if (progress.status === "fulfilled") setDomains(progress.value.data);
      setHydratedChild(id);
      if (contacts.status === "fulfilled" && contacts.value.data.myId) {
        const parentId = contacts.value.data.myId;
        const adviser = [activeChild.teacher_fname, activeChild.teacher_lname]
          .filter(Boolean)
          .join(" ")
          .trim()
          .toLowerCase();
        const all = contacts.value.data.contacts;
        const matching = all.filter(
          (contact) =>
            contact.name
              .replace(/^Teacher\s+/i, "")
              .trim()
              .toLowerCase() === adviser,
        );
        const relevant = matching.length ? matching : all;
        const histories = await Promise.allSettled(
          relevant.map(async (contact) => {
            const response = await api.get<ChatMessage[]>(
              "/api/messages/history",
              { params: { teacher_id: contact.id, parent_id: parentId } },
            );
            return response.data.map((message) => ({
              message_id: message.message_id,
              senderName:
                message.sender_role === "teacher" ? contact.name : "You",
              sender_role: message.sender_role,
              message_body: message.body,
              sent_at: message.created_at,
            }));
          }),
        );
        if (version !== requestVersion.current) return;
        setRecentMessages(
          histories
            .flatMap((result) =>
              result.status === "fulfilled" ? result.value : [],
            )
            .filter((message) => message.sender_role === "teacher")
            .sort(
              (a, b) =>
                Date.parse(b.sent_at) - Date.parse(a.sent_at) ||
                b.message_id - a.message_id,
            )
            .slice(0, 2),
        );
      }
    };
    void load();
    return () => {
      ++requestVersion.current;
    };
  }, [activeChild]);
  const handleLinkLrn = async () => {
    if (linkingLock.current) return;
    const lrn = lrnNumber.trim();
    if (!/^\d{12}$/.test(lrn)) {
      setError("Please enter a valid 12-digit LRN.");
      return;
    }
    linkingLock.current = true;
    setIsLinking(true);
    setError("");
    const draft: Draft<string> = {
      owner_id: owner,
      values: lrnNumber,
      revision: crypto.randomUUID(),
      is_pending_sync: true,
      request: {
        path: "/api/parents/children/link",
        method: "post",
        data: { lrn_number: lrn },
      },
    };
    linkRevision.current = draft.revision;
    storeDraft(linkKey, draft);
    try {
      if (!navigator.onLine) {
        setError(
          "Your draft is saved on this device. Reconnect and submit again.",
        );
        return;
      }
      const response = await api.post<ParentLinkResponse>(
        draft.request!.path,
        draft.request!.data,
      );
      if (response.status !== 200 && response.status !== 201)
        throw new Error("The server did not confirm this link.");
      confirmDraft(linkKey, draft.revision);
      setLinkNotice(linkFeedback(response.data.status));
      if (
        !readDraft<string>(linkKey) &&
        linkRevision.current === draft.revision
      ) {
        setLrnValue("");
        setLrnModalOpen(false);
      }
      await roster.refresh();
    } catch (err) {
      if (
        isNetworkError(err) ||
        (isAxiosError(err) && (err.response?.status || 0) >= 500)
      )
        setError(
          "Your draft is saved on this device. Reconnect and submit again.",
        );
      else {
        if (readDraft<string>(linkKey)?.revision === draft.revision)
          storeDraft(linkKey, {
            ...draft,
            is_pending_sync: false,
            error: errorMessage(err),
          });
        setError(errorMessage(err));
      }
    } finally {
      linkingLock.current = false;
      setIsLinking(false);
    }
  };
  const handleChildChange = (event: SelectChangeEvent<number>) => {
    const child = linkedChildren[Number(event.target.value)];
    if (child) roster.select(child.student_id);
  };
  const assessmentData = assessment.data;
  const editablePeriods = assessment.editablePeriods;
  const isHomeAssessmentOpen = assessment.hasOpenPeriod;
  const visibleStats =
    hydratedChild === activeChild?.student_id ? dashboardStats : null;
  const childName =
    activeChild?.full_name ||
    [activeChild?.first_name, activeChild?.middle_name, activeChild?.last_name]
      .filter(Boolean)
      .join(" ");
  const homeQuestions = (assessmentData?.domains ?? []).flatMap((domain) =>
    domain.questions.filter((question) => question.is_home_based === true),
  );
  // Count only server-confirmed observations as submitted. Drafts remain untouched.
  const pendingHomeCount = editablePeriods.reduce(
    (total, period) =>
      total +
      homeQuestions.filter((question) => {
        const draft = readDraft<HomeDraftValues>(
          `eccd_draft_${activeChild?.student_id}_${period}_${question.domain_id}_home_${owner}`,
        );
        const saved = question.answers[period];
        const local =
          draft?.owner_id === owner
            ? draft.values.answers[question.question_id]
            : undefined;
        return !saved || (local !== undefined && local !== saved);
      }).length,
    0,
  );
  const periodStatus = (period: Period): string => {
    if (!assessmentData)
      return assessment.error ? "Status unavailable" : "Loading status…";
    const summary = assessmentData.summary?.[period];
    if (
      !activeChild?.[periodFlags[period].view] ||
      !assessmentData.permissions?.[periodFlags[period].view] ||
      !summary?.isReleased ||
      !summary.is_published
    )
      return "Results Pending Adviser Release";
    if (!assessmentData.allow_parent_view_eccd_marks)
      return "Completion hidden by class adviser";
    const questions = assessmentData.domains.flatMap(
      (domain) => domain.questions,
    );
    if (!questions.length) return "Not configured yet";
    const count = questions.filter(
      (question) =>
        question.answers[period] === "KAYA" ||
        question.answers[period] === "DI-KAYA",
    ).length;
    // Require every actual answer; rounded domain percentages alone can imply completion.
    const progressKey = {
      PRE: "pre_progress",
      MID: "mid_progress",
      POST: "post_progress",
    } as const;
    const progress = domains.map((domain) => domain[progressKey[period]]);
    if (count === questions.length)
      return progress.length && progress.every((value) => value === 100)
        ? "Complete"
        : "Status unavailable";
    return count > 0 || summary.isEvaluated ? "In Progress" : "Upcoming";
  };
  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          p: 4,
          bgcolor: "#f8fafc",
        }}
      >
        <CircularProgress sx={{ color: primaryColor }} />
      </Box>
    );
  }

  return (
    <Stack
      sx={{
        width: "100%",
        minWidth: 0,
        px: 1.75,
        py: 2,
        gap: 1.75,
        overflowX: "hidden",
        overflowWrap: "anywhere",
        bgcolor: "#f8fafc",
        color: "#0f172a",
      }}
    >
      <Stack sx={{ gap: 0.75, alignItems: "flex-start" }}>
        <Typography
          component="h1"
          sx={{ ...titleSx, fontSize: { xs: "1.125rem", sm: "1.5rem" } }}
        >
          {parentGreeting(user, activeChild)}
        </Typography>
        <Typography sx={{ fontSize: "0.75rem", color: "#64748b" }}>
          Small steps today. Growing confidence for tomorrow.
        </Typography>
        <Typography
          component="span"
          sx={{
            fontSize: "0.75rem",
            color: primaryColor,
            bgcolor: primaryTint,
            px: 1.25,
            py: 0.5,
            borderRadius: 3,
          }}
        >
          {activeChild?.school_year
            ? "SY " + activeChild.school_year.replace("-", "–") + " · "
            : ""}
          Kindergarten
        </Typography>
      </Stack>

      <Card sx={surfaceSx}>
        <CardContent sx={contentSx}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            sx={{ gap: 2, alignItems: { xs: "stretch", md: "center" } }}
          >
            <Stack
              direction="row"
              sx={{ gap: 1.5, alignItems: "flex-start", flex: 1, minWidth: 0 }}
            >
              <Avatar
                sx={{
                  bgcolor: primaryTint,
                  color: primaryColor,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {activeChild?.first_name?.charAt(0).toUpperCase() || "?"}
              </Avatar>
              <Stack sx={{ gap: 0.5, minWidth: 0, flex: 1 }}>
                <Typography component="h2" sx={titleSx}>
                  {childName || "Awaiting Connection…"}
                </Typography>
                {activeChild && (
                  <Stack sx={{ gap: 0.5, color: "#64748b" }}>
                    <Typography sx={{ fontSize: "0.75rem" }}>
                      {activeChild.section_name || "Section not assigned"}
                    </Typography>
                    <Typography sx={{ fontSize: "0.75rem" }}>
                      Adviser:{" "}
                      {activeChild.teacher_lname
                        ? "Tr. " + activeChild.teacher_lname
                        : activeChild.adviser_name || "Not assigned"}
                    </Typography>
                    <Typography
                      sx={{ fontSize: "0.75rem", letterSpacing: "0.04em" }}
                    >
                      LRN: {activeChild.masked_lrn}
                    </Typography>
                  </Stack>
                )}
              </Stack>
            </Stack>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              sx={{
                gap: 1.25,
                minWidth: 0,
                "@media (max-width: 639.95px)": {
                  flexDirection: "column",
                  alignItems: "stretch",
                },
                alignItems: { xs: "stretch", sm: "flex-end" },
                width: {
                  xs: "100%",
                  md: linkedChildren.length > 1 ? "45%" : "auto",
                },
              }}
            >
              {linkedChildren.length > 1 && (
                <Stack sx={{ gap: 0.5, flex: 1, minWidth: 0 }}>
                  <Typography
                    component="label"
                    htmlFor="dashboard-child"
                    sx={{ fontSize: "0.75rem", color: "#64748b" }}
                  >
                    {linkedChildren.length} children synced · Select Child
                  </Typography>
                  <Select
                    id="dashboard-child"
                    fullWidth
                    value={activeChildIndex}
                    onChange={handleChildChange}
                    size="small"
                    inputProps={{ "aria-label": "Select Child" }}
                    sx={{
                      minWidth: 0,
                      minHeight: 40,
                      borderRadius: 3,
                      "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                        borderColor: primaryColor,
                      },
                    }}
                    MenuProps={{
                      slotProps: {
                        paper: {
                          sx: {
                            "& .MuiMenuItem-root.Mui-selected": {
                              bgcolor: primaryTint,
                              "&:hover": { bgcolor: primaryTint },
                            },
                          },
                        },
                      },
                    }}
                  >
                    {linkedChildren.map((child, index) => (
                      <MenuItem
                        key={child.student_id}
                        value={index}
                        sx={{ whiteSpace: "normal", overflowWrap: "anywhere" }}
                      >
                        {child.first_name} {child.last_name} ({child.masked_lrn}
                        )
                      </MenuItem>
                    ))}
                  </Select>
                </Stack>
              )}
              <Button
                variant="contained"
                onClick={() => setLrnModalOpen(true)}
                sx={{ ...actionSx, flexShrink: 0 }}
              >
                SYNC
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {activeChild && (
        <>
          <Grid
            container
            spacing={2}
            aria-label="Quick status"
            sx={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr)",
              "@media (min-width: 640px)": {
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              },
            }}
          >
            <Grid sx={{ minWidth: 0 }}>
              <Card sx={surfaceSx}>
                <CardContent sx={contentSx}>
                  <Stack sx={{ gap: 1.25, alignItems: "flex-start" }}>
                    {isHomeAssessmentOpen ? (
                      <HomeWorkIcon sx={{ color: primaryColor }} />
                    ) : (
                      <LockIcon sx={{ color: "#64748b" }} />
                    )}
                    <Typography sx={{ fontSize: "0.75rem", color: "#64748b" }}>
                      Home Checklist
                    </Typography>
                    <Typography sx={{ fontSize: "1rem", fontWeight: 600 }}>
                      {!assessmentData
                        ? assessment.error
                          ? "Checklist unavailable"
                          : "Checking home tasks…"
                        : !isHomeAssessmentOpen
                          ? "Editing Closed by Teacher"
                          : pendingHomeCount > 0
                            ? pendingHomeCount + " Questions Pending"
                            : "✅ Home Submissions Up to Date"}
                    </Typography>
                    <Typography sx={{ fontSize: "0.75rem", color: "#64748b" }}>
                      {isHomeAssessmentOpen
                        ? "For open periods: " +
                          editablePeriods
                            .map((period) => PERIOD_LABELS[period])
                            .join(", ") +
                          ". Only saved submissions count."
                        : "Your adviser controls when home observations can be submitted."}
                    </Typography>
                    <Button
                      variant="contained"
                      disabled={!isHomeAssessmentOpen}
                      onClick={() =>
                        document
                          .getElementById("home-assessment")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          })
                      }
                      sx={actionSx}
                    >
                      {pendingHomeCount > 0
                        ? "Answer Home Checklist →"
                        : "View Home Checklist →"}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid sx={{ minWidth: 0 }}>
              <Card sx={surfaceSx}>
                <CardContent sx={contentSx}>
                  <Stack sx={{ gap: 1.25 }}>
                    <EmojiEventsIcon sx={{ color: primaryColor }} />
                    <Typography sx={{ fontSize: "0.75rem", color: "#64748b" }}>
                      Strongest Area
                    </Typography>
                    <Typography sx={{ fontSize: "1rem", fontWeight: 600 }}>
                      {visibleStats?.is_published
                        ? visibleStats.excelsIn
                        : visibleStats
                          ? "Results Pending Adviser Release"
                          : "Awaiting results"}
                    </Typography>
                    <Typography sx={{ fontSize: "0.75rem", color: "#64748b" }}>
                      A strength to celebrate in everyday play.
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid sx={{ minWidth: 0 }}>
              <Card sx={surfaceSx}>
                <CardContent sx={contentSx}>
                  <Stack sx={{ gap: 1.25 }}>
                    <TimelineIcon sx={{ color: primaryColor }} />
                    <Typography sx={{ fontSize: "0.75rem", color: "#64748b" }}>
                      ECCD Phase
                    </Typography>
                    <Typography sx={{ fontSize: "1rem", fontWeight: 600 }}>
                      {visibleStats?.currentPhase || "Awaiting results"}
                    </Typography>
                    <Typography sx={{ fontSize: "0.75rem", color: "#64748b" }}>
                      Latest recorded developmental checklist period.
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card
            sx={{
              ...surfaceSx,
              borderInlineStart: `3px solid ${primaryColor}`,
            }}
          >
            <CardContent sx={contentSx}>
              <Stack
                direction={{ xs: "column", lg: "row" }}
                sx={{ gap: 2, alignItems: { xs: "stretch", lg: "center" } }}
              >
                <Stack sx={{ gap: 0.75, flex: 1, minWidth: 0 }}>
                  <Typography component="h2" sx={titleSx}>
                    ✨ Early Developmental Insights &amp; Home Activities
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: { xs: "0.75rem", sm: "0.875rem" },
                      color: "#64748b",
                    }}
                  >
                    Review milestone forecasts and recommended home support
                    activities for {childName || "your child"}.
                  </Typography>
                </Stack>
                <Button
                  variant="contained"
                  onClick={() => navigate("/parent/ml-insights")}
                  sx={{
                    ...actionSx,
                    flexShrink: 0,
                    alignSelf: {
                      xs: "stretch",
                      sm: "flex-start",
                      lg: "center",
                    },
                  }}
                >
                  View ML Insights →
                </Button>
              </Stack>
            </CardContent>
          </Card>

          <Grid
            container
            spacing={3}
            sx={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr)",
              "@media (min-width: 1024px)": {
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              },
            }}
          >
            <Grid
              sx={{
                minWidth: 0,
                "@media (min-width: 1024px)": { gridColumn: "span 2" },
              }}
            >
              <Card sx={surfaceSx}>
                <CardContent sx={contentSx}>
                  <Stack sx={{ gap: 2 }}>
                    <Stack sx={{ gap: 0.5 }}>
                      <Typography component="h2" sx={titleSx}>
                        ECCD Assessment Progress
                      </Typography>
                      <Typography
                        sx={{ fontSize: "0.75rem", color: "#64748b" }}
                      >
                        Tracks checklist completion status, not an academic
                        score percentage.
                      </Typography>
                    </Stack>
                    {PERIODS.map((period) => {
                      const status = periodStatus(period);
                      const complete = status === "Complete";
                      return (
                        <Stack
                          key={period}
                          direction={{ xs: "column", sm: "row" }}
                          sx={{
                            gap: 1,
                            p: 1.5,
                            borderRadius: 3,
                            bgcolor: complete ? primaryTint : "#f8fafc",
                            alignItems: { xs: "flex-start", sm: "center" },
                            justifyContent: "space-between",
                          }}
                        >
                          <Stack
                            direction="row"
                            sx={{ gap: 1, alignItems: "center", minWidth: 0 }}
                          >
                            {complete ? (
                              <CheckCircleOutlineIcon
                                sx={{
                                  fontSize: "1.25rem",
                                  color: primaryColor,
                                }}
                              />
                            ) : (
                              <TimelineIcon
                                sx={{
                                  fontSize: "1.25rem",
                                  color: "#64748b",
                                }}
                              />
                            )}
                            <Typography
                              sx={{ fontSize: "0.875rem", fontWeight: 600 }}
                            >
                              {PERIOD_LABELS[period]}
                            </Typography>
                          </Stack>
                          <Typography
                            sx={{
                              fontSize: "0.75rem",
                              fontWeight: 500,
                              color: complete ? primaryColor : "#64748b",
                              maxWidth: "100%",
                            }}
                          >
                            {status}
                          </Typography>
                        </Stack>
                      );
                    })}
                    <Button
                      variant="contained"
                      onClick={() => navigate("/parent/eccdassessment")}
                      sx={{
                        ...actionSx,
                        alignSelf: { xs: "stretch", sm: "flex-start" },
                      }}
                    >
                      View ECCD Checklist →
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid sx={{ minWidth: 0 }}>
              <Card sx={surfaceSx}>
                <CardContent sx={contentSx}>
                  <Stack sx={{ gap: 2 }}>
                    <Typography component="h2" sx={titleSx}>
                      Recent Messages
                    </Typography>
                    {recentMessages.length === 0 ? (
                      <Stack
                        sx={{
                          gap: 0.5,
                          p: 1.5,
                          borderRadius: 3,
                          bgcolor: "#f8fafc",
                        }}
                      >
                        <Typography
                          sx={{ fontSize: "0.875rem", fontWeight: 500 }}
                        >
                          No recent teacher messages.
                        </Typography>
                        <Typography
                          sx={{ fontSize: "0.75rem", color: "#64748b" }}
                        >
                          Reach out to your child’s adviser anytime.
                        </Typography>
                      </Stack>
                    ) : (
                      recentMessages.map((message) => (
                        <Stack
                          key={message.message_id}
                          direction="row"
                          sx={{ gap: 1, minWidth: 0 }}
                        >
                          <Avatar
                            sx={{
                              bgcolor: primaryTint,
                              color: primaryColor,
                              flexShrink: 0,
                              fontSize: "0.875rem",
                            }}
                          >
                            {message.senderName.charAt(0).toUpperCase()}
                          </Avatar>
                          <Stack sx={{ gap: 0.5, minWidth: 0, flex: 1 }}>
                            <Typography
                              sx={{ fontSize: "0.875rem", fontWeight: 600 }}
                            >
                              {message.senderName}
                            </Typography>
                            <Typography
                              component="time"
                              dateTime={message.sent_at}
                              sx={{
                                fontSize: "0.75rem",
                                color: "#64748b",
                              }}
                            >
                              {new Date(message.sent_at).toLocaleDateString(
                                [],
                                { month: "short", day: "numeric" },
                              )}
                            </Typography>
                            <Typography
                              sx={{
                                fontSize: "0.75rem",
                                color: "#64748b",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {message.message_body}
                            </Typography>
                          </Stack>
                        </Stack>
                      ))
                    )}
                    <Button
                      variant="contained"
                      onClick={() => navigate("/parent/messages")}
                      sx={{
                        ...actionSx,
                        alignSelf: { xs: "stretch", sm: "flex-start" },
                      }}
                    >
                      Message Teacher →
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
          <HomeAssessmentForm assessment={assessment} childName={childName} />
        </>
      )}

      <Dialog
        open={lrnModalOpen}
        onClose={() => setLrnModalOpen(false)}
        slotProps={{
          paper: { sx: { borderRadius: 3, p: 1, minWidth: 0, maxWidth: "sm" } },
        }}
      >
        <DialogTitle
          sx={{ fontWeight: 600, color: "#0f172a", textAlign: "center" }}
        >
          Connect Your Child
        </DialogTitle>
        <DialogContent>
          <Typography
            variant="body2"
            sx={{ mb: 3, color: "#64748b", textAlign: "center" }}
          >
            To view your child's progress records and message their teacher,
            please securely link your account by entering their Learner
            Reference Number (LRN).
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          <Typography
            variant="caption"
            sx={{
              fontWeight: "bold",
              mb: 0.5,
              display: "block",
              color: "#64748b",
            }}
          >
            STUDENT LRN
          </Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="Enter 12-digit LRN"
            value={lrnNumber}
            onChange={(e) => setLrnNumber(e.target.value)}
            sx={{
              mb: 2,
              "& .MuiOutlinedInput-root": {
                borderRadius: 2,
                bgcolor: "#F9FAFB",
                "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                  borderColor: primaryColor,
                },
              },
            }}
          />
        </DialogContent>

        <DialogActions
          sx={{
            p: 3,
            pt: 1,
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            gap: 1,
            "& > :not(style) ~ :not(style)": { ml: 0 },
          }}
        >
          <Button
            variant="contained"
            onClick={() => setLrnModalOpen(false)}
            disabled={isLinking}
            sx={{
              ...actionSx,
              flex: 1,
              py: 1.2,
              fontWeight: "bold",
              borderRadius: 2,
              minHeight: "44px",
            }}
          >
            Back
          </Button>
          <Button
            variant="contained"
            onClick={handleLinkLrn}
            disabled={isLinking}
            sx={{
              ...actionSx,
              flex: 1,
              py: 1.2,
              fontWeight: "bold",
              borderRadius: 2,
              minHeight: "44px",
            }}
          >
            {isLinking ? "Verifying..." : "Connect"}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={Boolean(linkNotice)}
        autoHideDuration={8000}
        onClose={() => setLinkNotice("")}
      >
        <Alert
          severity="success"
          onClose={() => setLinkNotice("")}
          sx={{ borderRadius: 3 }}
        >
          {linkNotice}
        </Alert>
      </Snackbar>
    </Stack>
  );
};

export default Dashboard;
