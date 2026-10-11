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
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import API, { errorMessage } from "../services/api";
import type {
  Contact,
  DomainProgress,
  ParentStats,
  ChatMessage,
} from "../types";
import { PERIOD_LABELS, PERIODS, studentName } from "../types";
import { ChildSelector, LinkChild, useChildren } from "./ChildrenWorkspace";
import {
  Button,
  Empty,
  Loading,
  Modal,
  Notice,
  PageHeader,
  Progress,
  Select,
} from "../components/ui";
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
function StatCard({
  title,
  value,
  subtitle,
  tone = "blue",
}: {
  title: string;
  value: string;
  subtitle?: string;
  tone?: "blue" | "green" | "orange" | "purple";
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    orange: "bg-orange-50 text-orange-700",
    purple: "bg-violet-50 text-violet-700",
  };
  return (
    <section className={`rounded-2xl p-5 shadow-sm ${colors[tone]}`}>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-3 break-words text-2xl font-bold">{value}</p>
      {subtitle && <p className="mt-2 text-xs opacity-80">{subtitle}</p>}
    </section>
  );
}
export function StaffDashboard() {
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
export function ParentDashboard() {
  const {
    children,
    child,
    selected,
    select,
    refresh,
    error: childError,
    loading,
  } = useChildren();
  const [stats, setStats] = useState<ParentStats | null>(null);
  const [progress, setProgress] = useState<DomainProgress[]>([]);
  const [recent, setRecent] = useState<ChatMessage[]>([]);
  const [error, setError] = useState("");
  const [link, setLink] = useState(false);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    setStats(null);
    setProgress([]);
    const load = async () => {
      try {
        const [s, p] = await Promise.all([
          API.get<ParentStats>(`/api/eccd/parent/dashboard-stats/${selected}`),
          API.get<DomainProgress[]>(
            `/api/eccd/parent/domains-progress/${selected}`,
          ),
        ]);
        if (active) {
          setStats(s.data);
          setProgress(p.data);
          setError("");
        }
      } catch (err) {
        if (active) setError(errorMessage(err));
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [selected]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const contacts = (
          await API.get<{ myId: number; contacts: Contact[] }>(
            "/api/messages/contacts",
          )
        ).data;
        if (!contacts.contacts.length) return;
        const rows = (
          await API.get<ChatMessage[]>("/api/messages/history", {
            params: {
              teacher_id: contacts.contacts[0].id,
              parent_id: contacts.myId,
            },
          })
        ).data;
        if (active) setRecent(rows.slice(-3));
      } catch {
        /* The main dashboard remains available without chat. */
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <PageHeader
        title="Your child’s learning journey"
        subtitle="A little progress every day makes a big difference."
        actions={<Button onClick={() => setLink(true)}>Link a child</Button>}
      />
      <Notice tone="error">{error || childError}</Notice>
      <div className="card my-6">
        <ChildSelector
          children={children}
          selected={selected}
          select={select}
        />
      </div>
      {loading ? (
        <Loading />
      ) : !child ? (
        <section className="card">
          <LinkChild onLinked={() => void refresh()} />
        </section>
      ) : (
        <>
          <section className="mb-6 rounded-2xl bg-blue-50 p-6">
            <span className="badge">
              {child.section_name || "Awaiting section"} • {child.school_year}
            </span>
            <h2 className="mt-4 text-2xl font-bold">{studentName(child)}</h2>
            <p className="mt-2 text-sm text-slate-500">
              {child.masked_lrn} • Adviser:{" "}
              {[child.teacher_fname, child.teacher_lname]
                .filter(Boolean)
                .join(" ") || "Awaiting assignment"}
            </p>
          </section>
          {stats && !stats.is_published ? (
            <Notice>
              Results Pending Adviser Release. Your teacher will share the
              assessment when it is ready.
            </Notice>
          ) : (
            <div className="mb-6 grid gap-5 md:grid-cols-3">
              <StatCard
                title="Current assessment"
                value={stats?.currentPhase || "Not Started"}
                subtitle="Latest testing period"
              />
              <StatCard
                title="Excels in"
                value={stats?.excelsIn || "Awaiting evaluation"}
                tone="green"
              />
              <StatCard
                title={
                  stats?.assessmentMastered
                    ? "Assessment Complete"
                    : "Needs Support In"
                }
                value={
                  stats?.assessmentMastered
                    ? "All Skills Mastered"
                    : stats?.needsSupportIn || "Awaiting evaluation"
                }
                subtitle={
                  stats?.assessmentMastered
                    ? "Ready for Grade 1"
                    : "Practice together at home"
                }
                tone={stats?.assessmentMastered ? "green" : "orange"}
              />
            </div>
          )}
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <section className="card">
              <h2 className="mb-5 font-semibold">Home-based domain progress</h2>
              <div className="space-y-5">
                {progress.map((d) => (
                  <div key={d.domain_id}>
                    <h3 className="mb-3 text-sm font-medium">
                      {d.domain_name}
                    </h3>
                    <div className="space-y-2">
                      {PERIODS.map((p) => (
                        <div
                          key={p}
                          className="grid grid-cols-[4rem_1fr] items-center gap-3"
                        >
                          <span className="text-xs text-slate-500">{p}</span>
                          <Progress
                            value={
                              p === "PRE"
                                ? d.pre_progress
                                : p === "MID"
                                  ? d.mid_progress
                                  : d.post_progress
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {!progress.length && (
                <Empty>
                  Progress will appear after assessments are released.
                </Empty>
              )}
            </section>
            <section className="card">
              <div className="mb-5 flex flex-wrap justify-between gap-3">
                <h2 className="font-semibold">Messages from school</h2>
                <Link className="text-sm text-blue-600" to="/parent/messages">
                  Open messages →
                </Link>
              </div>
              {recent.length ? (
                recent.map((m) => (
                  <p
                    key={m.message_id}
                    className="border-b border-slate-100 py-4 text-sm leading-6"
                  >
                    {m.body}
                  </p>
                ))
              ) : (
                <Empty>Your teacher’s messages will appear here.</Empty>
              )}
              <Link
                to="/parent/eccdassessment"
                className="btn btn-primary mt-6 w-full"
              >
                View ECCD assessments
              </Link>
            </section>
          </div>
        </>
      )}
      {link && (
        <Modal title="Link Child’s LRN" onClose={() => setLink(false)}>
          <LinkChild
            onLinked={() => {
              setLink(false);
              void refresh();
            }}
          />
        </Modal>
      )}
    </>
  );
}
