import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import API, { errorMessage } from "../../services/api";
import type {
  Contact,
  DomainProgress,
  ParentStats,
  ChatMessage,
} from "../../types";
import { PERIODS, studentName } from "../../types";
import {
  ChildSelector,
  LinkChild,
} from "../../components/parent/ChildSelection";
import { useChildren } from "../../hooks/useChildren";
import StatCard from "../../components/StatCard";
import {
  Button,
  Empty,
  Loading,
  Modal,
  Notice,
  PageHeader,
  Progress,
} from "../../components/ui";

export default function Dashboard() {
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
