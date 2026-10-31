export interface DelaySummaryData {
  male: number;
  female: number;
  totalDelayed: number;
  assessedStudents: number;
  bySection: Record<string, number>;
}

interface DelaySummaryProps {
  summary: DelaySummaryData | undefined;
  loading: boolean;
  failed: boolean;
}

export default function DelaySummary({
  summary,
  loading,
  failed,
}: DelaySummaryProps) {
  return (
    <section
      aria-labelledby="chairman-delay-title"
      aria-busy={loading}
      className="mb-8 rounded-2xl bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,.03)]"
    >
      <h2
        id="chairman-delay-title"
        className="text-xl font-bold text-[#1f2937]"
      >
        Developmental Delay Summary
      </h2>
      <p className="mt-2 text-sm text-[#6b7280]">
        Slight or Significant Delay in each active student’s latest completed,
        teacher-confirmed assessment. Uses the selected section and school year.
      </p>
      {loading ? (
        <p role="status" className="mt-6 text-sm text-[#6b7280]">
          Loading delay summary...
        </p>
      ) : failed || !summary ? (
        <p role="status" className="mt-6 text-sm text-[#6b7280]">
          Delay summary is unavailable.
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          <div className="grid gap-4 legacy-sm:grid-cols-2">
            {[
              {
                label: "Delayed Males",
                count: summary.male,
                tone: "bg-[#eff6ff] text-[#3b82f6]",
              },
              {
                label: "Delayed Females",
                count: summary.female,
                tone: "bg-[#fdf2f8] text-[#db2777]",
              },
            ].map(({ label, count, tone }) => (
              <div
                key={label}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl p-5 ${tone}`}
              >
                <h3 className="text-sm font-bold">{label}</h3>
                <span className="text-2xl font-bold">{count}</span>
              </div>
            ))}
          </div>
          <div>
            <h3 className="font-bold text-[#1f2937]">Delays per Section</h3>
            <p className="mt-1 text-sm text-[#6b7280]">
              {summary.totalDelayed} delayed students across{" "}
              {summary.assessedStudents} scored assessments.
            </p>
            {summary.assessedStudents === 0 && (
              <p className="mt-2 text-sm text-[#6b7280]">
                No completed assessments with an assessment age available for
                scoring.
              </p>
            )}
            {Object.keys(summary.bySection).length ? (
              <dl className="mt-4 grid gap-3 legacy-sm:grid-cols-2 legacy-lg:grid-cols-3">
                {Object.entries(summary.bySection).map(([name, count]) => (
                  <div
                    key={name}
                    className="flex min-w-0 items-center justify-between gap-4 rounded-xl bg-[#f9fafb] p-4"
                  >
                    <dt className="min-w-0 break-words text-sm text-[#6b7280] [overflow-wrap:anywhere]">
                      {name}
                    </dt>
                    <dd className="shrink-0 font-bold text-[#1f2937]">
                      {count}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-4 text-sm text-[#6b7280]">
                No sections available.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
