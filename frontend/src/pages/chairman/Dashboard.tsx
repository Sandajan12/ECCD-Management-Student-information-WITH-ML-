import { useEffect, useState } from "react";
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
import API, { errorMessage } from "../../services/api";
import { Notice, Select } from "../../components/chairman/ui";
import Icon from "../../components/chairman/Icon";
import LegacyIcon from "../../components/LegacyIcon";
import DelaySummary from "../../components/chairman/DelaySummary";
import type { DelaySummaryData } from "../../components/chairman/DelaySummary";
interface Filters {
  sections: string[];
  domains: string[];
  schoolYears: string[];
}
interface Slice {
  name: string;
  value: number;
  color: string;
}
interface Stats {
  stats: Record<string, string>;
  functionalMastery?: { kaya: number; dikaya: number };
  delaySummary?: DelaySummaryData;
}
interface Selection {
  section: string;
  domain: string;
  period: string;
  schoolYear: string;
}
interface DomainPerformance {
  name: string;
  percentage: number;
}
interface RequestState {
  loading: boolean;
  error: string;
}
export default function Dashboard() {
  const { settings } = useSettings();
  const displayName = chairmanDisplayName(settings);
  const [filters, setFilters] = useState<Filters>({
    sections: [],
    domains: [],
    schoolYears: [],
  });
  const [selection, setSelection] = useState<Selection>({
    section: "All",
    domain: "All",
    period: "All",
    schoolYear: "All",
  });
  const [stats, setStats] = useState<Stats | null>(null);
  const [pie, setPie] = useState<Slice[]>([]);
  const [performance, setPerformance] = useState<DomainPerformance[]>([]);
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
  const [performanceRequest, setPerformanceRequest] = useState<RequestState>({
    loading: true,
    error: "",
  });
  const { section, domain, period, schoolYear } = selection;
  useEffect(() => {
    let current = true;
    void API.get<Filters>("/api/analytics/filters")
      .then((res) => {
        if (current) {
          setFilters(res.data);
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
    let current = true;
    setStatsRequest({ loading: true, error: "" });
    void API.get<Stats>("/api/analytics/stats", {
      params: { section, schoolYear },
    })
      .then((res) => {
        if (current) {
          setStats(res.data);
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
  }, [section, schoolYear]);
  useEffect(() => {
    let current = true;
    setPieRequest({ loading: true, error: "" });
    void API.get<Slice[]>("/api/analytics/pie-data", {
      params: { section, domain, period, schoolYear },
    })
      .then((res) => {
        if (current) {
          setPie(res.data);
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
  }, [section, domain, period, schoolYear]);
  useEffect(() => {
    let current = true;
    setPerformanceRequest({ loading: filters.domains.length > 0, error: "" });
    const load = async () => {
      try {
        const domains = await Promise.all(
          filters.domains.map(async (domain) => {
            const data = (
              await API.get<Slice[]>("/api/analytics/pie-data", {
                params: { section, period, schoolYear, domain },
              })
            ).data;
            const kaya = data.find((row) => row.name === "KAYA")?.value || 0;
            const dikaya =
              data.find((row) => row.name === "DI-KAYA")?.value || 0;
            const sum = kaya + dikaya;
            return {
              name: domain.replace(" Domain", ""),
              percentage: sum ? Math.round((kaya * 100) / sum) : 0,
            };
          }),
        );
        if (current) {
          setPerformance(domains.sort((a, b) => b.percentage - a.percentage));
          setPerformanceRequest({ loading: false, error: "" });
        }
      } catch (err) {
        if (current)
          setPerformanceRequest({ loading: false, error: errorMessage(err) });
      }
    };
    void load();
    return () => {
      current = false;
    };
  }, [section, period, schoolYear, filters.domains]);
  const s = stats?.stats || {};
  const hasData =
    Number(s.totalStudents) > 0 &&
    (stats?.functionalMastery?.kaya || 0) +
      (stats?.functionalMastery?.dikaya || 0) >
      0;
  const cards = [
    {
      title: "Total Students",
      value: s.totalStudents || "0",
      icon: <LegacyIcon name="People" className="size-8 text-[#3b82f6]" />,
      bg: "bg-[#eff6ff]",
    },
    {
      title: "Total Teachers",
      value: s.totalTeachers || "0",
      icon: <Icon name="School" className="size-8 text-[#a855f7]" />,
      bg: "bg-[#f3e8ff]",
    },
    {
      title: "Priority Intervention",
      value: hasData ? s.priorityIntervention : "N/A",
      subtitle: hasData ? s.priorityInterventionSubtitle : "No assessments yet",
      icon: hasData ? (
        <LegacyIcon name="WarningAmber" className="size-8 text-[#f59e0b]" />
      ) : (
        <LegacyIcon name="InfoOutlined" className="size-8 text-[#9ca3af]" />
      ),
      bg: hasData ? "bg-[#fffbeb]" : "bg-[#f3f4f6]",
      tone: hasData ? "text-[#f59e0b]" : "text-[#9ca3af]",
    },
    {
      title: "Critical Domain Focus",
      value: hasData ? s.criticalDomain : "N/A",
      subtitle: hasData ? s.criticalDomainSubtitle : "No assessments yet",
      icon: hasData ? (
        <Icon name="GpsFixed" className="size-8 text-[#ef4444]" />
      ) : (
        <LegacyIcon name="InfoOutlined" className="size-8 text-[#9ca3af]" />
      ),
      bg: hasData ? "bg-[#fef2f2]" : "bg-[#f3f4f6]",
      tone: hasData ? "text-[#ef4444]" : "text-[#9ca3af]",
    },
  ];
  return (
    <div className="grow">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold leading-[1.6] text-[#1f2937]">
            Educational Overview
          </h1>
          <p className="mt-1 break-words text-sm text-[#6b7280] [overflow-wrap:anywhere]">
            Welcome, {displayName}
          </p>
          <div className="mt-2 flex gap-4">
            <span className="inline-block rounded-lg bg-[#ecfdf5] px-4 py-1 text-base font-bold leading-[1.75] text-[#10b981]">
              SY {settings.current_school_year || "Loading..."}
            </span>
            <span className="inline-block rounded-lg bg-[#eff6ff] px-4 py-1 text-base font-bold leading-[1.75] text-[#3b82f6]">
              {selection.section === "All"
                ? "All Sections"
                : `Section: ${selection.section}`}
            </span>
          </div>
        </div>
      </div>
      <Notice tone="error">
        {statsRequest.error && `Statistics: ${statsRequest.error}`}
      </Notice>
      <div
        aria-label="Summary statistics"
        aria-busy={statsRequest.loading}
        className="mt-2 mb-8 grid gap-6 legacy-sm:grid-cols-2 legacy-md:grid-cols-4"
      >
        {cards.map((card) => (
          <section
            key={card.title}
            className="flex h-full flex-col justify-center overflow-hidden rounded-2xl bg-white shadow-[0_4px_20px_rgba(0,0,0,.03)]"
          >
            <div className="flex items-center p-6 legacy-md:max-legacy-lg:flex-col legacy-md:max-legacy-lg:items-start legacy-md:max-legacy-lg:gap-4">
              <div className={`mr-4 flex shrink-0 rounded-xl p-3 ${card.bg}`}>
                {card.icon}
              </div>
              <div className="min-w-0 max-w-full [overflow-wrap:anywhere]">
                <p className="text-xs font-bold leading-[1.2] text-[#6b7280]">
                  {card.title}
                </p>
                <p className="mt-1 text-xl font-black leading-[1.1] text-[#111827]">
                  {card.value}
                </p>
                {card.subtitle && (
                  <p
                    className={`mt-1 text-xs font-bold leading-[1.1] ${card.tone}`}
                  >
                    {card.subtitle}
                  </p>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>
      <DelaySummary
        summary={stats?.delaySummary}
        loading={statsRequest.loading}
        failed={Boolean(statsRequest.error)}
      />
      <div className="grid gap-6 legacy-md:grid-cols-12">
        <section
          aria-labelledby="chairman-progress-title"
          aria-busy={pieRequest.loading}
          className="flex min-w-0 flex-col overflow-hidden rounded-2xl bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,.03)] legacy-md:col-span-8"
        >
          <div className="mb-6">
            <h2
              id="chairman-progress-title"
              className="mb-4 text-xl font-bold leading-[1.6] text-[#1f2937]"
            >
              ECCD Progress Overview
            </h2>
            <Notice tone="error">
              {filterRequest.error && `Filters: ${filterRequest.error}`}
            </Notice>
            <div
              aria-busy={filterRequest.loading}
              className="flex flex-nowrap gap-4 overflow-x-auto py-2"
            >
              {(["schoolYear", "section", "domain", "period"] as const).map(
                (key) => (
                  <Select
                    key={key}
                    containerClassName="min-w-[130px] flex-1"
                    label={
                      {
                        schoolYear: "School Year",
                        section: "Section",
                        domain: "Domain",
                        period: "Period",
                      }[key]
                    }
                    value={selection[key]}
                    onChange={(e) =>
                      setSelection({ ...selection, [key]: e.target.value })
                    }
                  >
                    <option value="All">
                      {
                        {
                          schoolYear: "All Years",
                          section: "All Sections",
                          domain: "All Domains",
                          period: "All Periods",
                        }[key]
                      }
                    </option>
                    {(key === "schoolYear"
                      ? filters.schoolYears
                      : key === "section"
                        ? filters.sections
                        : key === "domain"
                          ? filters.domains
                          : ["PRE", "MID", "POST"]
                    ).map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </Select>
                ),
              )}
            </div>
          </div>
          <Notice tone="error">
            {pieRequest.error && `ECCD progress: ${pieRequest.error}`}
          </Notice>
          <div className="flex min-h-[300px] grow items-center justify-center">
            {pie.reduce((sum, item) => sum + item.value, 0) > 0 ? (
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
                    innerRadius={80}
                    outerRadius={120}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} ${((percent || 0) * 100).toFixed(0)}%`
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
        </section>
        <section
          aria-labelledby="chairman-performance-title"
          aria-busy={performanceRequest.loading}
          className="flex min-w-0 flex-col overflow-hidden rounded-2xl bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,.03)] legacy-md:col-span-4"
        >
          <div className="mb-6">
            <h2
              id="chairman-performance-title"
              className="text-xl font-bold leading-[1.6]"
            >
              Domain Performance Breakdown
            </h2>
            <span className="text-xs font-bold leading-[1.66] tracking-[.5px] text-[#3b82f6] uppercase">
              {selection.section === "All"
                ? "Showing: All Sections"
                : `Showing: Section ${selection.section}`}
            </span>
          </div>
          <Notice tone="error">
            {performanceRequest.error &&
              `Domain performance: ${performanceRequest.error}`}
          </Notice>
          <div className="flex grow flex-col gap-6 overflow-y-auto">
            {performance.length ? (
              performance.map((domain) => (
                <div key={domain.name}>
                  <div className="mb-3 flex justify-between text-sm font-bold leading-[1.43]">
                    <span className="text-[#777]">{domain.name}</span>
                    <span>{domain.percentage}% KAYA</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={domain.name}
                    aria-valuenow={domain.percentage}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="relative z-0 block h-2.5 overflow-hidden rounded-[20px] bg-[#f3f4f6]"
                  >
                    <div
                      className="absolute inset-y-0 left-0 w-full origin-left bg-[#3b82f6] transition-transform duration-400 ease-linear"
                      style={{
                        transform: `translateX(${domain.percentage - 100}%)`,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="mt-8 text-center text-sm leading-[1.43] text-[#777]">
                {performanceRequest.loading || filterRequest.loading
                  ? "Loading domain data..."
                  : performanceRequest.error || filterRequest.error
                    ? "Domain data is unavailable."
                    : "No domain data available."}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
