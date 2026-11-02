import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
  Menu,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Snackbar,
  Chip,
  Stack,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DownloadIcon from "@mui/icons-material/Download";
import PreviewIcon from "@mui/icons-material/Preview";
import WifiIcon from "@mui/icons-material/Wifi";
import WifiOffIcon from "@mui/icons-material/WifiOff";
import CloudSyncIcon from "@mui/icons-material/CloudSync";
import api, {
  downloadFile,
  errorMessage,
  isNetworkError,
} from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useTeacher } from "../../context/TeacherContext";
import {
  localToday,
  useTeacherAssessment,
} from "../../hooks/useTeacherAssessment";
import { formatDisplayDate } from "../../utils/dateUtils";
import { readDraft } from "../../utils/drafts";
import {
  resolveTeacherDrafts,
  teacherDomainProgress,
} from "../../utils/eccdDrafts";
import type { TeacherAssessmentDraft } from "../../utils/eccdDrafts";
import { assessmentRefreshScheduler } from "../../hooks/assessmentRefresh";
import EccdCardPreviewDialog from "../../components/teacher/EccdCardPreviewDialog";
import type {
  Domain as AssessmentDomain,
  DomainProgress,
  Assessment,
  Period,
  Student,
} from "../../types";
interface Domain extends AssessmentDomain, DomainProgress {}
const EccdAssessment: React.FC = () => {
  const { user } = useAuth();
  const { section } = useTeacher();
  const [searchParams] = useSearchParams();
  const openedAssessment = useRef<string>("");
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedLrn, setSelectedLrn] = useState("");
  const [domains, setDomains] = useState<Domain[]>([]);
  const [activeDomain, setActiveDomain] = useState<Domain | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadMenuAnchor, setDownloadMenuAnchor] =
    useState<HTMLElement | null>(null);
  const [singleDownloadModalOpen, setSingleDownloadModalOpen] = useState(false);
  const [downloadStudentId, setDownloadStudentId] = useState<string>("");
  const [previewScope, setPreviewScope] = useState<string | null>(null);
  const [activePeriod, setActivePeriod] = useState<Period>("PRE");
  const requestVersion = useRef(0);
  const progressVersion = useRef(0);
  const progressController = useRef<AbortController | null>(null);
  const progressRefresh = useRef<ReturnType<
    typeof assessmentRefreshScheduler
  > | null>(null);
  const [pageError, setPageError] = useState("");
  const progressScope = `${user?.id}_${section?.section_id}`;
  const [classAssessments, setClassAssessments] = useState<{
    scope: string;
    records: Assessment[];
  } | null>(null);
  const fetchDomainsProgress = useCallback(
    async (quiet = false) => {
      const version = ++progressVersion.current;
      progressController.current?.abort();
      const controller = new AbortController();
      progressController.current = controller;
      if (!quiet) setLoading(true);
      try {
        const res = await api.get<Domain[]>("/api/eccd/domains-progress", {
          signal: controller.signal,
        });
        if (controller.signal.aborted || version !== progressVersion.current)
          return;
        const progress = res.data;
        setDomains(progress);
        setPageError("");
        localStorage.setItem(
          "ames_teacher_domains_" + progressScope,
          JSON.stringify(progress),
        );
      } catch (err) {
        if (controller.signal.aborted || version !== progressVersion.current)
          return;
        if (isNetworkError(err)) {
          try {
            setDomains(
              JSON.parse(
                localStorage.getItem("ames_teacher_domains_" + progressScope) ||
                  "[]",
              ) as Domain[],
            );
          } catch {
            /* Keep existing questions. */
          }
        }
        setPageError(errorMessage(err));
      } finally {
        if (version === progressVersion.current) setLoading(false);
      }
    },
    [progressScope],
  );
  const scheduleProgressRefresh = useCallback(() => {
    progressRefresh.current?.schedule();
  }, []);
  const {
    assessment: selectedAssessment,
    assessmentDate,
    gradingDates,
    questions,
    periodProgress,
    evalAges,
    evaluations,
    dateError,
    getDateBounds,
    evalLoading,
    saving,
    isOnline,
    isSyncing,
    pendingDraftsCount,
    error: assessmentError,
    snackbar,
    setSnackbar,
    handleAnswerChange,
    handleDateChange,
    handleSave,
    triggerBackgroundSync,
    getAnswer,
    isPreKaya,
  } = useTeacherAssessment(
    Number(selectedLrn),
    activeDomain,
    activePeriod,
    scheduleProgressRefresh,
  );
  useEffect(() => {
    if (!selectedAssessment) return;
    setClassAssessments((previous) => ({
      scope: progressScope,
      records: [
        ...(previous?.scope === progressScope ? previous.records : []).filter(
          (record) => record.student_id !== selectedAssessment.student_id,
        ),
        selectedAssessment,
      ],
    }));
  }, [selectedAssessment, progressScope]);
  const error = pageError || assessmentError;
  const getDisplayAge = (p: Period) =>
    activeDomain ? evalAges[activeDomain.domain_id]?.[p] : null;
  const activeProgress = periodProgress[activePeriod];
  const domainCardProgress = (domain: Domain) => {
    if (classAssessments?.scope !== progressScope) return null;
    // Aggregate percentages cannot reveal partial per-question saved counts.
    // Keep the existing detailed row only when the entire roster is known.
    if (
      !students.length ||
      !students.every((student) =>
        classAssessments.records.some(
          (record) => record.student_id === student.student_id,
        ),
      )
    )
      return null;
    let savedCount = 0;
    let draftCount = 0;
    let total = 0;
    let dateChanges = 0;
    for (const assessment of classAssessments.records.filter((record) =>
      students.some((student) => student.student_id === record.student_id),
    )) {
      const savedQuestions =
        assessment.domains.find((item) => item.domain_id === domain.domain_id)
          ?.questions || [];
      const domainQuestions = domain.questions.map(
        (q) =>
          savedQuestions.find(
            (saved) => saved.question_id === q.question_id,
          ) || { ...q, answers: { PRE: null, MID: null, POST: null } },
      );
      const draft = readDraft<TeacherAssessmentDraft>(
        `eccd_draft_${assessment.student_id}_${activePeriod}_${domain.domain_id}_${user?.id}`,
      );
      const values =
        draft && draft.owner_id === user?.id ? draft.values : undefined;
      const state = resolveTeacherDrafts(
        domainQuestions,
        { [activePeriod]: values },
        assessment.pre_kaya_question_ids,
      );
      const progress = teacherDomainProgress(
        domainQuestions,
        state[activePeriod],
      );
      savedCount += progress.savedCount;
      draftCount += progress.draftCount;
      total += progress.total;
      if (
        values &&
        values.evaluation_date !==
          (assessment.periodDates[activePeriod] || localToday())
      )
        dateChanges++;
    }
    return {
      savedCount,
      draftCount,
      total,
      dateChanges,
      complete:
        total > 0 &&
        savedCount === total &&
        draftCount === 0 &&
        dateChanges === 0,
    };
  };
  useEffect(() => {
    openedAssessment.current = "";
    setSelectedLrn("");
    setActiveDomain(null);
    setDomains([]);
    setClassAssessments(null);
    setLoading(false);
    setDownloadStudentId("");
    setSingleDownloadModalOpen(false);
    setDownloadMenuAnchor(null);
    setPreviewScope(null);
    const version = ++requestVersion.current;
    let rosterController: AbortController | null = null;
    const scheduler = assessmentRefreshScheduler(user?.id || 0, () =>
      fetchDomainsProgress(true),
    );
    progressRefresh.current = scheduler;
    setStudents([]);
    setPageError("");
    const cacheKey =
      "ames_teacher_roster_" + user?.id + "_" + section?.section_id;
    const load = async () => {
      rosterController?.abort();
      const controller = new AbortController();
      rosterController = controller;
      try {
        const res = await api.get<Student[]>("/api/eccd/students", {
          signal: controller.signal,
        });
        if (controller.signal.aborted || version !== requestVersion.current)
          return;
        const roster = res.data.filter(
          (s) => s.is_active && s.section_id === section?.section_id,
        );
        setStudents(roster);
        localStorage.setItem(cacheKey, JSON.stringify(roster));
      } catch (err) {
        if (controller.signal.aborted || version !== requestVersion.current)
          return;
        if (isNetworkError(err)) {
          try {
            setStudents(
              JSON.parse(localStorage.getItem(cacheKey) || "[]") as Student[],
            );
          } catch {
            /* Preserve cached drafts. */
          }
        }
        setPageError(errorMessage(err));
      }
    };
    if (section) {
      void load();
      void fetchDomainsProgress();
    }
    const reload = () => {
      if (!section) return;
      void load();
      scheduler.schedule();
    };
    const synced = (event: Event) => {
      const key = (event as CustomEvent<string>).detail;
      if (key?.startsWith("eccd_draft_")) {
        if (key.endsWith(`_${user?.id}`)) scheduler.schedule();
      } else reload();
    };
    window.addEventListener("online", reload);
    window.addEventListener("ames-record-synced", synced);
    return () => {
      ++requestVersion.current;
      ++progressVersion.current;
      rosterController?.abort();
      progressController.current?.abort();
      scheduler.cancel();
      progressRefresh.current = null;
      window.removeEventListener("online", reload);
      window.removeEventListener("ames-record-synced", synced);
    };
  }, [section?.section_id, user?.id, fetchDomainsProgress]);
  useEffect(() => {
    const studentId = Number(searchParams.get("student_id"));
    const period = searchParams.get("period");
    const domainId = Number(searchParams.get("domain_id"));
    const key = `${progressScope}_${searchParams.toString()}`;
    if (
      openedAssessment.current === key ||
      !students.some(
        (student) =>
          student.student_id === studentId &&
          student.section_id === section?.section_id,
      ) ||
      !domains.length ||
      (period !== "PRE" && period !== "MID" && period !== "POST")
    )
      return;
    // Open dashboard links only after the active section's roster is validated.
    // Draft loading and saving remain owned by useTeacherAssessment.
    openedAssessment.current = key;
    setActiveDomain(
      domains.find((domain) => domain.domain_id === domainId) || domains[0],
    );
    setSelectedLrn(String(studentId));
    setActivePeriod(period);
  }, [students, domains, searchParams, section?.section_id, progressScope]);
  const handleDomainClick = (domain: Domain) => {
    setActiveDomain(domain);
    setSelectedLrn("");
  };
  const handleDownload = async (
    path: string,
    fallback: string,
    message: string,
  ) => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadFile(path, fallback);
      setSnackbar({
        open: true,
        message,
        severity: "success",
      });
    } catch (err) {
      setSnackbar({
        open: true,
        message: errorMessage(err),
        severity: "error",
      });
    } finally {
      setDownloading(false);
    }
  };
  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex flex-col min-h-0 relative pb-16">
      {/* Header section */}
      <Stack
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", lg: "center" },
          mb: 4,
          flexDirection: { xs: "column", lg: "row" },
          gap: 2,
        }}
      >
        <Box>
          <Typography
            variant="h4"
            sx={{
              fontWeight: "800",
              color: "#1e1e2f",
              mb: 0.5,
              fontSize: { xs: "1.25rem", sm: "1.75rem", md: "2rem" },
            }}
          >
            ECCD Assessment
          </Typography>
          <Typography variant="body1" color="textSecondary">
            Evaluate and monitor student progress across ECCD domains.
          </Typography>
        </Box>
        <Stack
          direction="row"
          spacing={2}
          useFlexGap
          sx={{
            alignItems: "center",
            flexWrap: "wrap",
            width: { xs: "100%", md: "auto" },
          }}
        >
          <Chip
            icon={isOnline ? <WifiIcon /> : <WifiOffIcon />}
            label={isOnline ? "Online" : "Offline"}
            color={isOnline ? "success" : "warning"}
            variant="filled"
            sx={{ fontWeight: "bold" }}
          />
          {pendingDraftsCount > 0 && (
            <Tooltip
              title={
                isOnline
                  ? "Click to manually sync pending assessments now"
                  : "Offline: Connect to Wi-Fi to sync"
              }
            >
              <span>
                <Chip
                  component="button"
                  icon={
                    isSyncing ? (
                      <CircularProgress
                        size={16}
                        color="inherit"
                        sx={{ mr: 0.5 }}
                      />
                    ) : (
                      <CloudSyncIcon />
                    )
                  }
                  label={
                    isSyncing
                      ? "Syncing..."
                      : `${pendingDraftsCount} Pending Sync`
                  }
                  color="info"
                  variant="outlined"
                  onClick={triggerBackgroundSync}
                  disabled={isSyncing}
                  sx={{
                    fontWeight: "bold",
                    cursor: isSyncing ? "default" : "pointer",
                    borderColor: "#0288d1",
                    borderWidth: 2,
                    "&:hover": {
                      backgroundColor: "rgba(2, 136, 209, 0.08)",
                    },
                  }}
                />
              </span>
            </Tooltip>
          )}
          <Button
            variant="outlined"
            startIcon={<PreviewIcon />}
            onClick={() => setPreviewScope(progressScope)}
            disabled={!section || students.length === 0}
            sx={{ borderRadius: 3, fontWeight: "bold" }}
          >
            Preview ECCD Card
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={
              downloading ? (
                <CircularProgress size={18} color="inherit" />
              ) : (
                <DownloadIcon />
              )
            }
            onClick={(e) => setDownloadMenuAnchor(e.currentTarget)}
            disabled={downloading || !section}
            aria-haspopup="menu"
            aria-expanded={Boolean(downloadMenuAnchor)}
            sx={{ borderRadius: 3, fontWeight: "bold" }}
          >
            {downloading ? "Downloading..." : "Download"}
          </Button>
        </Stack>
      </Stack>

      {previewScope === progressScope && (
        <EccdCardPreviewDialog
          key={progressScope}
          students={students}
          initialStudentId={selectedLrn}
          onClose={() => setPreviewScope(null)}
        />
      )}

      <Menu
        anchorEl={downloadMenuAnchor}
        open={Boolean(downloadMenuAnchor)}
        onClose={() => setDownloadMenuAnchor(null)}
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <MenuItem
          onClick={() => {
            setDownloadMenuAnchor(null);
            setDownloadStudentId(selectedLrn);
            setSingleDownloadModalOpen(true);
          }}
        >
          ECCD Records
        </MenuItem>
        <MenuItem
          onClick={() => {
            setDownloadMenuAnchor(null);
            if (section) {
              void handleDownload(
                `/api/eccd/section/${section.section_id}/export`,
                "Section_ECCD_Summary.xlsx",
                "Section summary record downloaded successfully!",
              );
            }
          }}
        >
          Section Summary Record
        </MenuItem>
      </Menu>

      <Dialog
        open={singleDownloadModalOpen}
        onClose={() => setSingleDownloadModalOpen(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="eccd-records-download-title"
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <DialogTitle id="eccd-records-download-title">
          Download ECCD Records
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
            Select one student's checklist or download all active students'
            records as a ZIP.
          </Typography>
          <FormControl fullWidth size="small" sx={{ mt: 1 }}>
            <InputLabel id="teacher-export-student-label">
              Select Student
            </InputLabel>
            <Select
              labelId="teacher-export-student-label"
              value={downloadStudentId}
              label="Select Student"
              onChange={(e) => setDownloadStudentId(e.target.value)}
              sx={{ borderRadius: 3 }}
            >
              <MenuItem value="all">All Students (ZIP)</MenuItem>
              {students.map((s) => {
                const idVal = String(s.student_id);
                return (
                  <MenuItem key={idVal} value={idVal}>
                    {s.first_name} {s.last_name} ({s.masked_lrn})
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setSingleDownloadModalOpen(false)}
            color="inherit"
            sx={{ borderRadius: 3 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (downloadStudentId === "all") {
                void handleDownload(
                  "/api/teachers/download-all",
                  "Class_ECCD_Assessments.zip",
                  "All section assessments downloaded successfully!",
                );
              } else if (
                students.some(
                  (student) => String(student.student_id) === downloadStudentId,
                )
              ) {
                void handleDownload(
                  `/api/teachers/download/${downloadStudentId}`,
                  "ECCD_Assessment.xlsx",
                  "Assessment checklist downloaded successfully!",
                );
              }
              setSingleDownloadModalOpen(false);
            }}
            disabled={
              !singleDownloadModalOpen ||
              downloading ||
              (downloadStudentId !== "all" &&
                !students.some(
                  (student) => String(student.student_id) === downloadStudentId,
                ))
            }
            sx={{ borderRadius: 3 }}
          >
            {downloading ? "Downloading..." : "Download"}
          </Button>
        </DialogActions>
      </Dialog>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", my: 5 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Main View: Domain Cards Grid */}
      {!loading && !activeDomain && domains.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-7xl mx-auto">
          {domains.map((domain, index) => {
            const preProgress = domain.pre_progress || 0;
            const midProgress = domain.mid_progress || 0;
            const postProgress = domain.post_progress || 0;
            const cardProgress = domainCardProgress(domain);
            return (
              <div
                key={domain.domain_id}
                onClick={() => handleDomainClick(domain)}
                className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between h-full hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group"
              >
                {/* Top Section: Header & Progress Bars */}
                <div>
                  {/* Card Header (badge, domain title, indicator count) */}
                  <div className="flex items-start gap-3.5 mb-4">
                    <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 font-black text-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base lg:text-lg font-bold text-slate-800 leading-snug line-clamp-2 break-words">
                        {domain.domain_name}
                      </h3>
                      <p className="text-xs text-slate-500 font-medium mt-1">
                        {domain.questions?.length
                          ? `${domain.questions.length} Indicators Checklist`
                          : "Developmental Indicators"}
                      </p>
                    </div>
                  </div>

                  {/* Progress Bars */}
                  <div className="flex flex-col gap-2.5 my-4 pt-2 border-t border-slate-100">
                    <div>
                      <div className="flex justify-between items-center mb-1 text-xs">
                        <span className="font-semibold text-slate-600">
                          Pre-Test
                        </span>
                        <span className="font-bold text-blue-600">
                          {preProgress}%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-500"
                          style={{ width: `${preProgress}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1 text-xs">
                        <span className="font-semibold text-slate-600">
                          Mid-Test
                        </span>
                        <span className="font-bold text-amber-600">
                          {midProgress}%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full transition-all duration-500"
                          style={{ width: `${midProgress}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1 text-xs">
                        <span className="font-semibold text-slate-600">
                          Post-Test
                        </span>
                        <span className="font-bold text-emerald-600">
                          {postProgress}%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${postProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  {cardProgress && (
                    <div
                      className="flex flex-wrap items-center gap-2 mb-4 text-xs text-slate-600"
                      aria-label={`${domain.domain_name} saved progress`}
                    >
                      <span>
                        {activePeriod === "PRE"
                          ? "Pre-Test"
                          : activePeriod === "MID"
                            ? "Mid-Test"
                            : "Post-Test"}{" "}
                        · Saved: {cardProgress.savedCount} /{" "}
                        {cardProgress.total}
                      </span>
                      {cardProgress.draftCount > 0 && (
                        <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                          {cardProgress.draftCount} unsaved change
                          {cardProgress.draftCount === 1 ? "" : "s"}
                        </span>
                      )}
                      {cardProgress.dateChanges > 0 && (
                        <span className="text-amber-700">
                          {cardProgress.dateChanges} unsaved date change
                          {cardProgress.dateChanges === 1 ? "" : "s"}
                        </span>
                      )}
                      {cardProgress.complete && (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                          Completed
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom Action Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDomainClick(domain);
                  }}
                  className="mt-auto w-full py-2.5 font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer text-sm flex items-center justify-center"
                >
                  Assess Domain
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail View: Single Domain Checklist */}
      {!loading && activeDomain && (
        <div className="flex flex-col min-h-0 w-full">
          {/* Back button */}
          <button
            type="button"
            onClick={() => setActiveDomain(null)}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors mb-3 cursor-pointer group w-fit"
          >
            <ArrowBackIcon
              sx={{ fontSize: 18 }}
              className="group-hover:-translate-x-0.5 transition-transform"
            />
            Back to Domains
          </button>

          {/* Responsive Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-sm">
            {/* Domain Title & Indicator Count */}
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900 tracking-tight leading-tight">
                {activeDomain.domain_name}
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {activeDomain.questions?.length
                  ? `${activeDomain.questions.length} Indicators Checklist`
                  : "Developmental Indicators"}
              </p>
            </div>

            {/* Filter Controls Grouping */}
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              {/* Student Selector */}
              <div className="relative min-w-[200px] sm:min-w-[240px]">
                <select
                  value={selectedLrn}
                  onChange={(e) => setSelectedLrn(e.target.value)}
                  className="w-full text-xs sm:text-sm py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer"
                >
                  <option value="" disabled>
                    Select Student to Assess
                  </option>
                  {students.length === 0 && (
                    <option disabled>No students found</option>
                  )}
                  {students.map((s) => {
                    const idVal = String(s.student_id);
                    return (
                      <option key={idVal} value={idVal}>
                        {s.first_name} {s.last_name} ({s.masked_lrn})
                      </option>
                    );
                  })}
                </select>
              </div>

              {selectedLrn && (
                <>
                  {/* Testing Period Selector & Status Badge */}
                  <div className="flex items-center gap-2">
                    <div className="relative min-w-[130px]">
                      <select
                        value={activePeriod}
                        onChange={(e) =>
                          setActivePeriod(e.target.value as Period)
                        }
                        className="w-full text-xs sm:text-sm py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer"
                      >
                        {(["PRE", "MID", "POST"] as Period[]).map((p) => (
                          <option key={p} value={p}>
                            {p === "PRE"
                              ? "Pre-Test"
                              : p === "MID"
                                ? "Mid-Test"
                                : "Post-Test"}
                            {` (Saved: ${periodProgress[p].savedCount} / ${periodProgress[p].total})`}
                            {periodProgress[p].draftCount > 0 ||
                            periodProgress[p].hasDateChange
                              ? " - Draft"
                              : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    {activeProgress.draftCount > 0 ||
                    activeProgress.hasDateChange ? (
                      <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                        Unsaved changes
                      </span>
                    ) : activeProgress.savedCount > 0 ? (
                      <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                        Saved: {activeProgress.savedCount} /{" "}
                        {activeProgress.total}
                      </span>
                    ) : activeProgress.inheritedCount > 0 ? (
                      <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium bg-slate-100 text-slate-600 whitespace-nowrap">
                        Inherited (not saved)
                      </span>
                    ) : (
                      <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium bg-slate-100 text-slate-600 whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                        Not Started
                      </span>
                    )}
                  </div>

                  {/* Date Picker & Decimal Age */}
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={assessmentDate}
                        min={getDateBounds(activePeriod).min}
                        max={getDateBounds(activePeriod).max}
                        onChange={(e) => handleDateChange(e.target.value)}
                        className={`text-xs sm:text-sm py-1.5 px-3 bg-slate-50 rounded-xl font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${dateError ? "border-2 border-rose-500 text-rose-700" : "border border-slate-200"}`}
                      />
                      {getDisplayAge(activePeriod) !== null &&
                        getDisplayAge(activePeriod) !== undefined && (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                            Decimal Age: {getDisplayAge(activePeriod)}
                          </span>
                        )}
                    </div>
                    {gradingDates?.[activePeriod] && (
                      <span className="text-[11px] text-slate-500 mt-1">
                        Grading Date:{" "}
                        {formatDisplayDate(gradingDates[activePeriod])}
                      </span>
                    )}
                    {dateError && (
                      <span className="text-[11px] font-semibold text-rose-600 mt-1 max-w-[280px]">
                        {dateError}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Empty Student State */}
          {!selectedLrn ? (
            <div className="p-8 sm:p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm mt-4">
              <div className="w-12 h-12 mx-auto rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-800 mb-1">
                Please select a student from the dropdown above to begin
                assessment.
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
                Select a student and testing period to record developmental
                milestones and evaluation answers.
              </p>
            </div>
          ) : evalLoading ? (
            <div className="flex justify-center items-center py-16 bg-white rounded-2xl border border-slate-200 shadow-sm mt-4">
              <CircularProgress />
            </div>
          ) : (
            <div className="w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[760px] table-fixed divide-y divide-slate-100">
                <colgroup>
                  <col className="w-[43%] min-w-[280px] lg:w-[46%]" />
                  <col className="w-[19%] min-w-[160px] lg:w-[18%]" />
                  <col className="w-[19%] min-w-[160px] lg:w-[18%]" />
                  <col className="w-[19%] min-w-[160px] lg:w-[18%]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 sm:px-4 text-[11px] lg:text-xs font-bold uppercase tracking-wider text-slate-600 text-left">
                      QUESTION / INDICATOR
                    </th>
                    {(["PRE", "MID", "POST"] as Period[]).map((p) => (
                      <th
                        key={p}
                        className="py-2.5 px-3 sm:px-4 text-[11px] lg:text-xs font-bold uppercase tracking-wider text-slate-600 text-center border-l border-slate-200"
                      >
                        {p === "PRE"
                          ? "PRE-TEST"
                          : p === "MID"
                            ? "MID-TEST"
                            : "POST-TEST"}
                        <span className="text-[10px] font-semibold text-slate-600 block normal-case">
                          Saved: {periodProgress[p].savedCount} /{" "}
                          {periodProgress[p].total}
                        </span>
                        {evaluations[p].date && (
                          <span className="text-[10px] font-semibold text-emerald-600 block normal-case">
                            Testing Date:{" "}
                            {formatDisplayDate(evaluations[p].date)}
                          </span>
                        )}
                        {periodProgress[p].draftCount > 0 && (
                          <span className="text-[10px] font-semibold text-amber-600 block normal-case">
                            {periodProgress[p].draftCount} unsaved change
                            {periodProgress[p].draftCount === 1 ? "" : "s"}
                          </span>
                        )}
                        {periodProgress[p].hasDateChange && (
                          <span className="text-[10px] font-semibold text-amber-600 block normal-case">
                            Unsaved date change
                          </span>
                        )}
                        {periodProgress[p].inheritedCount > 0 && (
                          <span className="text-[10px] font-normal text-slate-400 block normal-case">
                            {periodProgress[p].inheritedCount} inherited (not
                            saved)
                          </span>
                        )}
                        {getDisplayAge(p) !== null &&
                          getDisplayAge(p) !== undefined && (
                            <span className="text-[10px] font-normal text-slate-400 block font-sans normal-case">
                              Age: {getDisplayAge(p)}
                            </span>
                          )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {questions.map((q, index) => (
                    <tr
                      key={q.question_id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="py-2.5 px-3 sm:py-3 sm:px-4 align-middle">
                        <p className="text-xs lg:text-sm font-medium text-slate-800 leading-snug">
                          <span className="font-bold text-slate-900 mr-1.5">
                            {index + 1}.
                          </span>
                          {q.question_text}
                        </p>
                        {(q.is_home_based ||
                          q.evaluator_roles?.[activePeriod] === "parent") && (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {q.is_home_based && (
                              <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                Home-Based
                              </span>
                            )}
                            {q.evaluator_roles?.[activePeriod] === "parent" && (
                              <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                Parent Assessed
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      {["PRE", "MID", "POST"].map((period) => {
                        const isCurrentPeriod = period === activePeriod;
                        const answer = getAnswer(q.question_id, period);
                        return (
                          <td
                            key={period}
                            className="py-2.5 px-2 sm:px-3 text-center border-l border-slate-200 align-middle"
                          >
                            <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                              <button
                                type="button"
                                disabled={
                                  !isCurrentPeriod ||
                                  isPreKaya(q.question_id, period)
                                }
                                onClick={() =>
                                  handleAnswerChange(
                                    q.question_id,
                                    period,
                                    "KAYA",
                                  )
                                }
                                className={`h-8 lg:h-8 px-2.5 lg:px-3 text-xs min-w-[3.75rem] lg:min-w-[4.25rem] rounded-lg font-bold tracking-wide transition-all whitespace-nowrap flex items-center justify-center ${
                                  isCurrentPeriod
                                    ? answer === "KAYA"
                                      ? "bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-600 cursor-pointer active:scale-95"
                                      : "border border-emerald-600 text-emerald-700 bg-white hover:bg-emerald-50 cursor-pointer active:scale-95"
                                    : answer === "KAYA"
                                      ? "bg-emerald-100 text-emerald-700 border border-emerald-300 font-semibold cursor-not-allowed select-none"
                                      : "text-slate-400 bg-slate-50 border border-slate-200 cursor-not-allowed select-none opacity-60"
                                }`}
                              >
                                KAYA
                              </button>

                              <button
                                type="button"
                                disabled={
                                  !isCurrentPeriod ||
                                  isPreKaya(q.question_id, period)
                                }
                                onClick={() =>
                                  handleAnswerChange(
                                    q.question_id,
                                    period,
                                    "DI-KAYA",
                                  )
                                }
                                className={`h-8 lg:h-8 px-2.5 lg:px-3 text-xs min-w-[3.75rem] lg:min-w-[4.25rem] rounded-lg font-bold tracking-wide transition-all whitespace-nowrap flex items-center justify-center ${
                                  isCurrentPeriod
                                    ? answer === "DI-KAYA"
                                      ? "bg-rose-600 text-white shadow-sm ring-1 ring-rose-600 cursor-pointer active:scale-95"
                                      : "border border-rose-400 text-rose-600 bg-white hover:bg-rose-50 cursor-pointer active:scale-95"
                                    : answer === "DI-KAYA"
                                      ? "bg-rose-100 text-rose-700 border border-rose-300 font-semibold cursor-not-allowed select-none"
                                      : "text-slate-400 bg-slate-50 border border-slate-200 cursor-not-allowed select-none opacity-60"
                                }`}
                              >
                                DI-KAYA
                              </button>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Sticky Save Action Dock (Only show if a student is selected and not loading) */}
          {selectedLrn && !evalLoading && (
            <div className="sticky bottom-0 z-20 bg-white/95 backdrop-blur-md border border-slate-200 py-2.5 px-4 sm:px-6 flex items-center justify-between gap-4 mt-4 shadow-lg rounded-2xl flex-wrap">
              {/* Left Side: Status & Counter indicator */}
              <div className="flex items-center gap-3 flex-wrap">
                {/* Visual Status Indicator */}
                {activeProgress.savedCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                    Saved: {activeProgress.savedCount} / {activeProgress.total}
                  </span>
                ) : activeProgress.inheritedCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                    Saved: 0 / {activeProgress.total} ·{" "}
                    {activeProgress.inheritedCount} inherited (not saved)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                    Saved: 0 / {activeProgress.total}
                  </span>
                )}

                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-slate-700">
                    {"Evaluating "}
                    {activePeriod === "PRE"
                      ? "Pre-Test"
                      : activePeriod === "MID"
                        ? "Mid-Test"
                        : "Post-Test"}
                    :{" "}
                    <strong className="text-slate-900 font-bold">
                      {activeProgress.answeredCount}
                    </strong>{" "}
                    {"/"} {activeProgress.total} Answered
                  </span>
                </div>
                {activeProgress.complete && (
                  <span className="inline-flex text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    Completed
                  </span>
                )}
                {activeProgress.draftCount > 0 && (
                  <span className="inline-flex text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                    {activeProgress.draftCount} unsaved change
                    {activeProgress.draftCount === 1 ? "" : "s"}
                  </span>
                )}
                {activeProgress.hasDateChange && (
                  <span className="inline-flex text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                    Unsaved date change
                  </span>
                )}
              </div>

              {/* Right Side: Save Button */}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !!dateError}
                className="py-2 px-6 text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95"
              >
                {saving ? (
                  <>
                    <CircularProgress size={16} color="inherit" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Assessment</span>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {!loading && domains.length === 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          No assessment domains found.
        </Alert>
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          sx={{ width: "100%", boxShadow: 3, fontWeight: "bold" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </div>
  );
};
export default EccdAssessment;
