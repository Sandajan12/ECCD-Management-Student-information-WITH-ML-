import { useState } from "react";
import type { ChangeEvent } from "react";
import { Box, CircularProgress, Alert, Snackbar } from "@mui/material";
import BarChartIcon from "@mui/icons-material/BarChart";
import AssignmentIcon from "@mui/icons-material/Assignment";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlineOutlined";
import ChildCareIcon from "@mui/icons-material/ChildCare";
import SaveIcon from "@mui/icons-material/Save";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useChildren } from "../../hooks/useChildren";
import { useParentAssessment } from "../../hooks/useParentAssessment";
import { formatDisplayDate } from "../../utils/dateUtils";
import { PERIODS, type Period, type PeriodSummary } from "../../types";

const ParentEccdAssessment = () => {
  const roster = useChildren();
  const childrenList = roster.children;
  const selectedChildIndex = Math.max(
    0,
    childrenList.findIndex((child) => child.student_id === roster.selected),
  );
  const assessment = useParentAssessment(roster.child);
  const [activeTab, setActiveTab] = useState<"official" | "checklist">(
    "official",
  );
  const [toast, setToast] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });
  const loading = roster.loading || assessment.loading;
  const saving = assessment.saving;
  const error = roster.error || assessment.error;
  const handleAnswerChange = assessment.handleAnswerChange;
  const handleChildSwitch = (event: ChangeEvent<HTMLSelectElement>) => {
    const child = childrenList[Number(event.target.value)];
    if (child) roster.select(child.student_id);
  };
  const handleSaveHomeBased = async () => {
    const result = await assessment.handleSaveChecklist();
    if (result) setToast({ open: true, ...result });
  };

  const getInterpretationBadge = (interp: string | null | undefined) => {
    if (!interp) return <span className="text-slate-400 font-semibold">-</span>;

    const lower = interp.toLowerCase();
    if (lower.includes("average")) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
          {interp}
        </span>
      );
    }
    if (lower.includes("advance")) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
          {interp}
        </span>
      );
    }
    if (lower.includes("delay")) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
          {interp}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
        {interp}
      </span>
    );
  };

  if (loading && !assessment.data) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
        }}
      >
        <CircularProgress size={45} thickness={4} />
        <p className="text-slate-500 font-medium mt-4 text-sm">
          Loading ECCD assessment records...
        </p>
      </Box>
    );
  }

  if (childrenList.length === 0) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center mt-12 bg-white rounded-2xl border border-slate-200 shadow-sm">
        <ChildCareIcon
          sx={{ fontSize: 60 }}
          className="text-slate-300 mx-auto mb-3"
        />
        <h3 className="text-xl font-bold text-slate-800 mb-2">
          No Student Linked
        </h3>
        <p className="text-slate-500 text-sm mb-4">
          There are currently no active students linked to your parent account.
          Please verify with your child's class adviser.
        </p>
      </div>
    );
  }

  const currentChild = childrenList[selectedChildIndex];

  const summary: Record<Period, Partial<PeriodSummary>> = assessment.data
    ?.summary || {
    PRE: { isReleased: false },
    MID: { isReleased: false },
    POST: { isReleased: false },
  };
  const matrix = assessment.data?.matrix || [];
  const homeChecklist = assessment.data?.homeBasedChecklist || [];
  const selectedPeriod = assessment.activePeriod;
  const activeDomain = assessment.activeDomain;
  const canEditHomeBased = assessment.canEditHomeBased;

  const periodsConfig: { key: Period; title: string; permissionKey: string }[] =
    [
      {
        key: "PRE",
        title: "Pre-Test",
        permissionKey: "allow_parent_view_eccd_pre",
      },
      {
        key: "MID",
        title: "Mid-Test",
        permissionKey: "allow_parent_view_eccd_mid",
      },
      {
        key: "POST",
        title: "Post-Test",
        permissionKey: "allow_parent_view_eccd_post",
      },
    ];

  return (
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 md:px-6 py-3 sm:py-6 pb-20 md:pb-6">
      {/* 1. Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200/80 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            ECCD Assessment
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            View official DepEd assessment summaries and submit home-based
            evaluations.
          </p>
        </div>

        {/* Child Selector */}
        <div className="flex items-center gap-3">
          {childrenList.length > 1 ? (
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
              <ChildCareIcon className="text-blue-600 text-lg" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Select Child
                </span>
                <select
                  value={selectedChildIndex}
                  onChange={handleChildSwitch}
                  className="text-sm font-semibold text-slate-800 bg-transparent outline-none cursor-pointer pr-4"
                >
                  {childrenList.map((c, idx) => (
                    <option key={c.student_id} value={idx}>
                      {c.first_name} {c.last_name} ({c.masked_lrn})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-xs">
              <ChildCareIcon className="text-blue-600" />
              <div>
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">
                  Student
                </span>
                <span className="text-sm font-bold text-slate-800">
                  {currentChild?.first_name} {currentChild?.last_name}
                </span>
                <span className="text-xs text-slate-500 ml-1.5 font-medium">
                  ({currentChild?.masked_lrn})
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <Alert severity="error" sx={{ mb: 4, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {/* 2. Tab Switcher with Blue Highlight Indicator */}
      <div className="flex flex-col sm:flex-row gap-2 border-b border-slate-200 mb-6 sm:mb-8 bg-white/60 p-1.5 rounded-2xl border backdrop-blur-xs">
        <button
          type="button"
          onClick={() => setActiveTab("official")}
          className={`flex-1 flex items-center justify-center gap-2 px-3 sm:px-5 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-bold transition-all duration-150 cursor-pointer ${
            activeTab === "official"
              ? "bg-blue-600 text-white shadow-sm ring-2 ring-blue-600/20"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/60"
          }`}
        >
          <BarChartIcon sx={{ fontSize: 20 }} />
          <span>Official Evaluation Summary</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("checklist")}
          className={`flex-1 flex items-center justify-center gap-2 px-3 sm:px-5 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-bold transition-all duration-150 cursor-pointer ${
            activeTab === "checklist"
              ? "bg-blue-600 text-white shadow-sm ring-2 ring-blue-600/20"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/60"
          }`}
        >
          <AssignmentIcon sx={{ fontSize: 20 }} />
          <span>Home-Based Checklist</span>
          {homeChecklist.length > 0 && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                activeTab === "checklist"
                  ? "bg-blue-500 text-white"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {homeChecklist.length}
            </span>
          )}
        </button>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: OFFICIAL EVALUATION SUMMARY                             */}
      {/* ============================================================== */}
      {activeTab === "official" && (
        <div>
          {/* Section: Testing Period Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
            {periodsConfig.map(({ key, title }) => {
              const periodData = summary[key] || {};
              const isReleased = assessment.isPeriodReleased(key);
              const isEvaluated = Boolean(periodData.isEvaluated);

              return (
                <div
                  key={key}
                  className="bg-white rounded-2xl border border-slate-200/90 shadow-sm flex flex-col overflow-hidden transition-shadow hover:shadow-md"
                >
                  {/* Card Header */}
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <span className="font-bold text-slate-800 text-base">
                      {title}
                    </span>
                    {isReleased ? (
                      isEvaluated ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircleIcon sx={{ fontSize: 13 }} />
                          Evaluated
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                          <HelpOutlineIcon sx={{ fontSize: 13 }} />
                          Not Evaluated
                        </span>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        <LockOutlinedIcon sx={{ fontSize: 13 }} />
                        Unreleased
                      </span>
                    )}
                  </div>

                  {/* Card Body */}
                  <div className="p-5 flex-grow flex flex-col justify-center">
                    {!isReleased ? (
                      /* b. Locked / Unreleased State (Pending Adviser Release) */
                      <div className="py-6 px-3 flex flex-col items-center text-center">
                        <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3 shadow-xs">
                          <LockOutlinedIcon sx={{ fontSize: 28 }} />
                        </div>
                        <h4 className="text-base font-bold text-slate-700 mb-1">
                          Results Pending Adviser Release
                        </h4>
                        <p className="text-xs text-slate-500 leading-relaxed max-w-xs">
                          The class adviser has not yet published the evaluation
                          results for this testing window.
                        </p>
                      </div>
                    ) : !isEvaluated ? (
                      /* Released but not evaluated */
                      <div className="py-6 px-3 flex flex-col items-center text-center">
                        <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-300 mb-3">
                          <HelpOutlineIcon sx={{ fontSize: 28 }} />
                        </div>
                        <h4 className="text-base font-bold text-slate-700 mb-1">
                          Evaluation Not Started
                        </h4>
                        <p className="text-xs text-slate-500 leading-relaxed max-w-xs">
                          Evaluation items for this period have not yet been
                          recorded by the class adviser.
                        </p>
                      </div>
                    ) : (
                      /* a. Released & Evaluated State */
                      <div className="space-y-3.5">
                        <div className="flex items-center justify-between text-sm py-1 border-b border-slate-100">
                          <span className="text-slate-500 font-medium">
                            Assessment Date
                          </span>
                          <span className="font-semibold text-slate-800">
                            {formatDisplayDate(periodData.assessmentDate, "-")}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-sm py-1 border-b border-slate-100">
                          <span className="text-slate-500 font-medium">
                            Decimal Age
                          </span>
                          <span className="font-bold text-slate-800">
                            {periodData.decimalAge !== null &&
                            periodData.decimalAge !== undefined
                              ? periodData.decimalAge
                              : "-"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-sm py-1 border-b border-slate-100">
                          <span className="text-slate-500 font-medium">
                            Standard Score
                          </span>
                          <span className="inline-flex items-center justify-center px-3 py-0.5 rounded-lg bg-blue-100 text-blue-700 font-extrabold text-sm border border-blue-200">
                            {periodData.standardScore !== null &&
                            periodData.standardScore !== undefined
                              ? periodData.standardScore
                              : "-"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-sm py-1">
                          <span className="text-slate-500 font-medium">
                            Interpretation
                          </span>
                          <div>
                            {getInterpretationBadge(periodData.interpretation)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Section: DepEd Official ECCD Summary Matrix Table */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden p-5 sm:p-6 mb-10">
            <div className="mb-5">
              <h3 className="text-lg font-bold text-slate-900">
                DepEd Official ECCD Summary Matrix
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Standardized domain scaled scores based on DepEd Early Childhood
                Care and Development scoring matrix.
              </p>
            </div>

            <div className="overflow-x-auto w-full -mx-2 px-2 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[540px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-y border-slate-200 text-slate-500 uppercase text-[11px] font-bold tracking-wider">
                    <th className="py-3.5 px-4 font-bold">
                      DEVELOPMENTAL DOMAIN
                    </th>
                    <th className="py-3.5 px-4 text-center font-bold">
                      PRE-TEST SCALED
                    </th>
                    <th className="py-3.5 px-4 text-center font-bold">
                      MID-TEST SCALED
                    </th>
                    <th className="py-3.5 px-4 text-center font-bold">
                      POST-TEST SCALED
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {matrix.map((row) => (
                    <tr
                      key={row.domain_id}
                      className="hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {row.domain_name}
                      </td>
                      {PERIODS.map((period) => {
                        const score = assessment.isPeriodReleased(period)
                          ? row.scores?.[period]
                          : null;
                        return (
                          <td key={period} className="py-3 px-4 text-center">
                            {score !== null && score !== undefined ? (
                              <span className="inline-flex items-center justify-center min-w-[36px] h-7 px-2.5 rounded-full bg-slate-100 text-slate-800 font-bold text-xs border border-slate-200 shadow-xs">
                                {score}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-semibold text-sm">
                                -
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {/* Summary Row 1: Sum of Scaled Scores */}
                  <tr className="border-t-2 border-slate-200 bg-slate-50/40 text-sm">
                    <td className="py-3 px-4 font-bold text-slate-700">
                      Sum of Scaled Scores
                    </td>
                    {PERIODS.map((period) => {
                      const sumVal = assessment.isPeriodReleased(period)
                        ? summary[period]?.sumOfScaledScores
                        : null;
                      return (
                        <td
                          key={period}
                          className="py-3 px-4 text-center font-bold text-slate-800"
                        >
                          {sumVal !== null && sumVal !== undefined ? (
                            <span className="inline-flex items-center justify-center min-w-[36px] h-7 px-2.5 rounded-full bg-slate-200 text-slate-800 font-extrabold text-xs">
                              {sumVal}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-semibold text-sm">
                              -
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Summary Row 2: Standard Score */}
                  <tr className="bg-slate-50/40 text-sm">
                    <td className="py-3 px-4 font-bold text-slate-700">
                      Standard Score
                    </td>
                    {PERIODS.map((period) => {
                      const stdScore = assessment.isPeriodReleased(period)
                        ? summary[period]?.standardScore
                        : null;
                      return (
                        <td key={period} className="py-3 px-4 text-center">
                          {stdScore !== null && stdScore !== undefined ? (
                            <span className="inline-flex items-center justify-center px-3 py-1 rounded-lg bg-blue-100 text-blue-700 font-extrabold text-xs border border-blue-200">
                              {stdScore}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-semibold text-sm">
                              -
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Summary Row 3: DepEd Interpretation */}
                  <tr className="bg-slate-50/40 text-sm">
                    <td className="py-3 px-4 font-bold text-slate-700">
                      Overall Interpretation
                    </td>
                    {PERIODS.map((period) => (
                      <td key={period} className="py-3 px-4 text-center">
                        {assessment.isPeriodReleased(period) &&
                        summary[period]?.interpretation ? (
                          getInterpretationBadge(
                            summary[period]?.interpretation,
                          )
                        ) : (
                          <span className="text-slate-400 font-semibold text-sm">
                            -
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: HOME-BASED CHECKLIST                                    */}
      {/* ============================================================== */}
      {activeTab === "checklist" && (
        <div>
          {/* Access Enforcement Banner */}
          {!assessment.hasOpenPeriod && (
            <div className="flex items-start sm:items-center gap-3 p-4 mb-6 bg-amber-50 border border-amber-200/90 rounded-2xl text-amber-900 shadow-xs">
              <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0 mt-0.5 sm:mt-0">
                <LockOutlinedIcon sx={{ fontSize: 20 }} />
              </div>
              <div className="text-sm">
                <span className="font-bold block">
                  Submission Closed / Read-Only
                </span>
                <span className="text-amber-800/90 text-xs sm:text-sm">
                  Editing is currently locked by the Class Adviser. You can only
                  view the submitted checklist.
                </span>
              </div>
            </div>
          )}

          {assessment.hasOpenPeriod && (
            <div className="flex items-start sm:items-center gap-3 p-4 mb-6 bg-blue-50 border border-blue-200/80 rounded-2xl text-blue-900 shadow-xs">
              <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0 mt-0.5 sm:mt-0">
                <CheckCircleIcon sx={{ fontSize: 20 }} />
              </div>
              <div className="text-sm">
                <span className="font-bold block">
                  Home-Based Checklist Open for Submission
                </span>
                {/* Preserve the reference text-node boundaries for identical font shaping. */}
                {/* prettier-ignore */}
                <span className="text-blue-800/90 text-xs sm:text-sm">
                  Evaluate your child's home activities. Select <strong className="text-emerald-700">KAYA</strong> if able to perform independently, or <strong className="text-rose-700">DI-KAYA</strong> if not yet capable.
                </span>
              </div>
            </div>
          )}

          <div className="sticky top-14 z-20 legacy-md:top-0 flex flex-wrap items-center justify-between gap-3 mb-4 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-sm">
            <h2 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900 tracking-tight leading-tight">
              Developmental Domains
            </h2>
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              <div className="relative min-w-[130px]">
                <select
                  aria-label="Testing period"
                  value={assessment.selectedPeriod || ""}
                  disabled={
                    saving || loading || !assessment.viewablePeriods.length
                  }
                  onChange={(event) =>
                    assessment.setSelectedPeriod(event.target.value as Period)
                  }
                  className="w-full text-xs sm:text-sm py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer"
                >
                  {!assessment.viewablePeriods.length && (
                    <option value="">No periods open</option>
                  )}
                  {assessment.viewablePeriods.map((period) => (
                    <option key={period} value={period}>
                      {
                        periodsConfig.find((config) => config.key === period)
                          ?.title
                      }
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={handleSaveHomeBased}
                disabled={
                  saving || loading || !assessment.canEditPeriod(selectedPeriod)
                }
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <SaveIcon sx={{ fontSize: 18 }} />
                )}
                <span>{saving ? "Saving..." : "Save Assessment"}</span>
              </button>
            </div>
          </div>
          {!assessment.canViewMarks && (
            <p className="text-xs text-slate-500 mb-4">
              Marks hidden by class adviser. Your own home-based observations
              remain visible while editing is permitted.
            </p>
          )}
          {!activeDomain ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-7xl mx-auto">
              {assessment.checklistDomains.map((domain, index) => {
                const homeCount = domain.questions.filter(
                  (question) => question.is_home_based === true,
                ).length;
                return (
                  <div
                    key={domain.domain_id}
                    className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between h-full hover:shadow-md hover:border-slate-300 transition-all group"
                  >
                    <div>
                      <div className="flex items-start gap-3.5 mb-4">
                        <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 font-black text-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-base lg:text-lg font-bold text-slate-800 leading-snug break-words">
                            {domain.domain_name}
                          </h3>
                          <p className="text-xs text-slate-500 font-medium mt-1">
                            {domain.questions.length} Indicators Checklist
                          </p>
                        </div>
                      </div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        {homeCount
                          ? "Contains Home Questions"
                          : "Teacher Assessed / View Only"}
                      </span>
                      <div className="flex flex-col gap-2.5 my-4 pt-2 border-t border-slate-100">
                        {periodsConfig.map(({ key, title }) => {
                          const progress = assessment.domainProgress(
                            domain,
                            key,
                          );
                          return (
                            <div key={key}>
                              <div className="flex justify-between items-center gap-2 mb-1 text-xs">
                                <span className="font-semibold text-slate-600">
                                  {title}
                                </span>
                                <span
                                  className={`font-bold ${key === "PRE" ? "text-blue-600" : key === "MID" ? "text-amber-600" : "text-emerald-600"}`}
                                >
                                  {progress.percentage === null
                                    ? "Pending Adviser Release"
                                    : `${progress.percentage}%${progress.provisional ? " (provisional)" : ""}`}
                                </span>
                              </div>
                              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${key === "PRE" ? "bg-blue-500" : key === "MID" ? "bg-amber-500" : "bg-emerald-500"}`}
                                  style={{
                                    width: `${progress.percentage ?? 0}%`,
                                  }}
                                />
                              </div>
                              {progress.local > 0 && (
                                <p className="text-xs text-slate-500 mt-1">
                                  {progress.local} local observation(s) /{" "}
                                  {progress.total} indicators
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => assessment.setActiveDomain(domain)}
                      aria-label={`${homeCount ? "Assess" : "View"} ${domain.domain_name}`}
                      className="mt-auto w-full py-2.5 font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer text-sm shadow-xs flex items-center justify-center"
                    >
                      {homeCount ? "Assess Domain" : "View Domain"}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col min-h-0 w-full">
              <button
                type="button"
                onClick={() => assessment.setActiveDomain(null)}
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors mb-3 cursor-pointer group w-fit"
              >
                <ArrowBackIcon
                  sx={{ fontSize: 18 }}
                  className="group-hover:-translate-x-0.5 transition-transform"
                />
                Back to Domains
              </button>
              <h2 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900 tracking-tight leading-tight mb-4">
                {activeDomain.domain_name}
              </h2>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-12">
                {[
                  { home: true, title: "Home-Based Questions" },
                  {
                    home: false,
                    title: "School-Administered Questions · View Only",
                  },
                ].map((group) => {
                  const questions = assessment
                    .sortedQuestions(activeDomain.questions)
                    .filter(
                      (question) =>
                        (question.is_home_based === true) === group.home,
                    );
                  if (!questions.length) return null;
                  return (
                    <section key={group.title} aria-label={group.title}>
                      <h3 className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600">
                        {group.title}
                      </h3>
                      <div className="divide-y divide-slate-100">
                        {questions.map((question) => {
                          const answer = assessment.getAnswer(
                            question.question_id,
                            selectedPeriod,
                          );
                          return (
                            <div
                              key={question.question_id}
                              role="group"
                              aria-label={question.question_text}
                              className="flex flex-wrap items-center justify-between gap-3 py-3 px-4 hover:bg-slate-50/70 transition-colors"
                            >
                              <div className="flex-1 min-w-0 basis-full sm:basis-auto">
                                <p className="text-xs lg:text-sm font-medium text-slate-800 leading-snug break-words">
                                  {question.question_text}
                                </p>
                                {!group.home && (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 mt-1">
                                    Teacher Assessed — View Only
                                  </span>
                                )}
                              </div>
                              {group.home ? (
                                <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                                  {(["KAYA", "DI-KAYA"] as const).map(
                                    (value) => (
                                      <button
                                        key={value}
                                        type="button"
                                        aria-pressed={answer === value}
                                        disabled={
                                          !assessment.selectedPeriod ||
                                          !assessment.canEditPeriod(
                                            selectedPeriod,
                                          ) ||
                                          saving ||
                                          loading
                                        }
                                        onClick={() =>
                                          handleAnswerChange(
                                            question.question_id,
                                            selectedPeriod,
                                            value,
                                          )
                                        }
                                        className={`min-w-[44px] min-h-[36px] px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${answer === value ? (value === "KAYA" ? "bg-emerald-600 text-white shadow-xs" : "bg-rose-600 text-white shadow-xs") : "bg-slate-100 text-slate-600 hover:bg-slate-200"} ${!assessment.canEditPeriod(selectedPeriod) ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                                      >
                                        {value}
                                      </button>
                                    ),
                                  )}
                                </div>
                              ) : !assessment.canViewMarks ? (
                                <span className="text-xs text-slate-500">
                                  Marks hidden by class adviser
                                </span>
                              ) : (
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${answer === "KAYA" ? "bg-emerald-100 text-emerald-800 border-emerald-200" : answer === "DI-KAYA" ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}
                                >
                                  {answer || "Not yet evaluated"}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
                {canEditHomeBased && (
                  <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveHomeBased}
                      disabled={
                        saving ||
                        loading ||
                        !assessment.canEditPeriod(selectedPeriod)
                      }
                      className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {saving ? (
                        <CircularProgress size={16} color="inherit" />
                      ) : (
                        <SaveIcon sx={{ fontSize: 18 }} />
                      )}
                      <span>{saving ? "Saving..." : "Save Assessment"}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Snackbar feedback */}
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setToast({ ...toast, open: false })}
          severity={toast.severity}
          sx={{ width: "100%", borderRadius: 2, fontWeight: "bold" }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </div>
  );
};

export default ParentEccdAssessment;
