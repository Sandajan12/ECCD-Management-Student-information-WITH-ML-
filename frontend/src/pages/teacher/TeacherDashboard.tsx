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
import { useSettings } from "../../context/SettingsContext";
import { useTeacher } from "../../context/TeacherContext";
import API, { errorMessage } from "../../services/api";
import type { DomainProgress, Student } from "../../types";
import LegacyIcon from "../../components/LegacyIcon";
import type { LegacyIconName } from "../../components/LegacyIcon";
import { Empty, Notice, Select } from "../../components/ui";
import TeacherSkeleton from "../../components/teacher/TeacherSkeleton";

interface DashboardResponse {
  stats: {
    totalStudents: string;
    unreadMessages: string;
    eccdProgress: string;
    priorityDomain: string;
  };
  messages: {
    id: number;
    name: string | null;
    preview: string;
    time: string;
    read: boolean;
  }[];
}
interface PieSlice {
  name: string;
  value: number;
  color: string;
}
interface Metric {
  title: string;
  value: string;
  icon: LegacyIconName;
  color: string;
  background: string;
}

export default function TeacherDashboard() {
  const { settings } = useSettings();
  const { section } = useTeacher();
  const [domain, setDomain] = useState<string>("All");
  const [period, setPeriod] = useState<string>("PRE");
  const [domains, setDomains] = useState<string[]>([]);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [progress, setProgress] = useState<DomainProgress[]>([]);
  const [pie, setPie] = useState<PieSlice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [chartLoading, setChartLoading] = useState<boolean>(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    let current = true;
    const load = async <T,>(
      key: string,
      path: string,
      apply: (data: T) => void,
    ) => {
      try {
        const res = await API.get<T>(path);
        if (current) {
          apply(res.data);
          setErrors((prev) => ({ ...prev, [key]: "" }));
        }
      } catch (err) {
        if (current)
          setErrors((prev) => ({ ...prev, [key]: errorMessage(err) }));
      }
    };
    const refresh = async () => {
      await Promise.all([
        load<DashboardResponse>(
          "stats",
          "/api/teachers/dashboard-stats",
          setDashboard,
        ),
        load<{ domains: string[] }>(
          "filters",
          "/api/teachers/dashboard-filters",
          (data) => setDomains(data.domains),
        ),
        load<Student[]>("roster", "/api/students/", setStudents),
        load<DomainProgress[]>(
          "progress",
          "/api/eccd/domains-progress",
          setProgress,
        ),
      ]);
      if (current) setLoading(false);
    };
    void refresh();
    const updated = () => void refresh();
    window.addEventListener("ames-record-synced", updated);
    window.addEventListener("ames-messages-read", updated);
    window.addEventListener("online", updated);
    return () => {
      current = false;
      window.removeEventListener("ames-record-synced", updated);
      window.removeEventListener("ames-messages-read", updated);
      window.removeEventListener("online", updated);
    };
  }, []);
  useEffect(() => {
    let current = true;
    setChartLoading(true);
    setPie([]);
    void API.get<PieSlice[]>("/api/teachers/dashboard-pie", {
      params: { section: section?.section_name || "All", domain, period },
    })
      .then((res) => {
        if (current) {
          setPie(res.data);
          setErrors((prev) => ({ ...prev, chart: "" }));
        }
      })
      .catch((err) => {
        if (current)
          setErrors((prev) => ({ ...prev, chart: errorMessage(err) }));
      })
      .finally(() => {
        if (current) setChartLoading(false);
      });
    return () => {
      current = false;
    };
  }, [section?.section_name, domain, period]);
  const stats = dashboard?.stats;
  const metrics: Metric[] = [
    {
      title: "Total Student",
      value: stats?.totalStudents || "0",
      icon: "People",
      color: "#3b82f6",
      background: "#eff6ff",
    },
    {
      title: "Unread Messages",
      value: stats?.unreadMessages || "0",
      icon: "Message",
      color: "#ef4444",
      background: "#fef2f2",
    },
    {
      title: "Overall ECCD Progress",
      value: stats?.eccdProgress || "0%",
      icon: "BarChart",
      color: "#10b981",
      background: "#ecfdf5",
    },
    {
      title: "Priority Domain",
      value: stats?.priorityDomain || "None",
      icon: "Assignment",
      color: "#f59e0b",
      background: "#fffbeb",
    },
  ];
  const roster = students.filter(
    (s) => s.is_active && (!section || s.section_id === section.section_id),
  );
  const unread = dashboard?.messages?.filter((message) => !message.read) || [];
  return (
    <div className="mx-auto w-full max-w-[90rem] space-y-6 py-2 legacy-sm:py-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-800 legacy-sm:text-2xl">
          Educational Overview
        </h1>
        <div className="flex flex-wrap gap-3 text-sm font-bold">
          <span className="rounded-lg bg-emerald-50 px-4 py-2 text-emerald-600">
            SY {settings.current_school_year || "Loading…"}
          </span>
          <span className="rounded-lg bg-blue-50 px-4 py-2 text-blue-500">
            Section: {section?.section_name || "No assigned section"}
          </span>
        </div>
      </header>
      <Notice tone="error">{errors.stats || errors.filters}</Notice>
      {loading && !dashboard ? (
        <TeacherSkeleton cards={4} />
      ) : (
        <div className="grid gap-5 legacy-sm:grid-cols-2 legacy-md:grid-cols-4">
          {metrics.map((metric) => (
            <section
              key={metric.title}
              className="card flex items-center gap-4 legacy-md:flex-col legacy-lg:flex-row"
            >
              <span
                className="rounded-xl p-3"
                style={{ color: metric.color, background: metric.background }}
              >
                <LegacyIcon name={metric.icon} className="size-8" />
              </span>
              <div className="min-w-0">
                <h2 className="text-xs leading-tight font-bold text-gray-500">
                  {metric.title}
                </h2>
                <p className="mt-1 text-xl font-extrabold break-words text-gray-900">
                  {metric.value}
                </p>
              </div>
            </section>
          ))}
        </div>
      )}
      <div className="grid items-stretch gap-6 legacy-md:grid-cols-3">
        <section className="card legacy-md:col-span-2">
          <h2 className="mb-4 text-lg font-bold text-gray-800">
            ECCD Development
          </h2>
          <div className="mb-6 grid gap-4 legacy-sm:grid-cols-3">
            <Select
              label="Section"
              value={section?.section_name || ""}
              disabled
            >
              <option value={section?.section_name || ""}>
                {section?.section_name || "No assigned section"}
              </option>
            </Select>
            <Select
              label="Domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            >
              <option>All</option>
              {domains.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </Select>
            <Select
              label="Testing Period"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option>All</option>
              <option value="PRE">Pre-Test (BoY)</option>
              <option value="MID">Mid-Test</option>
              <option value="POST">Post-Test (EoY)</option>
            </Select>
          </div>
          <hr className="border-slate-100" />
          <div className="mt-6 aspect-square max-h-[24rem] w-full">
            {chartLoading ? (
              <TeacherSkeleton />
            ) : errors.chart ? (
              <Notice tone="error">{errors.chart}</Notice>
            ) : pie.some((slice) => slice.value > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="50%"
                    outerRadius="75%"
                    paddingAngle={5}
                    label={({ name, percent }) =>
                      `${name} ${((percent || 0) * 100).toFixed(0)}%`
                    }
                  >
                    {pie.map((slice) => (
                      <Cell key={slice.name} fill={slice.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-gray-400">
                <LegacyIcon name="BarChart" className="size-12" />
                <p className="text-sm font-medium text-gray-500">
                  No ECCD assessment data available yet.
                </p>
                <p className="text-xs">
                  Try selecting a different domain or testing period.
                </p>
              </div>
            )}
          </div>
        </section>
        <section className="card flex flex-col">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-gray-800">Unread Messages</h2>
            {unread.length > 0 && (
              <span className="rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white">
                {unread.length} New
              </span>
            )}
          </div>
          {loading ? (
            <TeacherSkeleton />
          ) : unread.length ? (
            <ul className="divide-y divide-slate-100">
              {unread.map((message) => (
                <li key={message.id}>
                  <Link
                    to="/teacher/messages"
                    className="flex gap-3 rounded-xl py-4 hover:bg-slate-50"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand font-bold text-white">
                      {(message.name || "Parent").charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap justify-between gap-2 text-xs">
                        <strong>{message.name || "Parent"}</strong>
                        <span className="text-gray-500">{message.time}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                        {message.preview}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-gray-400">
              <LegacyIcon name="Message" className="size-12" />
              <p className="text-sm font-medium text-gray-500">
                No unread messages
              </p>
            </div>
          )}
          <Link
            to="/teacher/messages"
            className="mt-auto pt-4 text-center text-sm font-bold text-brand hover:underline"
          >
            View All Messages
          </Link>
        </section>
      </div>
      <section className="card">
        <h2 className="mb-1 font-bold">Class Enrollment</h2>
        <p className="mb-4 text-xs text-slate-500">
          {section?.section_name || "All assigned sections"} · {roster.length}{" "}
          total students
        </p>
        <Notice tone="error">{errors.roster}</Notice>
        {loading ? (
          <TeacherSkeleton cards={2} />
        ) : !roster.length ? (
          <Empty>
            No students assigned yet. Add students from My Students to begin.
          </Empty>
        ) : (
          <div className="grid gap-4 legacy-sm:grid-cols-2">
            <div className="rounded-xl bg-blue-50 p-4 text-blue-700">
              <p className="text-sm">Enrolled Boys</p>
              <strong className="text-2xl">
                {roster.filter((s) => s.gender === "Male").length}
              </strong>
            </div>
            <div className="rounded-xl bg-pink-50 p-4 text-pink-700">
              <p className="text-sm">Enrolled Girls</p>
              <strong className="text-2xl">
                {roster.filter((s) => s.gender === "Female").length}
              </strong>
            </div>
          </div>
        )}
      </section>
      <section className="card">
        <h2 className="font-bold">Checklist Completion</h2>
        <p className="mt-1 mb-4 text-xs text-slate-500">
          All assigned sections · Percentage of students with a completed domain
          checklist. Summary cards above also cover all assigned sections.
        </p>
        <Notice tone="error">{errors.progress}</Notice>
        {loading ? (
          <TeacherSkeleton cards={2} />
        ) : !progress.length ? (
          <Empty>No assessment progress available.</Empty>
        ) : (
          <div className="space-y-4">
            {progress.map((item) => (
              <div
                key={item.domain_id}
                className="grid items-center gap-3 legacy-sm:grid-cols-3"
              >
                <h3 className="text-sm font-semibold">{item.domain_name}</h3>
                {(["pre_progress", "post_progress"] as const).map((key) => (
                  <div key={key}>
                    <p className="mb-1 text-xs text-slate-500">
                      {key === "pre_progress"
                        ? "Checklist 1 · Pre-Test"
                        : "Checklist 2 · Post-Test"}
                      : {item[key] ?? 0}%
                    </p>
                    <progress
                      aria-label={`${item.domain_name} ${key === "pre_progress" ? "Pre-Test" : "Post-Test"} completion`}
                      className="teacher-progress h-2 w-full"
                      max={100}
                      value={item[key] ?? 0}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
