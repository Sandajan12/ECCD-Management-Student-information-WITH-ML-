import { Link } from "react-router-dom";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import { usePendingEvaluations } from "../../hooks/usePendingEvaluations";
import { PERIOD_LABELS } from "../../types";
import type { Period, Section } from "../../types";

interface PendingEvaluationsProps {
  section: Section | null;
  period: Period;
  ownerId: number;
}

export function PendingEvaluations({
  section,
  period,
  ownerId,
}: PendingEvaluationsProps) {
  const resource = usePendingEvaluations(section?.section_id, ownerId);
  const pending = resource.data?.periods[period] || [];
  const message = !section
    ? "No section assigned."
    : resource.status === "error"
      ? "Pending evaluations unavailable. Please try again when connected."
      : resource.status === "loading"
        ? "Loading pending evaluations..."
        : !resource.data?.totalStudents
          ? "No active students in this section."
          : !resource.data.hasQuestions
            ? "No assessment questions configured."
            : "";
  const complete =
    resource.status === "ready" &&
    Boolean(resource.data?.totalStudents && resource.data.hasQuestions) &&
    pending.length === 0;

  return (
    <section
      aria-labelledby="pending-evaluations-title"
      aria-busy={resource.status === "loading" && Boolean(section)}
      className="min-w-0 flex flex-col p-5 rounded-2xl bg-white border border-slate-100 shadow-sm"
    >
      <h2
        id="pending-evaluations-title"
        className="text-lg font-bold text-slate-800"
      >
        Pending Evaluations
      </h2>
      <p className="mt-1 mb-5 text-sm text-slate-500 break-words">
        {section
          ? `Students in ${section.section_name} awaiting ${PERIOD_LABELS[period]} assessment.`
          : "An assigned section is needed to view pending evaluations."}
      </p>
      {complete ? (
        <div
          className="flex flex-1 items-center justify-center py-6"
          aria-live="polite"
        >
          <div className="text-center">
            <CheckCircleOutlineRoundedIcon
              aria-hidden="true"
              className="w-12! h-12! text-emerald-500 mx-auto mb-2"
            />
            <h3 className="text-sm font-semibold text-slate-800">
              All Evaluations Completed
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto text-center">
              All students in this section have confirmed{" "}
              {PERIOD_LABELS[period]} records.
            </p>
          </div>
        </div>
      ) : message ? (
        <div
          className="flex flex-1 items-center justify-center py-6 text-center"
          aria-live="polite"
        >
          <p className="text-sm text-slate-500">{message}</p>
        </div>
      ) : (
        <ul
          aria-label="Students awaiting evaluation"
          className="max-h-64 overflow-y-auto divide-y divide-slate-100"
        >
          {pending.map(({ student, domainId }) => {
            const name =
              student.full_name ||
              [student.first_name, student.last_name]
                .filter(Boolean)
                .join(" ") ||
              `Student ${student.student_id}`;
            const params = new URLSearchParams({
              student_id: String(student.student_id),
              period,
            });
            if (domainId) params.set("domain_id", String(domainId));
            return (
              <li
                key={student.student_id}
                className="flex flex-wrap items-center gap-3 py-3"
              >
                <div className="min-w-0 flex-1 basis-28">
                  <p className="break-words text-sm font-semibold text-slate-800">
                    {name}
                  </p>
                  {student.masked_lrn && (
                    <p className="mt-0.5 break-words text-xs text-slate-400">
                      LRN: {student.masked_lrn}
                    </p>
                  )}
                </div>
                <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                  Pending
                </span>
                <Link
                  to={`/teacher/eccdassessment?${params}`}
                  aria-label={`Assess ${name}`}
                  className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  Assess
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
