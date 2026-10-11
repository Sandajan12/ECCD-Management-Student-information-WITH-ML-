import { useCallback, useEffect, useState } from "react";
import API, { downloadFile, errorMessage } from "../services/api";
import { confirmDraft, readDraft, useDurableForm } from "../utils/drafts";
import { useSessionField } from "../utils/sessionDrafts";
import type { Section, Teacher } from "../types";
import {
  Button,
  Empty,
  Field,
  Modal,
  Notice,
  PageHeader,
  Select,
} from "../components/ui";
import {
  PasswordRules,
  passwordValid,
} from "../components/ForceChangePassword";
function TeacherForm({
  teacher,
  sections,
  onSaved,
}: {
  teacher?: Teacher;
  sections: Section[];
  onSaved: () => void;
}) {
  const { values, change, save, key } = useDurableForm(
    `teacher_${teacher?.user_id || "new"}`,
    {
      first_name: teacher?.first_name || "",
      last_name: teacher?.last_name || "",
      email: teacher?.email || "",
      username: teacher?.username || "",
      employee_id: teacher?.employee_id || "",
      section_id: String(teacher?.section_id || ""),
    },
  );
  const [password, setPassword, confirmPasswordDraft] = useSessionField(
    `${key}_password`,
    "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const data = {
            ...values,
            username: values.username || undefined,
            section_id: values.section_id ? Number(values.section_id) : null,
          };
          if (teacher) {
            const result = await save(
              `/api/teachers/${teacher.user_id}`,
              "put",
              data,
            );
            if (result === "saved") onSaved();
            else setError("Draft saved. We will retry after reconnection.");
          } else {
            const version = readDraft<unknown>(key)?.revision;
            await API.post("/api/teachers/", { ...data, password });
            if (version) confirmDraft(key, version);
            confirmPasswordDraft();
            onSaved();
          }
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Notice tone="error">{error}</Notice>
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            "first_name",
            "last_name",
            "email",
            "username",
            "employee_id",
          ] as const
        ).map((key) => (
          <Field
            key={key}
            label={
              {
                first_name: "First name",
                last_name: "Last name",
                email: "Email",
                username: "Username (optional)",
                employee_id: "Employee ID",
              }[key]
            }
            value={values[key]}
            type={key === "email" ? "email" : "text"}
            required={["first_name", "email"].includes(key)}
            onChange={(e) => change({ ...values, [key]: e.target.value })}
          />
        ))}
        <Select
          label="Primary adviser section"
          value={values.section_id}
          onChange={(e) => change({ ...values, section_id: e.target.value })}
        >
          <option value="">No assignment</option>
          {sections.map((s) => (
            <option key={s.section_id} value={s.section_id}>
              {s.section_name}
            </option>
          ))}
        </Select>
      </div>
      {!teacher && (
        <>
          <Field
            label="Temporary password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <PasswordRules value={password} />
          <Notice>
            The teacher must change this temporary password on their first
            sign-in. Assigning a new Primary Adviser hands over the section and
            preserves student assessments.
          </Notice>
        </>
      )}
      <Button
        type="submit"
        disabled={busy || (!teacher && !passwordValid(password))}
      >
        {busy ? "Saving…" : teacher ? "Save teacher" : "Create teacher account"}
      </Button>
    </form>
  );
}
function SectionForm({
  teachers,
  onSaved,
}: {
  teachers: Teacher[];
  onSaved: () => void;
}) {
  const { values, change, save } = useDurableForm("section_new", {
    section_name: "",
    teacher_id: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const result = await save("/api/chairman/sections", "post", {
            section_name: values.section_name,
            teacher_id: values.teacher_id ? Number(values.teacher_id) : null,
          });
          if (result === "saved") onSaved();
          else setError("Saved for reconnection.");
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Notice tone="error">{error}</Notice>
      <Field
        label="Section name"
        maxLength={50}
        value={values.section_name}
        onChange={(e) => change({ ...values, section_name: e.target.value })}
        required
      />
      <Select
        label="Primary Adviser (optional)"
        value={values.teacher_id}
        onChange={(e) => change({ ...values, teacher_id: e.target.value })}
      >
        <option value="">Unassigned</option>
        {teachers
          .filter((t) => t.is_active)
          .map((t) => (
            <option key={t.teacher_id} value={t.teacher_id}>
              {t.first_name} {t.last_name}
            </option>
          ))}
      </Select>
      <Button disabled={busy} type="submit">
        Create section
      </Button>
    </form>
  );
}
function ManageAccess({
  teacher,
  sections,
  onSaved,
}: {
  teacher: Teacher;
  sections: Section[];
  onSaved: () => void;
}) {
  const { values, change, save } = useDurableForm(
    `teacher_access_${teacher.teacher_id}`,
    {
      section_id: String(teacher.section_id || ""),
      role: "Primary Adviser",
      permission: teacher.allow_eccd_question_management,
    },
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-6">
      <Notice tone="error">{error}</Notice>
      <Notice tone="success">{message}</Notice>
      <div className="space-y-4">
        <h3 className="font-semibold">Section assignment</h3>
        <Select
          label="Section"
          value={values.section_id}
          onChange={(e) => change({ ...values, section_id: e.target.value })}
        >
          <option value="">Choose section</option>
          {sections.map((s) => (
            <option key={s.section_id} value={s.section_id}>
              {s.section_name}
            </option>
          ))}
        </Select>
        <Select
          label="Assignment role"
          value={values.role}
          onChange={(e) => change({ ...values, role: e.target.value })}
        >
          <option>Primary Adviser</option>
          <option>Substitute</option>
        </Select>
        <Notice>
          {values.role === "Primary Adviser"
            ? "The current Primary Adviser will be replaced. Teachers with no remaining assignment are archived. Student assessment records are preserved."
            : "The current Primary Adviser stays assigned and continues to control parent permissions."}
        </Notice>
        <Button
          disabled={busy || !values.section_id}
          onClick={async () => {
            setBusy(true);
            try {
              const res = await API.post(
                `/api/chairman/sections/${values.section_id}/assign-teacher`,
                { teacher_id: teacher.teacher_id, role: values.role },
              );
              if (res.status === 200 || res.status === 201) {
                setMessage("Section assignment saved.");
                onSaved();
              }
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          Assign teacher
        </Button>
      </div>
      <div className="border-t border-slate-100 pt-5">
        <h3 className="mb-3 font-semibold">ECCD question management</h3>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-5 accent-blue-600"
            checked={values.permission}
            onChange={(e) =>
              change({ ...values, permission: e.target.checked })
            }
          />
          <span>
            Allow this teacher to add, edit, and remove ECCD domains and
            questions.
          </span>
        </label>
        <Button
          className="mt-4"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await save(
                `/api/chairman/teachers/${teacher.teacher_id}/permissions`,
                "put",
                { allow_eccd_question_management: values.permission },
              );
              setMessage(
                result === "saved"
                  ? "Question access saved. The teacher can refresh their session to see it."
                  : "Saved for reconnection.",
              );
              if (result === "saved") onSaved();
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          Save question access
        </Button>
      </div>
    </div>
  );
}
export default function TeachersWorkspace() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Teacher | "new" | null>(null);
  const [access, setAccess] = useState<Teacher | null>(null);
  const [sectionOpen, setSectionOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    text: string;
    path: string;
    method: "put" | "delete";
    data?: object;
  } | null>(null);
  const refresh = useCallback(async () => {
    try {
      const [rows, secs] = await Promise.all([
        API.get<Teacher[]>(
          archived ? "/api/teachers/archived" : "/api/teachers/active",
        ),
        API.get<Section[]>("/api/chairman/sections"),
      ]);
      setTeachers(rows.data);
      setSections(secs.data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [archived]);
  useEffect(() => {
    void refresh();
    const handler = () => void refresh();
    window.addEventListener("ames-record-synced", handler);
    return () => window.removeEventListener("ames-record-synced", handler);
  }, [refresh]);
  const act = async (run: () => Promise<unknown>, text: string) => {
    setBusy(true);
    setError("");
    try {
      await run();
      setMessage(text);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        title="Teacher Accounts"
        subtitle="Manage teacher accounts, section assignments, and access."
        actions={
          <>
            <Button variant="secondary" onClick={() => setArchived(!archived)}>
              {archived ? "Active teachers" : "Archived teachers"}
            </Button>
            <Button variant="secondary" onClick={() => setSectionOpen(true)}>
              + New section
            </Button>
            <Button onClick={() => setForm("new")}>+ Add teacher</Button>
          </>
        }
      />
      <div className="mb-5 space-y-3">
        <Notice tone="error">{error}</Notice>
        <Notice tone="success">{message}</Notice>
      </div>
      <div className="card mb-6">
        <Field
          label="Search teacher accounts"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="mt-5 overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th>Teacher</th>
                <th>Employee ID</th>
                <th>Section / role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {teachers
                .filter((t) =>
                  `${t.first_name} ${t.last_name} ${t.email} ${t.employee_id}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((t) => (
                  <tr key={t.teacher_id}>
                    <td>
                      <p className="font-semibold">
                        {t.first_name} {t.last_name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{t.email}</p>
                    </td>
                    <td>{t.employee_id || "—"}</td>
                    <td>
                      {t.section_name || "Unassigned"}
                      <p className="text-xs text-slate-500">{t.role}</p>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => setForm(t)}>
                          Edit
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => setAccess(t)}
                        >
                          Manage access
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setConfirmation({
                              title: archived
                                ? "Restore teacher?"
                                : "Archive teacher?",
                              text: "The teacher’s assessment history will be retained.",
                              path: `/api/teachers/${t.user_id}/${archived ? "unarchive" : "archive"}`,
                              method: "put",
                            })
                          }
                        >
                          {archived ? "Restore" : "Archive"}
                        </Button>
                        {archived && (
                          <Button
                            variant="danger"
                            onClick={() =>
                              setConfirmation({
                                title: "Delete teacher account?",
                                text: "Student evaluations are preserved, but this account is permanently removed.",
                                path: `/api/teachers/${t.user_id}`,
                                method: "delete",
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
          {!teachers.length && (
            <Empty>
              No {archived ? "archived" : "active"} teacher accounts.
            </Empty>
          )}
        </div>
      </div>
      <div className="card">
        <h2 className="mb-5 text-lg font-semibold">
          Sections & Primary Advisers
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sections.map((s) => (
            <section
              key={s.section_id}
              className="space-y-4 rounded-xl bg-slate-50 p-4"
            >
              <div>
                <h3 className="font-semibold">{s.section_name}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {[s.first_name, s.last_name].filter(Boolean).join(" ") ||
                    "Awaiting adviser"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      () =>
                        downloadFile(
                          `/api/chairman/sections/${s.section_id}/export-summary?schoolYear=All`,
                          "ECCD_Summary.xlsx",
                        ),
                      "Summary downloaded.",
                    )
                  }
                >
                  Export summary
                </Button>
                {s.adviser_teacher_id && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setConfirmation({
                        title: "Unassign Primary Adviser?",
                        text: "Students and their evaluations remain in this section.",
                        path: `/api/chairman/sections/${s.section_id}/assign`,
                        method: "put",
                        data: { teacher_id: null, role: "Primary Adviser" },
                      })
                    }
                  >
                    Unassign
                  </Button>
                )}
                <Button
                  variant="danger"
                  onClick={() =>
                    setConfirmation({
                      title: "Delete section?",
                      text: "Transfer all students out of this section first.",
                      path: `/api/chairman/sections/${s.section_id}`,
                      method: "delete",
                    })
                  }
                >
                  Delete
                </Button>
              </div>
            </section>
          ))}
        </div>
        {!sections.length && (
          <Empty>Create a section before adding students.</Empty>
        )}
      </div>
      {form && (
        <Modal
          title={
            form === "new" ? "Add Teacher Account" : "Edit Teacher Account"
          }
          onClose={() => setForm(null)}
        >
          <TeacherForm
            teacher={form === "new" ? undefined : form}
            sections={sections}
            onSaved={() => {
              setForm(null);
              setMessage("Teacher account saved.");
              void refresh();
            }}
          />
        </Modal>
      )}
      {sectionOpen && (
        <Modal title="Create New Section" onClose={() => setSectionOpen(false)}>
          <SectionForm
            teachers={teachers}
            onSaved={() => {
              setSectionOpen(false);
              void refresh();
            }}
          />
        </Modal>
      )}
      {access && (
        <Modal
          title={`Manage Access • ${access.first_name}`}
          onClose={() => setAccess(null)}
        >
          <ManageAccess
            teacher={access}
            sections={sections}
            onSaved={() => void refresh()}
          />
        </Modal>
      )}
      {confirmation && (
        <Modal title={confirmation.title} onClose={() => setConfirmation(null)}>
          <p className="text-sm text-slate-600">{confirmation.text}</p>
          <Notice tone="error">{error}</Notice>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await API.request({
                  url: confirmation.path,
                  method: confirmation.method,
                  data: confirmation.data,
                });
                setConfirmation(null);
                setMessage("Changes saved.");
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
    </>
  );
}
