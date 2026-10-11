// Visual source: legacy pages/chairman/Dashboard.jsx (cards, filters and charts).
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
import API, { errorMessage } from "../../services/api";
import { Notice, Select } from "../../components/chairman/ui";
import Icon from "../../components/chairman/Icon";
import LegacyIcon from "../../components/LegacyIcon";
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
}
export default function Dashboard() {
  const { settings } = useSettings();
  const [filters, setFilters] = useState<Filters>({
    sections: [],
    domains: [],
    schoolYears: [],
  });
  const [selection, setSelection] = useState({
    section: "All",
    domain: "All",
    period: "All",
    schoolYear: "All",
  });
  const [stats, setStats] = useState<Stats | null>(null);
  const [pie, setPie] = useState<Slice[]>([]);
  const [performance, setPerformance] = useState<
    { name: string; percentage: number }[]
  >([]);
  const [error, setError] = useState("");
  useEffect(() => {
    void API.get<Filters>("/api/analytics/filters")
      .then((res) => setFilters(res.data))
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(() => {
    let current = true;
    const load = async () => {
      try {
        const [s, p, domains] = await Promise.all([
          API.get<Stats>("/api/analytics/stats", { params: selection }),
          API.get<Slice[]>("/api/analytics/pie-data", { params: selection }),
          Promise.all(
            filters.domains.map(async (domain) => {
              const data = (
                await API.get<Slice[]>("/api/analytics/pie-data", {
                  params: { ...selection, domain },
                })
              ).data;
              const sum = data.reduce((total, item) => total + item.value, 0);
              return {
                name: domain.replace(" Domain", ""),
                percentage: sum
                  ? Math.round(
                      ((data.find((row) => row.name === "KAYA")?.value || 0) *
                        100) /
                        sum,
                    )
                  : 0,
              };
            }),
          ),
        ]);
        if (current) {
          setStats(s.data);
          setPie(p.data);
          setPerformance(domains.sort((a, b) => b.percentage - a.percentage));
          setError("");
        }
      } catch (err) {
        if (current) setError(errorMessage(err));
      }
    };
    void load();
    return () => {
      current = false;
    };
  }, [
    selection.section,
    selection.period,
    selection.schoolYear,
    selection.domain,
    filters.domains,
  ]);
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
      <Notice tone="error">{error}</Notice>
      <div className="mt-2 mb-8 grid gap-6 legacy-sm:grid-cols-2 legacy-md:grid-cols-4">
        {cards.map((card) => (
          <section
            key={card.title}
            className="flex h-full flex-col justify-center rounded-2xl bg-white shadow-[0_4px_20px_rgba(0,0,0,.03)]"
          >
            <div className="flex items-center p-6">
              <div className={`mr-4 flex shrink-0 rounded-xl p-3 ${card.bg}`}>
                {card.icon}
              </div>
              <div>
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
      <div className="grid gap-6 legacy-md:grid-cols-3">
        <section className="flex min-w-0 flex-col rounded-2xl bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,.03)] legacy-md:col-span-2">
          <div className="mb-6">
            <h2 className="mb-4 text-xl font-bold leading-[1.6] text-[#1f2937]">
              ECCD Progress Overview
            </h2>
            <div className="flex flex-nowrap gap-4 overflow-x-auto py-2">
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
        <section className="flex min-w-0 flex-col rounded-2xl bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,.03)]">
          <div className="mb-6">
            <h2 className="text-xl font-bold leading-[1.6]">
              Domain Performance Breakdown
            </h2>
            <span className="text-xs font-bold leading-[1.66] tracking-[.5px] text-[#3b82f6] uppercase">
              {selection.section === "All" ? "Showing: All Sections" : `Showing: Section ${selection.section}`}
            </span>
          </div>
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
                    aria-valuenow={domain.percentage}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-2.5 overflow-hidden rounded-[20px] bg-[#f3f4f6]"
                  >
                    <div
                      className="h-full bg-[#3b82f6] transition-[width] duration-400"
                      style={{ width: `${domain.percentage}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="mt-8 text-center text-sm leading-[1.43] text-[#777]">
                Loading domain data...
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
