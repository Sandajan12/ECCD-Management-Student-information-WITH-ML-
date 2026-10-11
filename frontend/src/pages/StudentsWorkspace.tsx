import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useDurableFile } from "../utils/fileDrafts";
import API, { downloadFile, errorMessage } from "../services/api";
import type { ImportResult, Section, Student } from "../types";
import { studentName } from "../types";
import StudentForm from "../components/StudentForm";
import {
  Button,
  Empty,
  Field,
  Loading,
  Modal,
  Notice,
  PageHeader,
  Progress,
  Select,
} from "../components/ui";
type ConfirmAction = {
  title: string;
  description: string;
  run: () => Promise<unknown>;
};
export default function StudentsWorkspace() {
  const { user } = useAuth();
  const chairman = user?.role === "super-admin";
  const [students, setStudents] = useState<Student[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("All");
  const [year, setYear] = useState("All");
  const [archived, setArchived] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [student, setStudent] = useState<Student | null>(null);
  const [add, setAdd] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const [destination, setDestination] = useState("");
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const {
    file,
    choose: setFile,
    upload: uploadFile,
  } = useDurableFile("student_import");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const refresh = useCallback(async () => {
    try {
      const [rows, sectionRes] = await Promise.all([
        API.get<Student[]>(
          chairman
            ? "/api/chairman/students"
            : archived
              ? "/api/students/archived"
              : "/api/students/",
        ),
        API.get<Section[]>(
          chairman ? "/api/chairman/sections" : "/api/sections/",
        ),
      ]);
      setStudents(rows.data);
      setSections(sectionRes.data);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [chairman, archived]);
  useEffect(() => {
    void refresh();
    const synced = () => void refresh();
    window.addEventListener("ames-record-synced", synced);
    return () => window.removeEventListener("ames-record-synced", synced);
  }, [refresh]);
  const visible = students.filter(
    (s) =>
      s.is_active === !archived &&
      (section === "All" || String(s.section_id) === section) &&
      (year === "All" || s.school_year === year) &&
      `${studentName(s)} ${s.masked_lrn} ${s.parent_names || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const years = [
    ...new Set(
      students.map((s) => s.school_year).filter((v): v is string => !!v),
    ),
  ]
    .sort()
    .reverse();
  const act = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      setMessage(success);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const openStudent = async (id: number) => {
    try {
      setStudent((await API.get<Student>(`/api/students/${id}`)).data);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <>
      <PageHeader
        title={chairman ? "Student Records" : "My Students"}
        subtitle="Manage student details and follow their learning journey."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setArchived(!archived);
                setSelected([]);
              }}
            >
              {archived ? "Active students" : "Archived students"}
            </Button>
            {!chairman && (
              <Button
                variant="secondary"
                onClick={() => {
                  setImportOpen(true);
                  setImportResult(null);
                }}
              >
                Import Excel
              </Button>
            )}
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() =>
                void act(
                  () =>
                    downloadFile(
                      chairman
                        ? `/api/chairman/export-eccd?section=${section}&schoolYear=${year}`
                        : "/api/teachers/download-all",
                      "ECCD_Records.zip",
                    ),
                  "Download ready.",
                )
              }
            >
              Download ECCD
            </Button>
            <Button onClick={() => setAdd(true)}>+ Add student</Button>
          </>
        }
      />
      <div className="mb-5 space-y-3">
        <Notice tone="error">{error}</Notice>
        <Notice tone="success">{message}</Notice>
      </div>
      <div className="card">
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <Field
            label="Search students"
            placeholder="Name, masked LRN, or parent"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            label="Section"
            value={section}
            onChange={(e) => {
              setSection(e.target.value);
              setSelected([]);
            }}
          >
            <option value="All">All sections</option>
            {sections.map((s) => (
              <option key={s.section_id} value={s.section_id}>
                {s.section_name}
              </option>
            ))}
          </Select>
          <Select
            label="School year"
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setSelected([]);
            }}
          >
            <option>All</option>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </Select>
        </div>
        {chairman && selected.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-indigo-50 p-4 text-sm text-indigo-800">
            <span>
              {selected.length} students selected • Assessment records will be
              preserved
            </span>
            <Button onClick={() => setTransfer(true)}>Transfer students</Button>
          </div>
        )}
        {loading ? (
          <Loading />
        ) : !visible.length ? (
          <Empty>
            No {archived ? "archived" : "active"} students match these filters.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  {chairman && (
                    <th>
                      <input
                        aria-label="Select all visible students"
                        type="checkbox"
                        checked={
                          visible.length > 0 &&
                          visible.every((s) => selected.includes(s.student_id))
                        }
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? visible.map((s) => s.student_id)
                              : [],
                          )
                        }
                      />
                    </th>
                  )}
                  <th>Student</th>
                  <th>LRN</th>
                  <th>Section / year</th>
                  <th>Profile</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s.student_id} className="hover:bg-slate-50">
                    {chairman && (
                      <td>
                        <input
                          aria-label={`Select ${studentName(s)}`}
                          type="checkbox"
                          checked={selected.includes(s.student_id)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, s.student_id]
                                : selected.filter((id) => id !== s.student_id),
                            )
                          }
                        />
                      </td>
                    )}
                    <td>
                      <button
                        className="text-left font-semibold text-blue-700"
                        onClick={() => void openStudent(s.student_id)}
                      >
                        {studentName(s)}
                      </button>
                      <p className="mt-1 text-xs text-slate-500">
                        {s.gender} • Age {s.decimal_age ?? "—"} •{" "}
                        {s.parent_names || "No parent account linked"}
                      </p>
                    </td>
                    <td className="whitespace-nowrap text-slate-500">
                      {s.masked_lrn}
                    </td>
                    <td>
                      {s.section_name}
                      <p className="text-xs text-slate-500">{s.school_year}</p>
                    </td>
                    <td className="min-w-32">
                      <Progress value={s.profile_completeness} />
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => void openStudent(s.student_id)}
                        >
                          Details
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setConfirm({
                              title: archived
                                ? "Restore student?"
                                : "Archive student?",
                              description:
                                "Assessment records will be retained.",
                              run: () =>
                                API.put(
                                  `/api/students/${s.student_id}/${archived ? "unarchive" : "archive"}`,
                                ),
                            })
                          }
                        >
                          {archived ? "Restore" : "Archive"}
                        </Button>
                        {archived && (
                          <Button
                            variant="danger"
                            onClick={() =>
                              setConfirm({
                                title: "Permanently delete student?",
                                description:
                                  "This removes the student and their assessment records permanently.",
                                run: () =>
                                  API.delete(`/api/students/${s.student_id}`),
                              })
                            }
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!chairman && !archived && students.length > 0 && (
          <div className="mt-5">
            <Button
              variant="danger"
              onClick={() =>
                setConfirm({
                  title: "Archive all students?",
                  description:
                    "All active students in your assigned sections will be archived. Their records remain available in Archived students.",
                  run: () => API.put("/api/students/archive-all"),
                })
              }
            >
              Archive all students
            </Button>
          </div>
        )}
      </div>
      {student && (
        <Modal title="Student Record Details" onClose={() => setStudent(null)}>
          <div className="flex flex-wrap justify-between gap-3">
            <span className="badge">
              {student.section_name} • {student.school_year}
            </span>
            <Button
              variant="secondary"
              onClick={() =>
                void act(
                  () =>
                    downloadFile(
                      `/api/teachers/download/${student.student_id}`,
                      "ECCD_Checklist.xlsx",
                    ),
                  "Download ready.",
                )
              }
            >
              Download checklist
            </Button>
            {!chairman && (
              <Button
                variant="secondary"
                onClick={() =>
                  void act(
                    () =>
                      API.post("/api/messages/notify-student", {
                        student_id: student.student_id,
                      }),
                    "Linked parents notified.",
                  )
                }
              >
                Notify parent
              </Button>
            )}
          </div>
          <StudentForm
            key={student.student_id}
            student={student}
            onSaved={() => {
              setStudent(null);
              void refresh();
            }}
          />
        </Modal>
      )}
      {add && (
        <Modal title="Add New Student" onClose={() => setAdd(false)}>
          <StudentForm
            sections={sections}
            onSaved={() => {
              setAdd(false);
              void refresh();
            }}
          />
        </Modal>
      )}
      {transfer && (
        <Modal title="Transfer Students" onClose={() => setTransfer(false)}>
          <Notice>
            All existing PRE, MID, and POST evaluation records will be preserved
            when students move to the new section.
          </Notice>
          <Select
            label="Destination section"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          >
            <option value="">Choose a section</option>
            {sections.map((s) => (
              <option key={s.section_id} value={s.section_id}>
                {s.section_name}
              </option>
            ))}
          </Select>
          <Button
            disabled={!destination || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await API.put("/api/chairman/students/transfer", {
                  student_ids: selected,
                  new_section_id: Number(destination),
                });
                setSelected([]);
                setTransfer(false);
                setMessage(
                  "Students transferred. All evaluation records preserved.",
                );
                await refresh();
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirm transfer
          </Button>
          <Notice tone="error">{error}</Notice>
        </Modal>
      )}
      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}>
          <p className="text-sm text-slate-600">{confirm.description}</p>
          <Notice tone="error">{error}</Notice>
          <Button
            disabled={busy}
            variant="danger"
            onClick={async () => {
              setBusy(true);
              try {
                await confirm.run();
                setConfirm(null);
                setSelected([]);
                setMessage("Records updated.");
                await refresh();
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirm
          </Button>
        </Modal>
      )}
      {importOpen && (
        <Modal
          title="Import DepEd Excel Records"
          onClose={() => setImportOpen(false)}
        >
          <p className="text-sm text-slate-500">
            Use the official .xlsx checklist with an Info Sheet and the seven
            domain sheets. Successful rows are saved even when other rows need
            correction.
          </p>
          <Field
            label="Excel workbook"
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          {file && (
            <p className="text-sm text-slate-500">
              Selected workbook: {file.name}
            </p>
          )}
          <Select
            label="Import into section"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          >
            <option value="">Use assigned section</option>
            {sections.map((s) => (
              <option key={s.section_id} value={s.section_id}>
                {s.section_name}
              </option>
            ))}
          </Select>
          <Notice tone="error">{error}</Notice>
          {importResult && (
            <>
              <Notice tone="success">
                {importResult.successCount} imported •{" "}
                {importResult.failedCount} failed
              </Notice>
              <ul className="space-y-2 text-sm text-red-700">
                {importResult.errors.map((row, i) => (
                  <li key={i}>
                    Row {row.row}: {row.error}
                  </li>
                ))}
              </ul>
            </>
          )}
          <Button
            disabled={!file || busy}
            onClick={async () => {
              if (!file) return;
              setBusy(true);
              setError("");
              try {
                const result = await uploadFile<ImportResult>(
                  "/api/teachers/import-students",
                  destination ? { section_id: destination } : {},
                );
                if (result) setImportResult(result);
                else
                  setMessage(
                    "Workbook saved on this device and queued for reconnection.",
                  );
                await refresh();
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Importing…" : "Import workbook"}
          </Button>
        </Modal>
      )}
    </>
  );
}
