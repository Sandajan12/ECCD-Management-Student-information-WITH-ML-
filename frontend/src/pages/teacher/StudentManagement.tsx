import { useCallback, useEffect, useRef, useState } from "react";
import { useTeacher } from "../../context/TeacherContext";
import { useSettings } from "../../context/SettingsContext";
import { useDurableFile } from "../../utils/fileDrafts";
import { confirmDraft, readDraft, useDurableForm } from "../../utils/drafts";
import { calculateRosterAge } from "../../utils/dateUtils";
import API, { downloadFile, errorMessage } from "../../services/api";
import type { ImportResult, Student } from "../../types";
import { studentName } from "../../types";
import TeacherStudentForm from "../../components/teacher/TeacherStudentForm";
import TeacherDialog from "../../components/teacher/TeacherDialog";
import TeacherSkeleton from "../../components/teacher/TeacherSkeleton";
import Icon from "../../components/chairman/Icon";
import { Button, Field, Notice, PageHeader, Select } from "../../components/ui";

interface Confirmation {
  title: string;
  description: string;
  action: () => Promise<unknown>;
  label: string;
}
interface ImportOptions {
  section_id: string;
}
export default function StudentManagement() {
  const { section, sections } = useTeacher();
  const { settings } = useSettings();
  const [students, setStudents] = useState<Student[]>([]);
  const [archivedRows, setArchivedRows] = useState<Student[]>([]);
  const [archiveOpen, setArchiveOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const lock = useRef<boolean>(false);
  const request = useRef<number>(0);
  const detailRequest = useRef<number>(0);
  const [search, setSearch] = useState<string>("");
  const [year, setYear] = useState<string>("All");
  const [student, setStudent] = useState<Student | null>(null);
  const [add, setAdd] = useState<boolean>(false);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [importOpen, setImportOpen] = useState<boolean>(false);
  const importOptions = useDurableForm<ImportOptions>(
    "student_import_options",
    { section_id: "" },
  );
  const { file, choose, upload } = useDurableFile("student_import");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const refresh = useCallback(async () => {
    const version = ++request.current;
    setLoading(true);
    const results = await Promise.allSettled([
      API.get<Student[]>("/api/students/"),
      API.get<Student[]>("/api/students/archived"),
    ]);
    if (version !== request.current) return;
    const failures: string[] = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled")
        (index === 0 ? setStudents : setArchivedRows)(result.value.data);
      else failures.push(errorMessage(result.reason));
    });
    setError(failures.join(" "));
    setLoading(false);
  }, []);
  useEffect(() => {
    void refresh();
    const synced = () => void refresh();
    window.addEventListener("ames-record-synced", synced);
    window.addEventListener("online", synced);
    return () => {
      ++request.current;
      ++detailRequest.current;
      window.removeEventListener("ames-record-synced", synced);
      window.removeEventListener("online", synced);
    };
  }, [refresh]);
  const act = async (action: () => Promise<unknown>, success: string) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      setMessage(success);
      await refresh();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const openStudent = async (id: number) => {
    const version = ++detailRequest.current;
    try {
      const res = await API.get<Student>(`/api/students/${id}`);
      if (version === detailRequest.current) setStudent(res.data);
    } catch (err) {
      if (version === detailRequest.current) setError(errorMessage(err));
    }
  };
  const years = [
    ...new Set(
      [...students, ...archivedRows]
        .map((s) => s.school_year)
        .filter((v): v is string => !!v),
    ),
  ]
    .sort()
    .reverse();
  const rows = (archived: boolean) =>
    (archived ? archivedRows : students).filter(
      (s) =>
        (!section || s.section_id === section.section_id) &&
        (year === "All" || s.school_year === year) &&
        `${studentName(s)} ${s.masked_lrn} ${s.parent_names || ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  const rosterTable = (archived: boolean) => (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
      <table className="w-full">
        <thead>
          <tr>
            <th>Student Name</th>
            <th>Age</th>
            <th>Parent Guardian</th>
            <th>{archived ? "School Year" : "Progress"}</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows(archived).map((s) => (
            <tr key={s.student_id} className="hover:bg-slate-50">
              <td>
                <button
                  className="flex items-center gap-3 text-left"
                  onClick={() => void openStudent(s.student_id)}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-50 font-semibold text-slate-500">
                    {s.first_name?.charAt(0)}
                    {s.last_name?.charAt(0)}
                  </span>
                  <span>
                    <strong className="uppercase">
                      {s.last_name}, {s.first_name}{" "}
                      {s.middle_name ? `${s.middle_name.charAt(0)}.` : ""}
                    </strong>
                    <span className="mt-1 block text-xs text-slate-400">
                      {s.masked_lrn} · {s.section_name}
                    </span>
                  </span>
                </button>
              </td>
              <td className="whitespace-nowrap">
                {s.date_of_birth
                  ? calculateRosterAge(
                      s.date_of_birth,
                      s.school_year || settings.current_school_year,
                      settings.school_year_start_month,
                    )
                  : s.decimal_age !== null
                    ? `${s.decimal_age} yrs`
                    : "N/A"}
              </td>
              <td className="uppercase">{s.parent_names || "N/A"}</td>
              <td>
                {archived ? (
                  s.school_year || "N/A"
                ) : (
                  <div className="flex items-center gap-2">
                    <progress
                      className="teacher-progress h-2 min-w-20 flex-1"
                      aria-label={`${studentName(s)} profile completeness`}
                      max={100}
                      value={s.profile_completeness || 0}
                    />
                    <span className="text-xs font-bold text-slate-500">
                      {s.profile_completeness || 0}%
                    </span>
                  </div>
                )}
              </td>
              <td>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="rounded-full bg-transparent p-2 text-blue-600"
                    aria-label={`Edit ${studentName(s)}`}
                    title="Edit Student"
                    disabled={busy}
                    onClick={() => void openStudent(s.student_id)}
                  >
                    <Icon name="Edit" />
                    <span className="sr-only">Edit</span>
                  </Button>
                  <Button
                    variant="secondary"
                    className="rounded-full bg-transparent p-2 text-amber-600"
                    aria-label={`${archived ? "Restore" : "Archive"} ${studentName(s)}`}
                    title={archived ? "Restore Student" : "Archive Student"}
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        title: archived ? "Restore Student" : "Archive Student",
                        description:
                          "The student's assessment records will be retained.",
                        label: archived ? "Restore" : "Archive",
                        action: () =>
                          API.put(
                            `/api/students/${s.student_id}/${archived ? "unarchive" : "archive"}`,
                          ),
                      })
                    }
                  >
                    <Icon name={archived ? "Unarchive" : "Archive"} />
                    <span className="sr-only">
                      {archived ? "Restore" : "Archive"}
                    </span>
                  </Button>
                  {archived && (
                    <Button
                      variant="danger"
                      className="rounded-full bg-transparent p-2"
                      aria-label={`Delete ${studentName(s)}`}
                      title="Delete Student"
                      disabled={busy}
                      onClick={() =>
                        setConfirm({
                          title: "Delete Student Permanently?",
                          description:
                            "This permanently removes this student and their assessment records.",
                          label: "Delete",
                          action: () =>
                            API.delete(`/api/students/${s.student_id}`),
                        })
                      }
                    >
                      <Icon name="Delete" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {!rows(archived).length && (
            <tr>
              <td colSpan={5} className="py-12 text-center text-slate-500">
                No {archived ? "archived" : "active"} students found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="space-y-5">
      <PageHeader
        title="Manage Students"
        subtitle="View and manage detailed students profile."
        actions={
          <>
            <Button variant="secondary" onClick={() => setArchiveOpen(true)}>
              View Archive
            </Button>
            <Button
              className="bg-amber-600"
              disabled={busy || !students.length}
              onClick={() =>
                setConfirm({
                  title: "Archive All Students?",
                  description:
                    "This archives all active students across your assigned sections, including those outside the current filters. Assessment records remain available in View Archive.",
                  label: "Yes, Archive All",
                  action: () => API.put("/api/students/archive-all"),
                })
              }
            >
              Archive All
            </Button>
            <Button disabled={!sections.length} onClick={() => setAdd(true)}>
              Add Student
            </Button>
            <Button
              className="bg-violet-600"
              onClick={() => {
                setImportOpen(true);
                if (!readDraft<ImportOptions>(importOptions.key))
                  importOptions.change({
                    section_id: String(section?.section_id || ""),
                  });
              }}
            >
              Import Info Sheet
            </Button>
          </>
        }
      />
      <Notice tone="error">{error}</Notice>
      <Notice tone="success">{message}</Notice>
      <div className="grid gap-4 legacy-sm:grid-cols-2">
        <Field
          label="Search Students"
          placeholder="Name, masked LRN, or guardian"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          label="School Year"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        >
          <option>All</option>
          {years.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </Select>
      </div>
      {loading ? <TeacherSkeleton cards={4} /> : rosterTable(false)}
      {archiveOpen && (
        <TeacherDialog
          title="Archived Students"
          wide
          onClose={() => setArchiveOpen(false)}
        >
          {rosterTable(true)}
          <Button onClick={() => setArchiveOpen(false)}>Close</Button>
        </TeacherDialog>
      )}
      {student && (
        <TeacherDialog
          title="Student Profile"
          wide
          locked={busy}
          onClose={() => {
            ++detailRequest.current;
            setStudent(null);
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="badge">
              {student.section_name} · {student.school_year} ·{" "}
              {student.is_active ? "Active" : "Archived"}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={busy}
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
              <Button
                variant="secondary"
                disabled={busy || !student.is_active}
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
                Send to Parents
              </Button>
            </div>
          </div>
          <Notice tone="error">{error}</Notice>
          <Notice tone="success">{message}</Notice>
          <TeacherStudentForm
            key={student.student_id}
            student={student}
            sections={sections}
            onBusy={setBusy}
            onCancel={() => setStudent(null)}
            onSaved={() => {
              setStudent(null);
              setMessage("Student details saved.");
              void refresh();
            }}
          />
        </TeacherDialog>
      )}
      {add && (
        <TeacherDialog
          title="New Student"
          locked={busy}
          onClose={() => setAdd(false)}
        >
          <TeacherStudentForm
            sections={sections}
            sectionId={section?.section_id}
            onBusy={setBusy}
            onCancel={() => setAdd(false)}
            onSaved={() => {
              setAdd(false);
              setMessage("Student successfully added!");
              void refresh();
            }}
          />
        </TeacherDialog>
      )}
      {confirm && (
        <TeacherDialog
          title={confirm.title}
          locked={busy}
          onClose={() => setConfirm(null)}
        >
          <p className="text-sm text-slate-600">{confirm.description}</p>
          <Notice tone="error">{error}</Notice>
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                if (await act(confirm.action, "Records updated."))
                  setConfirm(null);
              }}
            >
              {busy ? "Saving…" : confirm.label}
            </Button>
          </div>
        </TeacherDialog>
      )}
      {importOpen && (
        <TeacherDialog
          title="Import Info Sheet"
          locked={busy}
          onClose={() => setImportOpen(false)}
        >
          <p className="text-sm text-slate-500">
            Use the official .xlsx checklist containing an Info Sheet and the
            seven domain sheets. Successful rows are saved even when other rows
            need correction.
          </p>
          <Field
            label="Excel workbook"
            type="file"
            accept=".xlsx"
            disabled={busy}
            onChange={(e) => {
              choose(e.target.files?.[0] || null);
              setImportResult(null);
            }}
          />
          {file && (
            <p className="break-words text-sm text-emerald-700">{file.name}</p>
          )}
          <Select
            label="Import into assigned section"
            value={importOptions.values.section_id}
            disabled={busy}
            onChange={(e) =>
              importOptions.change({ section_id: e.target.value })
            }
          >
            <option value="">Use assigned section</option>
            {sections.map((s) => (
              <option key={s.section_id} value={s.section_id}>
                {s.section_name}
              </option>
            ))}
          </Select>
          <Notice tone="error">{error}</Notice>
          <Notice tone="success">{message}</Notice>
          {importResult && (
            <div className="space-y-3">
              <h3 className="font-bold">Import Summary</h3>
              <p className="text-sm">
                {importResult.successCount} Successfully Imported ·{" "}
                {importResult.failedCount} Failed to Import
              </p>
              <ul className="space-y-2 text-sm text-red-700">
                {importResult.errors.map((row, index) => (
                  <li key={index}>
                    Row {row.row}: {row.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setImportOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={!file || busy}
              onClick={async () => {
                if (!file || lock.current) return;
                lock.current = true;
                setBusy(true);
                setError("");
                setMessage("");
                try {
                  const snapshot = readDraft<ImportOptions>(importOptions.key);
                  const result = await upload<ImportResult>(
                    "/api/teachers/import-students",
                    importOptions.values.section_id
                      ? { section_id: importOptions.values.section_id }
                      : {},
                  );
                  if (result) {
                    setImportResult(result);
                    if (!result.failedCount && snapshot)
                      confirmDraft(importOptions.key, snapshot.revision);
                  } else
                    setMessage(
                      "Workbook saved on this device and queued for reconnection.",
                    );
                  await refresh();
                } catch (err) {
                  setError(errorMessage(err));
                } finally {
                  lock.current = false;
                  setBusy(false);
                }
              }}
            >
              {busy ? "Importing…" : "Import"}
            </Button>
          </div>
        </TeacherDialog>
      )}
    </div>
  );
}
