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
  LinearProgress,
  Avatar,
  Select,
  MenuItem,
  Grid,
  SvgIcon,
} from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import HomeWorkIcon from "@mui/icons-material/HomeWork";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import TimelineIcon from "@mui/icons-material/Timeline";
import { useNavigate } from "react-router-dom";
import api, { errorMessage, isNetworkError } from "../../services/api";
import { useChildren } from "../../hooks/useChildren";
import { useAuth } from "../../context/AuthContext";
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
} from "../../types";

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
    const synced = (event: Event) => {
      if (
        (event as CustomEvent<string>).detail === linkKey &&
        !readDraft<string>(linkKey)
      ) {
        setLrnValue("");
        setLrnModalOpen(false);
        setError("");
      }
    };
    window.addEventListener("ames-record-synced", synced);
    return () => window.removeEventListener("ames-record-synced", synced);
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
          "Saved on this device. Linking will retry when your connection returns.",
        );
        return;
      }
      const response = await api.post(draft.request!.path, draft.request!.data);
      if (response.status !== 200 && response.status !== 201)
        throw new Error("The server did not confirm this link.");
      confirmDraft(linkKey, draft.revision);
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
          "Saved on this device. Linking is queued for synchronization.",
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
  const isHomeAssessmentOpen =
    activeChild?.allow_parent_edit_home_based_eccd === true;
  const visibleStats =
    hydratedChild === activeChild?.student_id ? dashboardStats : null;
  const currentProgress = (domain: DomainProgress): number | null => {
    if (!visibleStats?.is_published || !activeChild) return null;
    const released = [
      activeChild.allow_parent_view_eccd_pre ? domain.pre_progress : null,
      activeChild.allow_parent_view_eccd_mid ? domain.mid_progress : null,
      activeChild.allow_parent_view_eccd_post ? domain.post_progress : null,
    ].filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );
    return released.length ? Math.min(100, Math.max(0, ...released)) : null;
  };
  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: "1280px",
        mx: "auto",
        px: { xs: 1, sm: 2, md: 3 },
        py: { xs: 1, sm: 2 },
        pb: { xs: 8, md: 4 },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
          flexWrap: "wrap",
          gap: 1.5,
        }}
      >
        <Typography
          variant="h5"
          sx={{ fontWeight: "bold", fontSize: { xs: "1.25rem", sm: "1.5rem" } }}
        >
          Welcome, {user?.username || "Parent"}!
        </Typography>
      </Box>

      {/* The Home-Based Assessment Banner was moved to Card 1 in the grid below */}

      {/* 2. Child Quick Info (The Blue Rectangle) */}
      <Card
        sx={{
          background: "linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)",
          color: "white",
          borderRadius: "16px",
          mb: 3,
          boxShadow: "0 8px 20px rgba(59, 130, 246, 0.15)",
          position: "relative",
        }}
      >
        <CardContent
          sx={{
            p: { xs: 2, sm: 2.5, md: 3 },
            "&:last-child": { pb: { xs: 2, sm: 2.5, md: 3 } },
          }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: { xs: "flex-start", sm: "center" },
              flexDirection: { xs: "column", md: "row" },
              gap: 2,
            }}
          >
            <Box
              sx={{
                display: "flex",
                gap: 2,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <Avatar
                sx={{
                  width: { xs: 54, sm: 70 },
                  height: { xs: 54, sm: 70 },
                  bgcolor: "rgba(255,255,255,0.2)",
                  fontSize: { xs: "1.5rem", sm: "2rem" },
                  fontWeight: "bold",
                }}
              >
                {activeChild ? activeChild.first_name?.charAt(0) : "?"}
              </Avatar>
              <Box>
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: "bold",
                    mb: 0.5,
                    fontSize: { xs: "1.15rem", sm: "1.4rem" },
                  }}
                >
                  {activeChild
                    ? `${activeChild.first_name} ${activeChild.last_name}`
                    : "Awaiting Connection..."}
                </Typography>
                {activeChild && (
                  <Box
                    sx={{
                      display: "flex",
                      gap: { xs: 1, sm: 2 },
                      opacity: 0.9,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: "500",
                        fontSize: { xs: "0.75rem", sm: "0.875rem" },
                      }}
                    >
                      📍 {activeChild.section_name || "N/A"}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: "500",
                        fontSize: { xs: "0.75rem", sm: "0.875rem" },
                      }}
                    >
                      👤 Tr. {activeChild.teacher_lname || "N/A"}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: "500",
                        fontSize: { xs: "0.75rem", sm: "0.875rem" },
                      }}
                    >
                      🆔 {activeChild.masked_lrn}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>

            <Box
              sx={{
                display: "flex",
                gap: 1.5,
                alignItems: "center",
                flexWrap: "wrap",
                width: { xs: "100%", md: "auto" },
                justifyContent: { xs: "space-between", md: "flex-end" },
              }}
            >
              {linkedChildren.length > 1 ? (
                <Box sx={{ mr: { sm: 1 }, flex: { xs: 1, sm: "none" } }}>
                  <Typography
                    variant="caption"
                    sx={{
                      display: "block",
                      mb: 0.5,
                      opacity: 0.9,
                      fontWeight: "bold",
                      fontSize: "0.7rem",
                    }}
                  >
                    Select Child
                  </Typography>
                  <Select
                    value={activeChildIndex}
                    onChange={handleChildChange}
                    size="small"
                    sx={{
                      bgcolor: "rgba(255,255,255,0.2)",
                      color: "white",
                      fontWeight: "bold",
                      borderRadius: 2,
                      minWidth: { xs: 130, sm: 160 },
                      "& .MuiSelect-icon": { color: "white" },
                      "& .MuiOutlinedInput-notchedOutline": { border: "none" },
                    }}
                  >
                    {linkedChildren.map((child, index) => (
                      <MenuItem key={child.student_id} value={index}>
                        {child.first_name} {child.last_name} ({child.masked_lrn}
                        )
                      </MenuItem>
                    ))}
                  </Select>
                </Box>
              ) : (
                <Box sx={{ display: "flex", gap: 1.5, mr: { sm: 1 } }}>
                  <Box
                    sx={{
                      bgcolor: "rgba(255,255,255,0.15)",
                      px: 1.5,
                      py: 0.8,
                      borderRadius: "8px",
                      backdropFilter: "blur(10px)",
                      textAlign: "center",
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        opacity: 0.9,
                        fontWeight: "bold",
                        display: "block",
                        fontSize: "0.7rem",
                      }}
                    >
                      Children
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                      {activeChild ? linkedChildren.length : 0}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      bgcolor: "rgba(255,255,255,0.15)",
                      px: 1.5,
                      py: 0.8,
                      borderRadius: "8px",
                      backdropFilter: "blur(10px)",
                      textAlign: "center",
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        opacity: 0.9,
                        fontWeight: "bold",
                        display: "block",
                        fontSize: "0.7rem",
                      }}
                    >
                      ECCD
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                      {activeChild ? "Normal" : "N/A"}
                    </Typography>
                  </Box>
                </Box>
              )}
              <Button
                variant="contained"
                onClick={() => setLrnModalOpen(true)}
                sx={{
                  bgcolor: "white",
                  color: "primary.main",
                  fontWeight: "bold",
                  "&:hover": { bgcolor: "#f1f5f9" },
                  borderRadius: 2,
                  textTransform: "none",
                  px: 2,
                  py: 0.8,
                  minHeight: 40,
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                }}
              >
                SYNC
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {activeChild && (
        <Box sx={{ mb: 4 }}>
          {/* 2.5. 4-Card Summary Grid */}
          <Grid container spacing={2} sx={{ mb: 4 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }} sx={{ minWidth: 0 }}>
              <Card
                onClick={() =>
                  isHomeAssessmentOpen
                    ? navigate("/parent/eccdassessment")
                    : null
                }
                sx={{
                  minHeight: 100,
                  height: "100%",
                  width: "100%",
                  minWidth: 0,
                  maxWidth: "100%",
                  borderRadius: "12px",
                  cursor: isHomeAssessmentOpen ? "pointer" : "default",
                  bgcolor: isHomeAssessmentOpen ? "#fffbeb" : "#fef2f2",
                  border: `1px solid ${isHomeAssessmentOpen ? "#fde68a" : "#fecdd3"}`,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
                  transition: "all 0.2s ease",
                  "&:hover": {
                    bgcolor: isHomeAssessmentOpen ? "#fef3c7" : "#fef2f2",
                    transform: isHomeAssessmentOpen
                      ? "translateY(-2px)"
                      : "none",
                  },
                }}
              >
                <CardContent
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    p: 2,
                    "&:last-child": { pb: 2 },
                  }}
                >
                  <Box
                    sx={{
                      p: 1,
                      borderRadius: "10px",
                      bgcolor: isHomeAssessmentOpen ? "#fef3c7" : "#fee2e2",
                      color: isHomeAssessmentOpen ? "#d97706" : "#ef4444",
                      display: "flex",
                      flexShrink: 0,
                    }}
                  >
                    {isHomeAssessmentOpen ? <HomeWorkIcon /> : <LockIcon />}
                  </Box>
                  <Box
                    sx={{
                      overflow: "hidden",
                      flex: 1,
                      minWidth: 0,
                      width: "100%",
                    }}
                  >
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{
                        color: isHomeAssessmentOpen ? "#92400e" : "error.dark",
                        fontWeight: "bold",
                      }}
                    >
                      Assessment Task
                    </Typography>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: "bold",
                        mt: 0.5,
                        fontSize: "0.95rem",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: isHomeAssessmentOpen ? "#b45309" : "error.main",
                        display: "block",
                      }}
                    >
                      {isHomeAssessmentOpen ? "Open for Edit" : "Locked"}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: isHomeAssessmentOpen ? "#b45309" : "error.main",
                        display: "block",
                      }}
                      noWrap
                    >
                      {isHomeAssessmentOpen
                        ? "Click to answer"
                        : "Teacher review"}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 3 }} sx={{ minWidth: 0 }}>
              <Card
                sx={{
                  minHeight: 100,
                  height: "100%",
                  width: "100%",
                  minWidth: 0,
                  maxWidth: "100%",
                  borderRadius: "12px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
                  border: visibleStats?.assessmentMastered
                    ? "1px solid #bbf7d0"
                    : "1px solid #f1f5f9",
                  bgcolor: visibleStats?.assessmentMastered
                    ? "#f0fdf4"
                    : "inherit",
                }}
              >
                <CardContent
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    p: 2,
                    "&:last-child": { pb: 2 },
                  }}
                >
                  <Box
                    sx={{
                      p: 1,
                      borderRadius: "10px",
                      bgcolor: visibleStats?.assessmentMastered
                        ? "#dcfce7"
                        : "#ffedd5",
                      color: visibleStats?.assessmentMastered
                        ? "#16a34a"
                        : "#ea580c",
                      display: "flex",
                      flexShrink: 0,
                    }}
                  >
                    {visibleStats?.assessmentMastered ? (
                      <SvgIcon>
                        <path d="M16.59 7.58 10 14.17l-3.59-3.58L5 12l5 5 8-8zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8" />
                      </SvgIcon>
                    ) : (
                      <WarningAmberIcon />
                    )}
                  </Box>
                  <Box
                    sx={{
                      overflow: "hidden",
                      flex: 1,
                      minWidth: 0,
                      width: "100%",
                    }}
                  >
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{ color: "text.secondary", fontWeight: "bold" }}
                    >
                      {visibleStats?.assessmentMastered
                        ? "Assessment Complete"
                        : "Needs Support In"}
                    </Typography>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: "bold",
                        mt: 0.5,
                        fontSize: "0.95rem",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "block",
                        color: visibleStats?.assessmentMastered
                          ? "#15803d"
                          : "inherit",
                      }}
                    >
                      {visibleStats?.assessmentMastered
                        ? "All Skills Mastered"
                        : visibleStats?.needsSupportIn || "None"}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: visibleStats?.assessmentMastered
                          ? "success.main"
                          : "text.secondary",
                        display: "block",
                        fontWeight: visibleStats?.assessmentMastered
                          ? 600
                          : "normal",
                      }}
                      noWrap
                    >
                      {visibleStats?.assessmentMastered
                        ? "Ready for Grade 1"
                        : "Priority for improvement"}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 3 }} sx={{ minWidth: 0 }}>
              <Card
                sx={{
                  minHeight: 100,
                  height: "100%",
                  width: "100%",
                  minWidth: 0,
                  maxWidth: "100%",
                  borderRadius: "12px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
                  border: "1px solid #f1f5f9",
                }}
              >
                <CardContent
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    p: 2,
                    "&:last-child": { pb: 2 },
                  }}
                >
                  <Box
                    sx={{
                      p: 1,
                      borderRadius: "10px",
                      bgcolor: "#dcfce7",
                      color: "#16a34a",
                      display: "flex",
                      flexShrink: 0,
                    }}
                  >
                    <EmojiEventsIcon />
                  </Box>
                  <Box
                    sx={{
                      overflow: "hidden",
                      flex: 1,
                      minWidth: 0,
                      width: "100%",
                    }}
                  >
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{ color: "text.secondary", fontWeight: "bold" }}
                    >
                      Excels In
                    </Typography>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: "bold",
                        mt: 0.5,
                        fontSize: "0.95rem",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "block",
                      }}
                    >
                      {visibleStats?.excelsIn || "No Data"}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: "text.secondary", display: "block" }}
                      noWrap
                    >
                      Top performing domain
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 3 }} sx={{ minWidth: 0 }}>
              <Card
                sx={{
                  minHeight: 100,
                  height: "100%",
                  width: "100%",
                  minWidth: 0,
                  maxWidth: "100%",
                  borderRadius: "12px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
                  border: "1px solid #f1f5f9",
                }}
              >
                <CardContent
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    p: 2,
                    "&:last-child": { pb: 2 },
                  }}
                >
                  <Box
                    sx={{
                      p: 1,
                      borderRadius: "10px",
                      bgcolor: "#f3e8ff",
                      color: "#9333ea",
                      display: "flex",
                      flexShrink: 0,
                    }}
                  >
                    <TimelineIcon />
                  </Box>
                  <Box
                    sx={{
                      overflow: "hidden",
                      flex: 1,
                      minWidth: 0,
                      width: "100%",
                    }}
                  >
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{ color: "text.secondary", fontWeight: "bold" }}
                    >
                      Current Phase
                    </Typography>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: "bold",
                        mt: 0.5,
                        fontSize: "0.95rem",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "block",
                      }}
                    >
                      {visibleStats?.currentPhase || "Not Started"}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: "text.secondary", display: "block" }}
                      noWrap
                    >
                      Latest recorded phase
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* 3. Split Layout: Domain Progress Overview & Recent Messages */}
          <Grid container spacing={4}>
            {/* Left Column: Domain Progress */}
            <Grid size={{ xs: 12, md: 7 }}>
              <Card
                sx={{
                  height: "100%",
                  borderRadius: "12px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
                  border: "1px solid #f1f5f9",
                }}
              >
                <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                  <Typography variant="h6" sx={{ fontWeight: "bold", mb: 4 }}>
                    Domain Progress Overview
                  </Typography>

                  {domains.length === 0 ? (
                    <Box sx={{ py: 4, textAlign: "center" }}>
                      <Typography sx={{ color: "text.secondary" }}>
                        No ECCD data available yet.
                      </Typography>
                    </Box>
                  ) : (
                    domains.map((domain, index) => {
                      const maxProgress = currentProgress(domain) ?? 0;
                      return (
                        <Box
                          key={domain.domain_id}
                          sx={{ mb: index !== domains.length - 1 ? 3 : 0 }}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              mb: 1,
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: "bold",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                maxWidth: "85%",
                              }}
                            >
                              {domain.domain_name}
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{ color: "primary.main", fontWeight: "bold" }}
                            >
                              {maxProgress}%
                            </Typography>
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={maxProgress}
                            sx={{
                              height: 8,
                              borderRadius: 4,
                              bgcolor: "#f1f5f9",
                              "& .MuiLinearProgress-bar": {
                                borderRadius: 4,
                                bgcolor: "#3b82f6",
                              },
                            }}
                          />
                        </Box>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Right Column: Recent Messages */}
            <Grid size={{ xs: 12, md: 5 }}>
              <Card
                sx={{
                  height: "100%",
                  borderRadius: "12px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
                  border: "1px solid #f1f5f9",
                }}
              >
                <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      mb: 3,
                    }}
                  >
                    <Typography variant="h6" sx={{ fontWeight: "bold" }}>
                      Recent Messages
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => navigate("/parent/messages")}
                      sx={{
                        textTransform: "none",
                        fontWeight: "bold",
                        minHeight: "44px",
                      }}
                    >
                      View All
                    </Button>
                  </Box>

                  {recentMessages.length === 0 ? (
                    <Box
                      sx={{
                        py: 4,
                        textAlign: "center",
                        bgcolor: "#f8fafc",
                        borderRadius: 2,
                      }}
                    >
                      <Typography
                        sx={{ color: "text.secondary", fontWeight: "500" }}
                      >
                        No recent messages.
                      </Typography>
                    </Box>
                  ) : (
                    recentMessages.map((msg, idx) => (
                      <Box
                        key={msg.message_id}
                        sx={{
                          display: "flex",
                          gap: 2,
                          mb: idx === recentMessages.length - 1 ? 0 : 3,
                          p: 2,
                          bgcolor: "#f8fafc",
                          borderRadius: 2,
                        }}
                      >
                        <Avatar
                          sx={{
                            bgcolor:
                              msg.sender_role === "teacher"
                                ? "secondary.main"
                                : "primary.main",
                            width: 44,
                            height: 44,
                            fontWeight: "bold",
                          }}
                        >
                          {msg.senderName.charAt(0).toUpperCase()}
                        </Avatar>
                        <Box sx={{ flexGrow: 1, overflow: "hidden" }}>
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              mb: 0.5,
                            }}
                          >
                            <Typography
                              variant="subtitle2"
                              noWrap
                              sx={{ fontWeight: "bold", maxWidth: "65%" }}
                            >
                              {msg.senderName}
                            </Typography>
                            <Typography
                              variant="caption"
                              noWrap
                              sx={{
                                color: "text.secondary",
                                fontWeight: "500",
                              }}
                            >
                              {new Date(msg.sent_at).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                              })}
                            </Typography>
                          </Box>
                          <Typography
                            variant="body2"
                            sx={{
                              color: "text.secondary",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                            }}
                          >
                            {msg.message_body}
                          </Typography>
                        </Box>
                      </Box>
                    ))
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}

      <Dialog
        open={lrnModalOpen}
        onClose={() => setLrnModalOpen(false)}
        slotProps={{ paper: { sx: { borderRadius: 3, p: 1, maxWidth: 400 } } }}
      >
        <DialogTitle
          sx={{ fontWeight: "900", color: "#111827", textAlign: "center" }}
        >
          Connect Your Child
        </DialogTitle>
        <DialogContent>
          <Typography
            variant="body2"
            sx={{ mb: 3, color: "text.secondary", textAlign: "center" }}
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
              color: "text.secondary",
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
              },
            }}
          />
        </DialogContent>

        <DialogActions sx={{ p: 3, pt: 1, display: "flex", gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => setLrnModalOpen(false)}
            disabled={isLinking}
            sx={{
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
              flex: 1,
              py: 1.2,
              fontWeight: "bold",
              borderRadius: 2,
              boxShadow: "none",
              minHeight: "44px",
            }}
          >
            {isLinking ? "Verifying..." : "Connect"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Dashboard;
