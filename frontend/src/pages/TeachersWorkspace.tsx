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
  Select,
} from "../components/chairman/ui";
import Icon from "../components/chairman/Icon";
import { IconButton } from "../components/chairman/ui";
import {
  PasswordRules,
  passwordValid,
} from "../components/ForceChangePassword";
function TeacherForm({
  teacher,
  sections,
  onSaved,
  onCancel,
  onSection,
}: {
  onCancel: () => void;
  onSection: () => void;
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
        if (!teacher && !passwordValid(password)) {setError("Use at least 8 characters, uppercase, lowercase, and a number. Maximum 72 UTF-8 bytes.");return;}
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
      <div className="mt-4 grid grid-cols-1 gap-4 legacy-sm:grid-cols-2">
        {(teacher
          ? ([
              "first_name",
              "last_name",
              "username",
              "email",
              "employee_id",
            ] as const)
          : (["first_name", "email", "employee_id"] as const)
        ).map((name) => (
          <Field
            key={name}
            containerClassName={
              !teacher && name !== "employee_id" ? "col-span-full" : ""
            }
            className="bg-[#f9f9f9]"
            label={
              {
                first_name: teacher ? "First Name" : "Full Name",
                last_name: "Last Name (optional)",
                username: "Username",
                email: "Email",
                employee_id: "Employee ID",
              }[name]
            }
            value={values[name]}
            type={name === "email" ? "email" : "text"}
            required={name === "first_name" || name === "email"}
            onChange={(e) => change({ ...values, [name]: e.target.value })}
          />
        ))}
        <Select
          label="Class Name / Section"
          floating={false}
          className={`bg-[#f9f9f9] ${values.section_id ? "" : "[&_button>span]:text-[#aaa]"}`}
          value={values.section_id}
          onChange={(e) => {
            if (e.target.value === "ADD_NEW") onSection();
            else change({ ...values, section_id: e.target.value });
          }}
        >
          <option value="">Select a Section</option>
          {sections.map((section) => (
            <option key={section.section_id} value={section.section_id}>
              {section.section_name}
            </option>
          ))}
          <option value="ADD_NEW">+ Add New Section</option>
        </Select>
        {!teacher && (
          <Field
            containerClassName="col-span-full"
            className="bg-[#f9f9f9]"
            label="Password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        )}
      </div>
      {!teacher && password && <PasswordRules value={password} />}
      <div className="flex justify-center gap-2 pt-6 pb-1">
        <Button variant="text" className="mr-4 text-[#777]" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          className="px-8"
          disabled={busy}
        >
          {busy ? "Saving..." : teacher ? "Save Changes" : "Save"}
        </Button>
      </div>
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
    `teacher_assignment_${teacher.teacher_id}`,
    {
      section_id: String(teacher.section_id || ""),
      role: "Primary Adviser",
    },
  );
  const permissionForm = useDurableForm(
    `teacher_question_permission_${teacher.teacher_id}`,
    { permission: teacher.allow_eccd_question_management },
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-4">
      <Notice tone="error">{error}</Notice>
      <Notice tone="success">{message}</Notice>
      <details className="rounded-lg border border-[#e2e8f0] p-4">
        <summary className="cursor-pointer text-sm font-bold">
          Section assignment
        </summary>
        <div className="mt-4 space-y-4">
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
                const result = await save(
                  `/api/chairman/sections/${values.section_id}/assign-teacher`,
                  "post",
                  { teacher_id: teacher.teacher_id, role: values.role },
                );
                if (result === "saved") {
                  setMessage("Section assignment saved.");
                  onSaved();
                } else setMessage("Section assignment saved for reconnection.");
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
      </details>
      <div>
        <h3 className="mb-2 text-sm font-bold">System Permissions</h3>
        <label className="flex items-center justify-between gap-4 rounded-lg border border-[#e0e0e0] p-4 text-sm">
          <input
            type="checkbox"
            className="peer order-2 size-5 shrink-0 accent-[#4543c0]"
            checked={permissionForm.values.permission}
            onChange={(e) =>
              permissionForm.change({ permission: e.target.checked })
            }
          />
          <span>
            <span className="block text-base font-semibold">
              Enable ECCD Question Management
            </span>
            <span className="text-[#777]">
              Grants this teacher access to configure, edit, add, and toggle
              ECCD questions and developmental domains.
            </span>
          </span>
        </label>
        <Button
          className="mt-4"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await permissionForm.save(
                `/api/chairman/teachers/${teacher.teacher_id}/permissions`,
                "put",
                {
                  allow_eccd_question_management:
                    permissionForm.values.permission,
                },
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
  const [activeTeachers, setActiveTeachers] = useState<Teacher[]>([]);
  const [sectionsOpen, setSectionsOpen] = useState(false);
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
      if (!archived) setActiveTeachers(rows.data);
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
  const teacherTable = (rows: Teacher[], archive = false) => (
    <div className={`overflow-x-auto rounded-[4px] bg-white ${archive ? "" : "border border-[#e0e0e0]"}`}>
      <table className="w-full min-w-[650px]">
        <thead className="bg-[#f9f9f9]">
          <tr>
            {["Teacher Name", "Class Name", "Email", "Action"].map((label) => (
              <th
                key={label}
                className={`font-bold! ${label === "Action" ? "text-right!" : ""}`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.teacher_id}>
              <td>
                {t.first_name} {t.last_name}
              </td>
              <td>{t.class_name || t.section_name}</td>
              <td>{t.email}</td>
              <td className="text-right">
                <div className="flex items-center justify-end whitespace-nowrap">
                  {!archive && (
                    <>
                      <Button
                        small
                        variant="secondary"
                        startIcon={<Icon name="AdminPanelSettings" />}
                        className="mr-2"
                        onClick={() => setAccess(t)}
                      >
                        Manage Access
                      </Button>
                      <IconButton
                        title="Edit Teacher"
                        aria-label={`Edit ${t.first_name}`}
                        className="text-[#4543c0]"
                        onClick={() => setForm(t)}
                      >
                        <Icon name="Edit" />
                      </IconButton>
                    </>
                  )}
                  <IconButton
                    title={archive ? "Restore Teacher" : "Archive Teacher"}
                    aria-label={`${archive ? "Restore" : "Archive"} ${t.first_name}`}
                    className={archive ? "text-[#2e7d32]" : "text-[#ed6c02]"}
                    onClick={() =>
                      setConfirmation({
                        title: archive
                          ? "Restore teacher?"
                          : "Archive teacher?",
                        text: "The teacher's assessment history will be retained.",
                        path: `/api/teachers/${t.user_id}/${archive ? "unarchive" : "archive"}`,
                        method: "put",
                      })
                    }
                  >
                    <Icon name={archive ? "Restore" : "Archive"} />
                  </IconButton>
                  {archive && (
                    <IconButton
                      title="Permanently Delete Teacher"
                      className="text-[#d32f2f]"
                      onClick={() =>
                        setConfirmation({
                          title: "Delete teacher account?",
                          text: "Student evaluations are preserved, but this account is permanently removed.",
                          path: `/api/teachers/${t.user_id}`,
                          method: "delete",
                        })
                      }
                    >
                      <Icon name="Delete" />
                    </IconButton>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={4} className={`${archive ? "py-8!" : "py-6!"} text-center text-[#777]`}>
                No {archive ? "archived" : "active"} teachers found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
  return (
    <>
      <h1 className="mb-8 text-[34px] font-bold leading-[1.235]">
        Teacher's Account Management
      </h1>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold leading-[1.6]">
          Registered Teachers{" "}
          <span className="rounded-[4px] bg-[#eee] px-2 text-sm font-normal leading-[1.43]">
            Total: {activeTeachers.length}
          </span>
        </h2>
        <div>
          <Button
            variant="secondary"
            className="mr-4"
            onClick={() => setArchived(true)}
          >
            View Archive
          </Button>
          <Button
            startIcon={<Icon name="Add" />}
            onClick={() => setForm("new")}
          >
            Add New Teacher
          </Button>
        </div>
      </div>
      <Notice tone="error">{error}</Notice>
      <Notice tone="success">{message}</Notice>
      {teacherTable(activeTeachers)}
      {archived && (
        <Modal
          title="Archived Teacher Accounts"
          footerClassName="p-4"
          size="md"
          titleClassName="bg-[#f4f5f7] [&_h2]:font-bold"
          bodyClassName="p-0!"
          onClose={() => setArchived(false)}
          footer={<Button onClick={() => setArchived(false)}>Close</Button>}
        >
          {teacherTable(teachers, true)}
        </Modal>
      )}
      {sectionsOpen && (
        <Modal
          title="Sections & Primary Advisers"
          onClose={() => setSectionsOpen(false)}
          closeButton
        >
          {" "}
          <div className="space-y-4">
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
        </Modal>
      )}
      {form && (
        <Modal
          title={form === "new" ? "New Teacher" : "Edit Teacher"}
          titleClassName="justify-center [&_h2]:font-bold"
          onClose={() => setForm(null)}
        >
          <TeacherForm
            onCancel={() => setForm(null)}
            onSection={() => setSectionOpen(true)}
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
        <Modal
          title="Create New Section"
          titleClassName="[&_h2]:font-bold"
          bodyClassName="border-y border-black/12 pt-5"
          onClose={() => setSectionOpen(false)}
        >
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
          title={
            <span className="flex items-center gap-2 font-bold">
              <Icon
                name="AdminPanelSettings"
                className="size-6 text-[#4543c0]"
              />
              Manage Teacher Access
            </span>
          }
          className="rounded-xl"
          bodyClassName="border-y border-black/12 py-5"
          footer={
            <Button className="px-6" onClick={() => setAccess(null)}>
              Done
            </Button>
          }
          onClose={() => setAccess(null)}
        >
          <div className="mb-4 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-4">
            <p className="text-base font-bold leading-[1.75]">
              {access.first_name} {access.last_name}
            </p>
            <p className="text-sm text-[#777]">
              Email: {access.email} | Employee ID: {access.employee_id || "N/A"}
            </p>
            <p className="text-sm text-[#777]">
              Section:{" "}
              {access.class_name || access.section_name || "Unassigned"}
            </p>
          </div>
          <Button variant="text" small onClick={() => setSectionsOpen(true)}>
            Manage Sections
          </Button>
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
