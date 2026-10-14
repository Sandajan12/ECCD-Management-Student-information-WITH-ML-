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
import { useChildren } from "../../hooks/useChildren";
import { useParentAssessment } from "../../hooks/useParentAssessment";
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
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
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
  const homeChecklist = (assessment.data?.homeBasedChecklist || []).map(
    (question) => ({
      ...question,
      domain_name:
        question.domain_name ||
        assessment.checklistDomains
          .find((domain) => domain.domain_id === question.domain_id)
          ?.domain_name.replace(/ Domain$/i, "") ||
        "",
    }),
  );
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
                            {formatDate(periodData.assessmentDate)}
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
          {!canEditHomeBased && (
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

          {canEditHomeBased && (
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

          {/* Checklist questions */}
          {homeChecklist.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
              <AssignmentIcon
                sx={{ fontSize: 50 }}
                className="text-slate-300 mx-auto mb-2"
              />
              <h4 className="text-base font-bold text-slate-700">
                No Home-Based Indicators Assigned
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                There are no assessment questions flagged for home evaluation at
                this time.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden mb-12">
              <div className="p-4 sm:p-5 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Home-Based Evaluation Checklist
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Parent observations of child developmental skills at home.
                  </p>
                </div>
                {canEditHomeBased && (
                  <button
                    type="button"
                    onClick={handleSaveHomeBased}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {saving ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : (
                      <SaveIcon sx={{ fontSize: 18 }} />
                    )}
                    <span>{saving ? "Saving..." : "Save Assessment"}</span>
                  </button>
                )}
              </div>

              <div className="overflow-x-auto w-full -mx-2 px-2 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[580px] text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold tracking-wider">
                      <th className="py-3 px-3 w-10 text-center">#</th>
                      <th className="py-3 px-4">INDICATOR / QUESTION</th>
                      <th className="py-3 px-3 w-28 text-center">PRE-TEST</th>
                      <th className="py-3 px-3 w-28 text-center">MID-TEST</th>
                      <th className="py-3 px-3 w-28 text-center">POST-TEST</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {homeChecklist.map((q, idx) => (
                      <tr
                        key={q.question_id}
                        className="hover:bg-slate-50/60 transition-colors"
                      >
                        <td className="py-4 px-3 text-center font-bold text-slate-400 text-xs">
                          {idx + 1}
                        </td>
                        <td className="py-4 px-4">
                          <span className="text-xs font-semibold text-blue-600 block mb-0.5 uppercase tracking-wide">
                            {q.domain_name}
                          </span>
                          <span className="text-slate-800 font-medium text-sm leading-relaxed">
                            {q.question_text}
                          </span>
                        </td>

                        {PERIODS.map((period) => {
                          const ans = assessment.getAnswer(
                            q.question_id,
                            period,
                          );

                          return (
                            <td
                              key={period}
                              className="py-4 px-2 text-center align-middle"
                            >
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleAnswerChange(
                                      q.question_id,
                                      period,
                                      "KAYA",
                                    )
                                  }
                                  disabled={!canEditHomeBased || saving}
                                  className={`min-w-[44px] min-h-[36px] px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                                    ans === "KAYA"
                                      ? "bg-emerald-600 text-white shadow-xs"
                                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                  } ${!canEditHomeBased ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                                >
                                  KAYA
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleAnswerChange(
                                      q.question_id,
                                      period,
                                      "DI-KAYA",
                                    )
                                  }
                                  disabled={!canEditHomeBased || saving}
                                  className={`min-w-[44px] min-h-[36px] px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                                    ans === "DI-KAYA"
                                      ? "bg-rose-600 text-white shadow-xs"
                                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                  } ${!canEditHomeBased ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
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

              {canEditHomeBased && (
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveHomeBased}
                    disabled={saving}
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
