import type { Period } from "../../types";
import {
  ASSESSMENT_PERIOD_LABELS,
  SUMMARY_INTERPRETATION_LABELS,
  SUMMARY_INTERPRETATIONS,
  type DevelopmentalInterpretation,
} from "./dashboardFilters";
import { Select } from "./ui";

interface SectionGenderCounts {
  male: number;
  female: number;
}

export interface DelaySummaryData {
  male: number;
  female: number;
  totalMatched: number;
  assessedStudents: number;
  bySection: Record<string, SectionGenderCounts>;
}

interface DelaySummaryProps {
  interpretation: DevelopmentalInterpretation;
  onInterpretationChange: (interpretation: DevelopmentalInterpretation) => void;
  period: Period;
  summary: DelaySummaryData | undefined;
  loading: boolean;
  failed: boolean;
}

export default function DelaySummary({
  interpretation,
  onInterpretationChange,
  period,
  summary,
  loading,
  failed,
}: DelaySummaryProps) {
  const interpretationLabel = SUMMARY_INTERPRETATION_LABELS[interpretation];
  const sections = summary ? Object.entries(summary.bySection) : [];
  const sectionCount = sections.length;
  return (
    <section
      aria-labelledby="chairman-delay-title"
      aria-busy={loading}
      className="flex h-full min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm"
    >
      <div>
        <h2
          id="chairman-delay-title"
          className="mb-4 text-xl font-bold leading-[1.6] text-[#1f2937]"
        >
          Developmental Summary
        </h2>
        <div className="w-full min-w-0 py-1">
          <Select
            brand
            constrainMenu
            className="rounded-xl!"
            label="Interpretation"
            value={interpretation}
            onChange={(event) =>
              onInterpretationChange(
                event.target.value as DevelopmentalInterpretation,
              )
            }
          >
            {SUMMARY_INTERPRETATIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <p className="mt-2 text-sm text-[#6b7280]">
        Students evaluated with {interpretationLabel} in{" "}
        {ASSESSMENT_PERIOD_LABELS[period]}.
      </p>
      {loading ? (
        <p role="status" className="mt-6 text-sm text-[#6b7280]">
          Loading developmental summary...
        </p>
      ) : failed || !summary ? (
        <p role="status" className="mt-6 text-sm text-[#6b7280]">
          Developmental summary is unavailable.
        </p>
      ) : (
        <div className="mt-6 flex-1">
          <h3
            id="chairman-delay-breakdown"
            className="font-bold text-[#1f2937]"
          >
            Section Totals
          </h3>
          <p className="mt-1 text-sm text-[#6b7280]">
            {summary.totalMatched} students with {interpretationLabel} across{" "}
            {sectionCount} {sectionCount === 1 ? "section" : "sections"}.
          </p>
          {summary.assessedStudents === 0 && (
            <p className="mt-2 text-sm text-[#6b7280]">
              No recorded assessments with an official assessment date and age
              available for scoring.
            </p>
          )}
          {sectionCount ? (
            <div
              role="region"
              aria-labelledby="chairman-delay-breakdown"
              tabIndex={0}
              className="mt-4 max-h-72 overflow-y-auto scroll-smooth rounded-xl bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand"
            >
              <table className="w-full table-fixed text-left text-sm">
                <caption className="sr-only">
                  Matching students by section for the selected filters
                </caption>
                <thead className="sticky top-0 bg-white [&_th]:border-brand/15 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-slate-700">
                  <tr className="border-b border-brand/15 bg-brand/5">
                    <th scope="col" className="whitespace-normal px-3 py-3">
                      Section Name
                    </th>
                    <th scope="col" className="w-16 px-2 py-3 text-right">
                      Male
                    </th>
                    <th scope="col" className="w-20 px-2 py-3 text-right">
                      Female
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map(([name, counts]) => (
                    <tr key={name}>
                      <th
                        scope="row"
                        className="whitespace-normal break-words px-3 py-3 font-medium text-[#6b7280] [overflow-wrap:anywhere]"
                      >
                        {name}
                      </th>
                      <td className="px-2 py-3 text-right font-bold tabular-nums text-[#1f2937]">
                        {counts.male}
                      </td>
                      <td className="px-2 py-3 text-right font-bold tabular-nums text-[#1f2937]">
                        {counts.female}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[#6b7280]">
              No sections available.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
