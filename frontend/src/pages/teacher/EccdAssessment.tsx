import React, { useState, useEffect, useCallback, useRef } from "react";
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
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DownloadIcon from "@mui/icons-material/Download";
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
import { useTeacherAssessment } from "../../hooks/useTeacherAssessment";
import {
  domainCompletion,
  sectionAssessments,
} from "../../utils/teacherMetrics";
import type {
  Domain as AssessmentDomain,
  DomainProgress,
  Period,
  Student,
} from "../../types";
interface Domain extends AssessmentDomain, DomainProgress {}
const EccdAssessment: React.FC = () => {
  const { user } = useAuth();
  const { section, sections } = useTeacher();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedLrn, setSelectedLrn] = useState("");
  const [domains, setDomains] = useState<Domain[]>([]);
  const [activeDomain, setActiveDomain] = useState<Domain | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadMenuAnchor, setDownloadMenuAnchor] =
    useState<HTMLElement | null>(null);
  const [singleDownloadModalOpen, setSingleDownloadModalOpen] = useState(false);
  const [downloadTargetLrn, setDownloadTargetLrn] = useState("");
  const [activePeriod, setActivePeriod] = useState<Period>("PRE");
  const requestVersion = useRef(0);
  const progressVersion = useRef(0);
  const [pageError, setPageError] = useState("");
  const fetchDomainsProgress = useCallback(
    async (quiet = false) => {
      const version = ++progressVersion.current;
      if (!quiet) setLoading(true);
      try {
        const res = await api.get<Domain[]>("/api/eccd/domains-progress");
        let progress = res.data;
        if (section && sections.length > 1) {
          const roster = await api.get<Student[]>(
            "/api/students/section/" + section.section_id,
          );
          const assessments = await sectionAssessments(
            roster.data.filter((student) => student.is_active),
          );
          progress = progress.map((domain) => ({
            ...domain,
            ...domainCompletion(domain, assessments),
          }));
        } else if (!section)
          progress = progress.map((domain) => ({
            ...domain,
            pre_progress: 0,
            mid_progress: 0,
            post_progress: 0,
          }));
        if (version !== progressVersion.current) return;
        setDomains(progress);
        localStorage.setItem(
          "ames_teacher_domains_" + user?.id + "_" + section?.section_id,
          JSON.stringify(progress),
        );
      } catch (err) {
        if (version !== progressVersion.current) return;
        if (isNetworkError(err)) {
          try {
            setDomains(
              JSON.parse(
                localStorage.getItem(
                  "ames_teacher_domains_" +
                    user?.id +
                    "_" +
                    section?.section_id,
                ) || "[]",
              ) as Domain[],
            );
          } catch {
            /* Keep existing questions. */
          }
        }
        setPageError(errorMessage(err));
      } finally {
        if (!quiet && version === progressVersion.current) setLoading(false);
      }
    },
    [user?.id, section?.section_id, sections.length],
  );
  const {
    assessmentDate,
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
  } = useTeacherAssessment(
    Number(selectedLrn),
    activeDomain,
    activePeriod,
    fetchDomainsProgress,
  );
  const error = pageError || assessmentError;
  const formatDisplayDate = (value: string | null) =>
    value ? new Date(value + "T00:00:00").toLocaleDateString("en-GB") : "";
  const getDisplayAge = (p: Period) =>
    activeDomain ? evalAges[activeDomain.domain_id]?.[p] : null;
  useEffect(() => {
    setSelectedLrn("");
    setDownloadTargetLrn("");
    const version = ++requestVersion.current;
    setStudents([]);
    setPageError("");
    const cacheKey =
      "ames_teacher_roster_" + user?.id + "_" + section?.section_id;
    const load = async () => {
      try {
        const res = await api.get<Student[]>("/api/eccd/students");
        if (version !== requestVersion.current) return;
        const roster = res.data.filter(
          (s) => s.is_active && s.section_id === section?.section_id,
        );
        setStudents(roster);
        localStorage.setItem(cacheKey, JSON.stringify(roster));
      } catch (err) {
        if (version !== requestVersion.current) return;
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
    void load();
    void fetchDomainsProgress();
    const reload = () => {
      void load();
      void fetchDomainsProgress();
    };
    window.addEventListener("online", reload);
    window.addEventListener("ames-record-synced", reload);
    return () => {
      ++requestVersion.current;
      ++progressVersion.current;
      window.removeEventListener("online", reload);
      window.removeEventListener("ames-record-synced", reload);
    };
  }, [section?.section_id, user?.id, fetchDomainsProgress]);
  const handleDomainClick = (domain: Domain) => {
    setActiveDomain(domain);
    setSelectedLrn("");
  };
  const handleDownloadSpecific = async (id: string) => {
    if (!id || downloading) return;
    setDownloading(true);
    try {
      await downloadFile(
        "/api/teachers/download/" + id,
        "ECCD_Assessment.xlsx",
      );
      setSnackbar({
        open: true,
        message: "Assessment checklist downloaded successfully!",
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
  const handleDownloadAll = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadFile(
        "/api/teachers/download-all",
        "Class_ECCD_Assessments.zip",
      );
      setSnackbar({
        open: true,
        message: "All section assessments downloaded successfully!",
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
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "center" },
          mb: 4,
          flexDirection: { xs: "column", sm: "row" },
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
        <Box
          sx={{
            display: "flex",
            gap: 2,
            alignItems: "center",
            flexWrap: "wrap",
            flexShrink: 0,
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
            disabled={downloading}
            sx={{ borderRadius: 2, fontWeight: "bold", flexShrink: 0 }}
          >
            {downloading ? "Downloading..." : "Download Records"}
          </Button>
        </Box>
      </Box>

      <Menu
        anchorEl={downloadMenuAnchor}
        open={Boolean(downloadMenuAnchor)}
        onClose={() => setDownloadMenuAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            setDownloadMenuAnchor(null);
            setSingleDownloadModalOpen(true);
          }}
        >
          Download Single Student
        </MenuItem>
        <MenuItem
          onClick={() => {
            setDownloadMenuAnchor(null);
            handleDownloadAll();
          }}
        >
          Download All Students (ZIP)
        </MenuItem>
      </Menu>

      <Dialog
        open={singleDownloadModalOpen}
        onClose={() => setSingleDownloadModalOpen(false)}
      >
        <DialogTitle>Select Student to Download</DialogTitle>
        <DialogContent sx={{ minWidth: "25rem", pt: 2 }}>
          <FormControl fullWidth size="small" sx={{ mt: 1 }}>
            <InputLabel id="teacher-export-student-label">
              Select Student
            </InputLabel>
            <Select
              labelId="teacher-export-student-label"
              value={downloadTargetLrn}
              label="Select Student"
              onChange={(e) => setDownloadTargetLrn(e.target.value)}
            >
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
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              handleDownloadSpecific(downloadTargetLrn);
              setSingleDownloadModalOpen(false);
            }}
            disabled={!downloadTargetLrn || downloading}
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
                        <option value="PRE">
                          Pre-Test{" "}
                          {evaluations.PRE?.isSaved
                            ? "✓"
                            : Object.keys(evaluations.PRE?.answers || {})
                                  .length > 0
                              ? "✎ (Draft)"
                              : ""}
                        </option>
                        <option value="MID">
                          Mid-Test{" "}
                          {evaluations.MID?.isSaved
                            ? "✓"
                            : Object.keys(evaluations.MID?.answers || {})
                                  .length > 0
                              ? "✎ (Draft)"
                              : ""}
                        </option>
                        <option value="POST">
                          Post-Test{" "}
                          {evaluations.POST?.isSaved
                            ? "✓"
                            : Object.keys(evaluations.POST?.answers || {})
                                  .length > 0
                              ? "✎ (Draft)"
                              : ""}
                        </option>
                      </select>
                    </div>

                    {evaluations[activePeriod]?.isSaved ? (
                      <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                        Saved
                      </span>
                    ) : Object.keys(evaluations[activePeriod]?.answers || {})
                        .length > 0 ? (
                      <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                        Unsaved Draft
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
                    <th className="py-2.5 px-3 sm:px-4 text-[11px] lg:text-xs font-bold uppercase tracking-wider text-slate-600 text-center border-l border-slate-200">
                      PRE-TEST
                      {evaluations.PRE.isSaved && evaluations.PRE.date ? (
                        <span className="text-[10px] font-semibold text-emerald-600 block normal-case">
                          Saved: {formatDisplayDate(evaluations.PRE.date)}
                        </span>
                      ) : Object.keys(evaluations.PRE.answers || {}).length >
                        0 ? (
                        <span className="text-[10px] font-semibold text-amber-600 block normal-case">
                          Unsaved Draft
                        </span>
                      ) : (
                        <span className="text-[10px] font-normal text-slate-400 block normal-case">
                          Not yet evaluated
                        </span>
                      )}
                      {getDisplayAge("PRE") !== null &&
                        getDisplayAge("PRE") !== undefined && (
                          <span className="text-[10px] font-normal text-slate-400 block font-sans normal-case">
                            Age: {getDisplayAge("PRE")}
                          </span>
                        )}
                    </th>
                    <th className="py-2.5 px-3 sm:px-4 text-[11px] lg:text-xs font-bold uppercase tracking-wider text-slate-600 text-center border-l border-slate-200">
                      MID-TEST
                      {evaluations.MID.isSaved && evaluations.MID.date ? (
                        <span className="text-[10px] font-semibold text-emerald-600 block normal-case">
                          Saved: {formatDisplayDate(evaluations.MID.date)}
                        </span>
                      ) : Object.keys(evaluations.MID.answers || {}).length >
                        0 ? (
                        <span className="text-[10px] font-semibold text-amber-600 block normal-case">
                          Pre-filled Draft
                        </span>
                      ) : (
                        <span className="text-[10px] font-normal text-slate-400 block normal-case">
                          Not yet evaluated
                        </span>
                      )}
                      {getDisplayAge("MID") !== null &&
                        getDisplayAge("MID") !== undefined && (
                          <span className="text-[10px] font-normal text-slate-400 block font-sans normal-case">
                            Age: {getDisplayAge("MID")}
                          </span>
                        )}
                    </th>
                    <th className="py-2.5 px-3 sm:px-4 text-[11px] lg:text-xs font-bold uppercase tracking-wider text-slate-600 text-center border-l border-slate-200">
                      POST-TEST
                      {evaluations.POST.isSaved && evaluations.POST.date ? (
                        <span className="text-[10px] font-semibold text-emerald-600 block normal-case">
                          Saved: {formatDisplayDate(evaluations.POST.date)}
                        </span>
                      ) : Object.keys(evaluations.POST.answers || {}).length >
                        0 ? (
                        <span className="text-[10px] font-semibold text-amber-600 block normal-case">
                          Pre-filled Draft
                        </span>
                      ) : (
                        <span className="text-[10px] font-normal text-slate-400 block normal-case">
                          Not yet evaluated
                        </span>
                      )}
                      {getDisplayAge("POST") !== null &&
                        getDisplayAge("POST") !== undefined && (
                          <span className="text-[10px] font-normal text-slate-400 block font-sans normal-case">
                            Age: {getDisplayAge("POST")}
                          </span>
                        )}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {activeDomain.questions?.map((q, index) => (
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
                              {/* KAYA BUTTON */}
                              <button
                                type="button"
                                disabled={!isCurrentPeriod}
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

                              {/* DI-KAYA BUTTON */}
                              <button
                                type="button"
                                disabled={!isCurrentPeriod}
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
                {evaluations[activePeriod]?.isSaved ? (
                  <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                    Saved in Database (
                    {formatDisplayDate(evaluations[activePeriod]?.date) ||
                      assessmentDate}
                    )
                  </span>
                ) : Object.keys(evaluations[activePeriod]?.answers || {})
                    .length > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                    Pre-filled Draft (
                    {activeDomain.questions?.filter((q) =>
                      getAnswer(q.question_id, activePeriod),
                    )?.length || 0}
                    /{activeDomain.questions?.length || 0} items ready)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                    Not yet evaluated (Unsaved Draft)
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
                      {activeDomain.questions?.filter((q) =>
                        getAnswer(q.question_id, activePeriod),
                      )?.length || 0}
                    </strong>{" "}
                    {"/"} {activeDomain.questions?.length || 0} Answered
                  </span>
                </div>
                {evaluations[activePeriod]?.isSaved ? (
                  (activeDomain.questions?.filter((q) =>
                    getAnswer(q.question_id, activePeriod),
                  )?.length || 0) === (activeDomain.questions?.length || 0) &&
                  (activeDomain.questions?.length || 0) > 0 && (
                    <span className="hidden sm:inline-flex text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      Completed
                    </span>
                  )
                ) : (
                  <span className="hidden sm:inline-flex text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                    Unsaved
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
