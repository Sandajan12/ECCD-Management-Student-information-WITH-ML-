import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import API, { errorMessage } from "../../services/api";
import { PERIOD_LABELS, PERIODS } from "../../types";
import StatCard from "../../components/StatCard";
import {
  Empty,
  Notice,
  PageHeader,
  Progress,
  Select,
} from "../../components/ui";

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
  messages?: {
    id: number;
    name: string;
    preview: string;
    time: string;
    read: boolean;
  }[];
}
export default function Dashboard() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const chairman = user?.role === "super-admin";
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
                name: domain,
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
  }, [selection, filters.domains]);
  const s = stats?.stats || {};
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${chairman ? "School-wide" : "Your class"} learning overview • ${settings.current_school_year}`}
      />
      <Notice tone="error">{error}</Notice>
      <div className="card my-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(["section", "domain", "period", "schoolYear"] as const).map((key) => (
          <Select
            key={key}
            label={
              {
                section: "Section",
                domain: "Domain",
                period: "Testing period",
                schoolYear: "School year",
              }[key]
            }
            value={selection[key]}
            onChange={(e) =>
              setSelection({ ...selection, [key]: e.target.value })
            }
          >
            <option>All</option>
            {(key === "section"
              ? filters.sections
              : key === "domain"
                ? filters.domains
                : key === "period"
                  ? PERIODS
                  : filters.schoolYears
            ).map((item) => (
              <option key={item} value={item}>
                {key === "period"
                  ? PERIOD_LABELS[item as keyof typeof PERIOD_LABELS]
                  : item}
              </option>
            ))}
          </Select>
        ))}
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total students" value={s.totalStudents || "0"} />
        <StatCard
          title={chairman ? "Active teachers" : "Unread messages"}
          value={chairman ? s.totalTeachers || "0" : s.unreadMessages || "0"}
          tone="purple"
        />
        <StatCard
          title={chairman ? "Priority intervention" : "Priority domain"}
          value={s.priorityIntervention || s.priorityDomain || "None"}
          subtitle={s.priorityInterventionSubtitle || "Requires support"}
          tone="orange"
        />
        <StatCard
          title="ECCD progress"
          value={s.eccdProgress || "0%"}
          subtitle={s.criticalDomain || "Assessment completion"}
          tone="green"
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card">
          <h2 className="text-lg font-semibold">
            ECCD assessment distribution
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            KAYA and DI-KAYA for the selected filters
          </p>
          {pie.some((row) => row.value > 0) ? (
            <div className="mt-4 aspect-square max-h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="80%"
                    paddingAngle={3}
                  >
                    {pie.map((row) => (
                      <Cell key={row.name} fill={row.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mt-6">
              <Empty>
                Assessment data will appear after students are evaluated.
              </Empty>
            </div>
          )}
        </section>
        <section className="card">
          <h2 className="mb-5 text-lg font-semibold">Domain performance</h2>
          <div className="space-y-5">
            {performance.map((row) => (
              <div key={row.name}>
                <p className="mb-2 text-sm">{row.name}</p>
                <Progress value={row.percentage} />
              </div>
            ))}
          </div>
          {!performance.length && (
            <Empty>No development domains available.</Empty>
          )}
        </section>
      </div>
      {!chairman && (
        <section className="card mt-6">
          <div className="mb-5 flex justify-between">
            <h2 className="font-semibold">Recent parent messages</h2>
            <Link className="text-sm text-blue-600" to="/teacher/messages">
              View messages →
            </Link>
          </div>
          {stats?.messages?.length ? (
            stats.messages.map((m) => (
              <div
                key={m.id}
                className="border-b border-slate-100 py-3 last:border-0"
              >
                <p className="text-sm font-semibold">{m.name || "Parent"}</p>
                <p className="mt-1 truncate text-sm text-slate-500">
                  {m.preview}
                </p>
                <p className="mt-1 text-xs text-slate-400">{m.time}</p>
              </div>
            ))
          ) : (
            <Empty>No recent messages.</Empty>
          )}
        </section>
      )}
    </>
  );
}
