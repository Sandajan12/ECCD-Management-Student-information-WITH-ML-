import { useState } from "react";
import type { ChangeEvent } from "react";
import { Box, CircularProgress, Alert } from "@mui/material";
import BarChartIcon from "@mui/icons-material/BarChart";
import AssignmentIcon from "@mui/icons-material/Assignment";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlineOutlined";
import ChildCareIcon from "@mui/icons-material/ChildCare";
import ReadOnlyDomainChecklist from "../../components/parent/ReadOnlyDomainChecklist";
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
  const assessment = useParentAssessment(roster.child, true);
  const [activeTab, setActiveTab] = useState<"official" | "checklist">(
    "official",
  );
  const loading = roster.loading || assessment.loading;
  const error = roster.error || assessment.error;
  const handleChildSwitch = (event: ChangeEvent<HTMLSelectElement>) => {
    const child = childrenList[Number(event.target.value)];
    if (child) roster.select(child.student_id);
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

  const periodsConfig: { key: Period; title: string }[] = [
    {
      key: "PRE",
      title: "Pre-Test",
    },
    {
      key: "MID",
      title: "Mid-Test",
    },
    {
      key: "POST",
      title: "Post-Test",
    },
  ];

  return (
    <div className="w-full max-w-7xl mx-auto space-y-2.5 sm:space-y-4 px-3 py-2.5 sm:px-6 sm:py-6 pb-20 md:pb-6">
      <div className="min-w-0">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-slate-900">
            ECCD Assessment
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1 sm:line-clamp-none">
            View official DepEd assessment summaries and saved checklist
            results.
          </p>
        </div>
        <div className="mt-1.5 flex min-w-0">
          {childrenList.length > 1 ? (
            <div className="inline-flex max-w-full min-w-0 items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">
              <ChildCareIcon sx={{ fontSize: 16, flexShrink: 0 }} />
              <select
                aria-label="Select child"
                value={selectedChildIndex}
                onChange={handleChildSwitch}
                className="min-w-0 max-w-full text-xs font-medium text-slate-700 bg-transparent outline-none cursor-pointer"
              >
                {childrenList.map((c, idx) => (
                  <option key={c.student_id} value={idx}>
                    {c.first_name} {c.last_name} ({c.masked_lrn})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="inline-flex max-w-full items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">
              <ChildCareIcon sx={{ fontSize: 16, flexShrink: 0 }} />
              <span className="min-w-0 break-words">
                {currentChild?.first_name} {currentChild?.last_name} (
                {currentChild?.masked_lrn})
              </span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          {error}
        </Alert>
      )}
      <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-lg gap-1 max-w-md w-full">
        <button
          type="button"
          onClick={() => setActiveTab("official")}
          aria-pressed={activeTab === "official"}
          className={`min-w-0 h-8 sm:h-9 px-1 text-xs sm:text-sm font-medium rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === "official"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <BarChartIcon
            sx={{
              fontSize: 18,
              display: { xs: "none", sm: "block" },
              flexShrink: 0,
            }}
          />
          <span className="min-w-0 leading-tight">
            Official Evaluation Summary
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("checklist")}
          aria-pressed={activeTab === "checklist"}
          className={`min-w-0 h-8 sm:h-9 px-1 text-xs sm:text-sm font-medium rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === "checklist"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <AssignmentIcon
            sx={{
              fontSize: 18,
              display: { xs: "none", sm: "block" },
              flexShrink: 0,
            }}
          />
          <span className="min-w-0 leading-tight">ECCD Checklists</span>
        </button>
      </div>
      {activeTab === "official" && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 sm:gap-5 mb-4 sm:mb-8">
            {periodsConfig.map(({ key, title }) => {
              const periodData = summary[key] || {};
              const isReleased = assessment.isPeriodReleased(key);
              const isEvaluated = Boolean(periodData.isEvaluated);

              return (
                <div
                  key={key}
                  className="bg-white rounded-2xl border border-slate-200/90 shadow-sm flex flex-col overflow-hidden transition-shadow hover:shadow-md"
                >
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
      {activeTab === "checklist" && (
        <ReadOnlyDomainChecklist assessment={assessment} />
      )}
    </div>
  );
};

export default ParentEccdAssessment;
