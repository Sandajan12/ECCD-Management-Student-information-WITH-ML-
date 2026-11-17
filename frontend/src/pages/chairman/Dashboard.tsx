import { useEffect, useState } from "react";
import EmojiEventsRounded from "@mui/icons-material/EmojiEventsRounded";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useSettings } from "../../context/SettingsContext";
import { chairmanDisplayName } from "../../utils/displayName";
import { errorMessage } from "../../services/api";
import { sharedGet } from "../../services/sharedGet";
import { Notice, Select } from "../../components/chairman/ui";
import Icon from "../../components/chairman/Icon";
import LegacyIcon from "../../components/LegacyIcon";
import DelaySummary from "../../components/chairman/DelaySummary";
import type { DelaySummaryData } from "../../components/chairman/DelaySummary";
import type { Period } from "../../types";
import { PERIODS } from "../../types";
import {
  ASSESSMENT_PERIOD_LABELS,
  type DevelopmentalInterpretation,
} from "../../components/chairman/dashboardFilters";
interface Filters {
  sectionOptions: { section_id: number; section_name: string }[];
  domains: string[];
  schoolYears: string[];
  currentSchoolYear: string | null;
}
interface Slice {
  name: string;
  value: number;
  color: string;
}
interface Stats {
  stats: Record<string, string>;
  functionalMastery?: { kaya: number; dikaya: number };
  criticalDomainDiKayaRate?: number | null;
  delaySummary?: DelaySummaryData;
  excellingDomain?: {
    domainName: string | null;
    masteryRate: number | null;
    totalKaya: number;
    totalItems: number;
    completedStudents: number;
  };
}
interface RequestState {
  loading: boolean;
  error: string;
}
function formatDomainRate(
  rate: number | null | undefined,
  label: "Kaya" | "Di-Kaya",
): string | null {
  return rate != null && Number.isFinite(rate)
    ? `${rate.toLocaleString(undefined, { maximumFractionDigits: 2 })}% ${label}`
    : null;
}
export default function Dashboard() {
  const { settings, isLoaded: settingsLoaded, settingsError } = useSettings();
  const displayName = chairmanDisplayName(settings);
  const [selectedSchoolYear, setSelectedSchoolYear] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("PRE");
  const [interpretation, setInterpretation] =
    useState<DevelopmentalInterpretation>("Average");
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(
    null,
  );
  const [filters, setFilters] = useState<Filters>({
    sectionOptions: [],
    domains: [],
    schoolYears: [],
    currentSchoolYear: null,
  });
  const [domain, setDomain] = useState<string>("All");
  const [stats, setStats] = useState<Stats | null>(null);
  const [pie, setPie] = useState<Slice[]>([]);
  const [filterRequest, setFilterRequest] = useState<RequestState>({
    loading: true,
    error: "",
  });
  const [statsRequest, setStatsRequest] = useState<RequestState>({
    loading: true,
    error: "",
  });
  const [pieRequest, setPieRequest] = useState<RequestState>({
    loading: true,
    error: "",
  });
  const schoolYear =
    selectedSchoolYear ||
    filters.currentSchoolYear ||
    (!filterRequest.loading ? settings.current_school_year || "All" : "");
  const filtersReady =
    !filterRequest.loading &&
    !filterRequest.error &&
    (Boolean(filters.currentSchoolYear) ||
      settingsLoaded ||
      Boolean(settingsError));
  const schoolYears = [
    ...new Set([
      ...(schoolYear && schoolYear !== "All" ? [schoolYear] : []),
      ...filters.schoolYears,
    ]),
  ]
    .sort()
    .reverse();
  useEffect(() => {
    let current = true;
    void sharedGet<Filters>("/api/analytics/filters")
      .then((data) => {
        if (current) {
          setFilters(data);
          setFilterRequest({ loading: false, error: "" });
        }
      })
      .catch((err: unknown) => {
        if (current)
          setFilterRequest({ loading: false, error: errorMessage(err) });
      });
    return () => {
      current = false;
    };
  }, []);
  useEffect(() => {
    if (!filtersReady || !schoolYear) return;
    let current = true;
    setStatsRequest({ loading: true, error: "" });
    setStats(null);
    void sharedGet<Stats>("/api/analytics/stats", {
      section_id: selectedSectionId ?? undefined,
      schoolYear,
      period: selectedPeriod,
      interpretation,
    })
      .then((data) => {
        if (current) {
          setStats(data);
          setStatsRequest({ loading: false, error: "" });
        }
      })
      .catch((err: unknown) => {
        if (current)
          setStatsRequest({ loading: false, error: errorMessage(err) });
      });
    return () => {
      current = false;
    };
  }, [
    filtersReady,
    selectedSectionId,
    schoolYear,
    selectedPeriod,
    interpretation,
  ]);
  useEffect(() => {
    if (!filtersReady || !schoolYear) return;
    let current = true;
    setPieRequest({ loading: true, error: "" });
    setPie([]);
    void sharedGet<Slice[]>("/api/analytics/pie-data", {
      section_id: selectedSectionId ?? undefined,
      domain,
      period: selectedPeriod,
      schoolYear,
    })
      .then((data) => {
        if (current) {
          setPie(data);
          setPieRequest({ loading: false, error: "" });
        }
      })
      .catch((err: unknown) => {
        if (current)
          setPieRequest({ loading: false, error: errorMessage(err) });
      });
    return () => {
      current = false;
    };
  }, [filtersReady, selectedSectionId, domain, selectedPeriod, schoolYear]);
  const s = stats?.stats || {};
  const hasData =
    Number(s.totalStudents) > 0 &&
    (stats?.functionalMastery?.kaya || 0) +
      (stats?.functionalMastery?.dikaya || 0) >
      0;
  const excellenceRate = formatDomainRate(
    stats?.excellingDomain?.masteryRate,
    "Kaya",
  );
  const criticalRate = formatDomainRate(
    stats?.criticalDomainDiKayaRate,
    "Di-Kaya",
  );
  const cards = [
    {
      title: "Total Students",
      value: s.totalStudents || "0",
      subtitle: "Active Enrollees",
      centered: true,
      tone: "text-slate-500",
      icon: <LegacyIcon name="People" className="size-8 text-brand" />,
      bg: "bg-brand/10",
    },
    {
      title: "Total Teachers",
      value: s.totalTeachers || "0",
      subtitle: "Assigned Advisers",
      centered: true,
      tone: "text-slate-500",
      icon: <Icon name="School" className="size-8 text-brand" />,
      bg: "bg-brand/10",
    },
    {
      title: "Domain of Excellence",
      value: stats?.excellingDomain?.domainName || "N/A",
      subtitle: excellenceRate ?? "No completed assessments yet",
      icon: <EmojiEventsRounded className="size-8! text-emerald-600" />,
      bg: "bg-emerald-50",
      tone: "text-emerald-700",
      badgeClassName: excellenceRate
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : undefined,
    },
    {
      title: "Critical Domain Focus",
      value: hasData ? s.criticalDomain : "N/A",
      subtitle: hasData
        ? (criticalRate ?? s.criticalDomainSubtitle)
        : "No assessments yet",
      icon: hasData ? (
        <Icon name="GpsFixed" className="size-8 text-rose-600" />
      ) : (
        <LegacyIcon name="InfoOutlined" className="size-8 text-[#9ca3af]" />
      ),
      bg: hasData ? "bg-rose-50" : "bg-slate-100",
      tone: hasData ? "text-rose-700" : "text-slate-400",
      badgeClassName:
        hasData && criticalRate
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : undefined,
    },
    {
      title: "Priority Intervention",
      value: hasData ? s.priorityIntervention : "N/A",
      subtitle: hasData ? s.priorityInterventionSubtitle : "No assessments yet",
      icon: hasData ? (
        <LegacyIcon name="WarningAmber" className="size-8 text-amber-600" />
      ) : (
        <LegacyIcon name="InfoOutlined" className="size-8 text-[#9ca3af]" />
      ),
      bg: hasData ? "bg-amber-50" : "bg-slate-100",
      tone: hasData ? "text-amber-600" : "text-slate-400",
    },
  ];
  return (
    <div className="chairman-page bg-slate-50">
      <header className="mb-4 flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h1 className="chairman-page-title">Educational Overview</h1>
          <p className="mt-1 break-words text-sm text-[#6b7280] [overflow-wrap:anywhere]">
            Welcome, {displayName}
          </p>
        </div>
        <section
          aria-label="Dashboard filters"
          aria-busy={filterRequest.loading}
          className="grid w-full min-w-0 grid-cols-1 items-center gap-3 sm:grid-cols-3 xl:max-w-2xl xl:flex-1 [&_label]:whitespace-nowrap"
        >
          <Select
            brand
            label="School Year"
            constrainMenu
            containerClassName="min-w-0 flex-1"
            className="rounded-xl!"
            value={schoolYear}
            disabled={!schoolYear}
            onChange={(event) => setSelectedSchoolYear(event.target.value)}
          >
            {!schoolYear && <option value="">Loading school years...</option>}
            <option value="All">All Years</option>
            {schoolYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </Select>
          <Select
            brand
            label="Section"
            constrainMenu
            containerClassName="min-w-0 flex-1"
            className="rounded-xl!"
            value={selectedSectionId ?? "All"}
            disabled={filterRequest.loading}
            onChange={(event) =>
              setSelectedSectionId(
                event.target.value === "All"
                  ? null
                  : Number(event.target.value),
              )
            }
          >
            <option value="All">All Sections</option>
            {filters.sectionOptions.map((option) => (
              <option key={option.section_id} value={option.section_id}>
                {option.section_name}
              </option>
            ))}
          </Select>
          <Select
            brand
            label="Assessment Period"
            constrainMenu
            containerClassName="min-w-0"
            className="rounded-xl!"
            value={selectedPeriod}
            onChange={(event) =>
              setSelectedPeriod(event.target.value as Period)
            }
          >
            {PERIODS.map((value) => (
              <option key={value} value={value}>
                {ASSESSMENT_PERIOD_LABELS[value]}
              </option>
            ))}
          </Select>
        </section>
      </header>
      <Notice tone="error">
        {filterRequest.error && `Filters: ${filterRequest.error}`}
      </Notice>
      <Notice tone="error">
        {statsRequest.error && `Statistics: ${statsRequest.error}`}
      </Notice>
      <section
        className="mt-4 mb-6 grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5"
        aria-label="Summary statistics"
        aria-busy={statsRequest.loading}
      >
        {cards.map((card) => (
          <section
            key={card.title}
            className={`flex h-full w-full min-w-0 flex-col justify-between gap-1 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm [overflow-wrap:anywhere] sm:p-5 ${card.centered ? "border-t-2 border-t-brand" : ""}`}
          >
            <div
              className={`flex items-center gap-2 ${card.centered ? "justify-center" : ""}`}
            >
              <div
                aria-hidden="true"
                className={`flex shrink-0 rounded-lg p-1 [&>svg]:size-4! ${card.bg}`}
              >
                {card.icon}
              </div>
              <h2 className="text-xs font-bold leading-tight text-slate-500">
                {card.title}
              </h2>
            </div>
            <div>
              <p
                className={`text-xl font-bold leading-6 text-slate-900 ${card.centered ? "text-center" : ""}`}
              >
                {statsRequest.loading
                  ? "..."
                  : statsRequest.error
                    ? "Unavailable"
                    : card.value}
              </p>
            </div>
            <div
              className={`mt-auto flex min-h-6 items-center text-xs leading-tight ${card.centered ? "justify-center" : ""}`}
            >
              {card.subtitle && !statsRequest.loading && !statsRequest.error ? (
                <p
                  className={`${card.centered || card.title === "Priority Intervention" ? "font-medium" : "font-bold"} ${card.tone}`}
                >
                  <span
                    className={
                      card.badgeClassName
                        ? `inline-block rounded-full border px-2 py-0.5 ${card.badgeClassName}`
                        : ""
                    }
                  >
                    {card.subtitle}
                  </span>
                </p>
              ) : (
                <p aria-hidden="true" className="invisible">
                  Assessment status
                </p>
              )}
            </div>
          </section>
        ))}
      </section>
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
        <DelaySummary
          interpretation={interpretation}
          onInterpretationChange={setInterpretation}
          period={selectedPeriod}
          summary={stats?.delaySummary}
          loading={statsRequest.loading}
          failed={Boolean(statsRequest.error)}
        />
        <section
          aria-labelledby="chairman-progress-title"
          aria-busy={pieRequest.loading}
          className="flex h-full min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm"
        >
          <div className="mb-6">
            <h2
              id="chairman-progress-title"
              className="mb-4 text-xl font-bold leading-[1.6] text-[#1f2937]"
            >
              ECCD Progress Overview
            </h2>
            <div className="py-1">
              <Select
                brand
                constrainMenu
                className="rounded-xl!"
                label="Domain"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
              >
                <option value="All">All Domains</option>
                {filters.domains.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </Select>
            </div>
          </div>
          <Notice tone="error">
            {pieRequest.error && `ECCD progress: ${pieRequest.error}`}
          </Notice>
          <div className="flex flex-1 flex-col gap-4">
            <div className="flex flex-1 items-center justify-center">
              {pie.reduce((sum, item) => sum + item.value, 0) > 0 ? (
                <div className="aspect-square w-full min-w-0 max-w-sm">
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                    initialDimension={{ width: 300, height: 300 }}
                  >
                    <PieChart>
                      <Pie
                        data={pie}
                        cx="50%"
                        cy="50%"
                        innerRadius="45%"
                        outerRadius="68%"
                        paddingAngle={5}
                        dataKey="value"
                        fontSize={11}
                        label={({ percent }) =>
                          `${((percent || 0) * 100).toFixed(0)}%`
                        }
                      >
                        {pie.map((slice, i) => (
                          <Cell key={i} fill={slice.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : pieRequest.loading ? (
                <p role="status" className="text-sm text-[#777]">
                  Loading ECCD progress...
                </p>
              ) : (
                <div className="flex h-full flex-col items-center justify-center opacity-60">
                  <Icon
                    name="ShowChart"
                    className="mb-4 size-12 text-[#9ca3af]"
                  />
                  <p className="text-base font-medium leading-[1.5] text-[#6b7280]">
                    No ECCD assessment data available yet.
                  </p>
                  <p className="text-xs leading-[1.66] text-[#9ca3af]">
                    Try selecting a different section.
                  </p>
                </div>
              )}
            </div>
            {!pieRequest.loading && !pieRequest.error && (
              <div>
                <dl
                  aria-label="Assessment item totals"
                  className="grid grid-cols-2 gap-3 text-center text-sm"
                >
                  {pie.map((slice) => (
                    <div
                      key={slice.name}
                      className={`rounded-xl px-3 py-2 ${slice.name === "KAYA" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
                    >
                      <dt className="text-xs font-medium">
                        {slice.name === "KAYA" ? "Total Kaya" : "Total Di-Kaya"}
                      </dt>
                      <dd className="font-bold tabular-nums">
                        {slice.value.toLocaleString()}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-center text-xs text-slate-500">
                  Recorded checklist items for the selected filters.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
