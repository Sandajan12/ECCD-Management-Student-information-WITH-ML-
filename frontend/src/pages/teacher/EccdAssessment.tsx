import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import API, { downloadFile, errorMessage } from "../../services/api";
import type { DomainProgress, Period, Student } from "../../types";
import { studentName } from "../../types";
import {
  Checklist,
  PeriodTabs,
} from "../../components/eccd/AssessmentChecklist";
import { useAssessment } from "../../hooks/useAssessment";
import {
  Button,
  Empty,
  Loading,
  Notice,
  PageHeader,
  Progress,
  Select,
} from "../../components/ui";

export default function EccdAssessment() {
  const { user } = useAuth();
  const rosterKey = `ames_roster_${user?.id}`;
  const [students, setStudents] = useState<Student[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(rosterKey) || "[]") as Student[];
    } catch {
      return [];
    }
  });
  const [id, setId] = useState(
    Number(localStorage.getItem(`ames_assessment_student_${user?.id}`)) || 0,
  );
  const [period, setPeriod] = useState<Period>("PRE");
  const [domainId, setDomainId] = useState(0);
  const [classProgress, setClassProgress] = useState<DomainProgress[]>([]);
  const [downloadError, setDownloadError] = useState("");
  const [downloadBusy, setDownloadBusy] = useState(false);
  const { data, error, loading, refresh } = useAssessment(id, false);
  useEffect(() => {
    void API.get<Student[]>("/api/eccd/students")
      .then((res) => {
        setStudents(res.data);
        localStorage.setItem(rosterKey, JSON.stringify(res.data));
        setId((current) =>
          res.data.some((s) => s.student_id === current)
            ? current
            : res.data[0]?.student_id || 0,
        );
      })
      .catch((err) => setDownloadError(errorMessage(err)));
    void API.get<DomainProgress[]>("/api/eccd/domains-progress")
      .then((res) => setClassProgress(res.data))
      .catch(() => {});
  }, [rosterKey]);
  const domain =
    data?.domains.find((d) => d.domain_id === domainId) || data?.domains[0];
  const download = async (all = false) => {
    setDownloadBusy(true);
    try {
      await downloadFile(
        all ? "/api/teachers/download-all" : `/api/teachers/download/${id}`,
        all ? "ECCD_Checklists.zip" : "ECCD_Checklist.xlsx",
      );
    } catch (err) {
      setDownloadError(errorMessage(err));
    } finally {
      setDownloadBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        title="ECCD Assessments"
        subtitle="Record developmental milestones across the three testing periods."
        actions={
          <>
            <Button
              variant="secondary"
              disabled={!id || downloadBusy}
              onClick={() => void download()}
            >
              Download checklist
            </Button>
            <Button
              variant="secondary"
              disabled={downloadBusy}
              onClick={() => void download(true)}
            >
              Download all
            </Button>
          </>
        }
      />
      <div className="mb-5 space-y-3">
        <Notice tone="error">{error || downloadError}</Notice>
      </div>
      <div className="card mb-6">
        <div className="grid items-end gap-5 md:grid-cols-2">
          <Select
            label="Select student"
            value={id || ""}
            onChange={(e) => {
              const next = Number(e.target.value);
              localStorage.setItem(
                `ames_assessment_student_${user?.id}`,
                String(next),
              );
              setId(next);
            }}
          >
            {!students.length && (
              <option value="">No students available</option>
            )}
            {students.map((s) => (
              <option key={s.student_id} value={s.student_id}>
                {studentName(s)} • {s.masked_lrn}
              </option>
            ))}
          </Select>
          <PeriodTabs period={period} select={setPeriod} />
        </div>
      </div>
      {loading && !data ? (
        <Loading />
      ) : !data ? (
        <Empty>Add a student to start an assessment.</Empty>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_3fr]">
          <aside className="card space-y-2">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Development domains
            </h2>
            {data.domains.map((d) => (
              <button
                key={d.domain_id}
                className={`w-full rounded-xl p-3 text-left text-sm ${domain?.domain_id === d.domain_id ? "bg-blue-50 font-semibold text-blue-700" : "hover:bg-slate-50"}`}
                onClick={() => setDomainId(d.domain_id)}
              >
                {d.domain_name}
                <span className="mt-2 block">
                  <Progress
                    value={Math.round(
                      (d.questions.filter((q) => !!q.answers?.[period]).length /
                        Math.max(1, d.questions.length)) *
                        100,
                    )}
                  />
                </span>
              </button>
            ))}
          </aside>
          <section className="card">
            {domain && (
              <Checklist
                key={`${id}_${period}_${domain.domain_id}`}
                data={data}
                domain={domain}
                period={period}
                onSaved={() => void refresh()}
              />
            )}
          </section>
        </div>
      )}
      {classProgress.length > 0 && (
        <section className="card mt-6">
          <h2 className="mb-4 font-semibold">Class assessment completion</h2>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {classProgress.map((d) => (
              <div key={d.domain_id}>
                <p className="mb-2 text-sm">{d.domain_name}</p>
                <Progress
                  value={
                    period === "PRE"
                      ? d.pre_progress
                      : period === "MID"
                        ? d.mid_progress
                        : d.post_progress
                  }
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
