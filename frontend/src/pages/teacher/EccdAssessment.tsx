import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useTeacher } from "../../context/TeacherContext";
import API, { downloadFile, errorMessage } from "../../services/api";
import type { DomainProgress, Student } from "../../types";
import { studentName } from "../../types";
import { useAssessment } from "../../hooks/useAssessment";
import TeacherChecklist from "../../components/teacher/TeacherChecklist";
import TeacherDialog from "../../components/teacher/TeacherDialog";
import TeacherSkeleton from "../../components/teacher/TeacherSkeleton";
import { Button, Empty, Notice, PageHeader, Select } from "../../components/ui";

interface ClassDomain extends DomainProgress {
  questions: {
    question_id: number;
    question_text: string;
    sequence_order: number;
  }[];
}
export default function EccdAssessment() {
  const { user } = useAuth();
  const { section } = useTeacher();
  const rosterKey = `ames_roster_${user?.id}`;
  const studentKey = `ames_assessment_student_${user?.id}`;
  const domainKey = `ames_teacher_domain_${user?.id}`;
  const domainCacheKey = `ames_teacher_domains_${user?.id}`;
  const [students, setStudents] = useState<Student[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(rosterKey) || "[]") as Student[];
    } catch {
      return [];
    }
  });
  const [id, setId] = useState<number>(
    () => Number(localStorage.getItem(studentKey)) || 0,
  );
  const [domainId, setDomainId] = useState<number>(
    () => Number(localStorage.getItem(domainKey)) || 0,
  );
  const [domains, setDomains] = useState<ClassDomain[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem(domainCacheKey) || "[]",
      ) as ClassDomain[];
    } catch {
      return [];
    }
  });
  const selectDomain = (id: number) => {
    setDomainId(id);
    localStorage.setItem(domainKey, String(id));
  };
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [downloadBusy, setDownloadBusy] = useState<boolean>(false);
  const [menu, setMenu] = useState<boolean>(false);
  const [downloadOpen, setDownloadOpen] = useState<boolean>(false);
  const [downloadId, setDownloadId] = useState<number>(0);
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const downloadLock = useRef<boolean>(false);
  const version = useRef<number>(0);
  const selectedStudents = students.filter(
    (s) => !section || s.section_id === section.section_id,
  );
  const activeId = selectedStudents.some((s) => s.student_id === id) ? id : 0;
  const {
    data,
    error: assessmentError,
    loading: assessmentLoading,
    refresh,
  } = useAssessment(activeId, false);
  const load = useCallback(async () => {
    const request = ++version.current;
    const results = await Promise.allSettled([
      API.get<Student[]>("/api/eccd/students"),
      API.get<ClassDomain[]>("/api/eccd/domains-progress"),
    ]);
    if (request !== version.current) return;
    const failures: string[] = [];
    const roster = results[0];
    if (roster.status === "fulfilled") {
      setStudents(roster.value.data);
      localStorage.setItem(rosterKey, JSON.stringify(roster.value.data));
    } else failures.push(errorMessage(roster.reason));
    const progress = results[1];
    if (progress.status === "fulfilled") {
      setDomains(progress.value.data);
      localStorage.setItem(domainCacheKey, JSON.stringify(progress.value.data));
    } else failures.push(errorMessage(progress.reason));
    setError(failures.join(" "));
    setLoading(false);
  }, [rosterKey, domainCacheKey]);
  useEffect(() => {
    void load();
    const updated = () => void load();
    const connected = () => {
      setOnline(true);
      void load();
    };
    const disconnected = () => setOnline(false);
    window.addEventListener("ames-record-synced", updated);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => {
      ++version.current;
      window.removeEventListener("ames-record-synced", updated);
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
    };
  }, [load]);
  const download = async (target?: number) => {
    if (downloadLock.current) return;
    downloadLock.current = true;
    setDownloadBusy(true);
    setError("");
    try {
      await downloadFile(
        target
          ? `/api/teachers/download/${target}`
          : "/api/teachers/download-all",
        target ? "ECCD_Checklist.xlsx" : "ECCD_Checklists.zip",
      );
      setDownloadOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      downloadLock.current = false;
      setDownloadBusy(false);
    }
  };
  const domain = data?.domains.find((d) => d.domain_id === domainId);
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-6">
      <PageHeader
        title="ECCD Assessment"
        subtitle="Evaluate and monitor student progress across ECCD domains."
        actions={
          <>
            <span
              className={`self-center rounded-full px-3 py-2 text-xs font-bold ${online ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
            >
              {online ? "Online" : "Offline"}
            </span>
            <div className="relative">
              <Button
                aria-expanded={menu}
                disabled={downloadBusy}
                onClick={() => setMenu(!menu)}
              >
                {downloadBusy ? "Downloading…" : "Download Records"}
              </Button>
              {menu && (
                <div className="absolute right-0 z-20 mt-2 w-max max-w-[80vw] rounded-xl bg-white p-2 shadow-lg">
                  <Button
                    className="w-full"
                    variant="secondary"
                    onClick={() => {
                      setMenu(false);
                      setDownloadId(activeId);
                      setDownloadOpen(true);
                    }}
                  >
                    Download Single Student
                  </Button>
                  <Button
                    className="mt-2 w-full"
                    variant="secondary"
                    onClick={() => {
                      setMenu(false);
                      void download();
                    }}
                  >
                    Download All Students (ZIP)
                  </Button>
                </div>
              )}
            </div>
          </>
        }
      />
      <Notice tone="error">{error || assessmentError}</Notice>
      {!domainId && (
        <>
          <p className="text-xs text-slate-500">
            Completion rates cover all assigned sections. Select a domain to
            assess a student in the active section.
          </p>
          {loading ? (
            <TeacherSkeleton cards={4} />
          ) : !domains.length ? (
            <Empty>No assessment domains found.</Empty>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {domains.map((item, index) => (
                <section
                  key={item.domain_id}
                  className="card flex flex-col gap-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-lg font-extrabold text-blue-600">
                      {index + 1}
                    </span>
                    <div>
                      <h2 className="text-lg font-bold">{item.domain_name}</h2>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.questions.length} Indicators Checklist
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3 border-t border-slate-100 pt-4">
                    {(
                      ["pre_progress", "mid_progress", "post_progress"] as const
                    ).map((key, index) => (
                      <div key={key}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span>
                            {["Pre-Test", "Mid-Test", "Post-Test"][index]}
                          </span>
                          <strong>{item[key] ?? 0}%</strong>
                        </div>
                        <progress
                          aria-label={`${item.domain_name} ${key}`}
                          max={100}
                          value={item[key] ?? 0}
                          className={`h-2 w-full ${index === 0 ? "accent-blue-500" : index === 1 ? "accent-amber-500" : "accent-emerald-500"}`}
                        />
                      </div>
                    ))}
                  </div>
                  <Button
                    className="mt-auto w-full"
                    onClick={() => selectDomain(item.domain_id)}
                  >
                    Assess Domain
                  </Button>
                </section>
              ))}
            </div>
          )}
        </>
      )}
      {!!domainId && (
        <>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => selectDomain(0)}
          >
            ← Back to Domains
          </Button>
          <div className="card grid gap-4 legacy-sm:grid-cols-2">
            <Select
              label="Select Student to Assess"
              value={activeId || ""}
              disabled={busy}
              onChange={(e) => {
                const next = Number(e.target.value);
                setId(next);
                localStorage.setItem(studentKey, String(next));
              }}
            >
              <option value="">Select Student to Assess</option>
              {selectedStudents.map((s) => (
                <option key={s.student_id} value={s.student_id}>
                  {studentName(s)} ({s.masked_lrn})
                </option>
              ))}
            </Select>
            <Select
              label="Development Domain"
              value={domainId}
              disabled={busy}
              onChange={(e) => selectDomain(Number(e.target.value))}
            >
              {domains.map((d) => (
                <option key={d.domain_id} value={d.domain_id}>
                  {d.domain_name}
                </option>
              ))}
            </Select>
          </div>
          {!activeId ? (
            <Empty>
              Please select a student from the dropdown above to begin
              assessment.
            </Empty>
          ) : assessmentLoading && !data ? (
            <TeacherSkeleton cards={4} />
          ) : data && domain ? (
            <TeacherChecklist
              key={`${activeId}_${domainId}`}
              data={data}
              domain={domain}
              onBusy={setBusy}
              onSaved={() => {
                void refresh();
                void load();
              }}
            />
          ) : (
            <Empty>
              Assessment data could not be loaded. Your saved drafts remain
              available.
            </Empty>
          )}
        </>
      )}
      {downloadOpen && (
        <TeacherDialog
          title="Select Student to Download"
          locked={downloadBusy}
          onClose={() => setDownloadOpen(false)}
        >
          <Select
            label="Select Student"
            value={downloadId || ""}
            disabled={downloadBusy}
            onChange={(e) => setDownloadId(Number(e.target.value))}
          >
            <option value="">Select student</option>
            {students.map((s) => (
              <option key={s.student_id} value={s.student_id}>
                {studentName(s)} ({s.masked_lrn})
              </option>
            ))}
          </Select>
          <Notice tone="error">{error}</Notice>
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              disabled={downloadBusy}
              onClick={() => setDownloadOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={!downloadId || downloadBusy}
              onClick={() => void download(downloadId)}
            >
              {downloadBusy ? "Downloading…" : "Download"}
            </Button>
          </div>
        </TeacherDialog>
      )}
    </div>
  );
}
