import { useCallback, useEffect, useRef, useState } from "react";
import API, { downloadFile, errorMessage } from "../../services/api";
import { confirmDraft, readDraft, useDurableForm } from "../../utils/drafts";
import { useSessionField } from "../../utils/sessionDrafts";
import type {
  Section,
  Teacher,
  TeacherFormValues,
  TeacherUpdatePayload,
  TeacherCreatePayload,
  SectionCreatePayload,
  TeacherPermissionPayload,
  TeacherAssignmentPayload,
} from "../../types";
import {
  Button,
  Empty,
  Field,
  Modal,
  Notice,
  Select,
  Switch,
} from "../../components/chairman/ui";
import Icon from "../../components/chairman/Icon";
import { IconButton } from "../../components/chairman/ui";
const temporaryPasswordValid = (value: string): boolean =>
  value.length >= 8 &&
  value.trim().length > 0 &&
  new TextEncoder().encode(value).length <= 72;
interface TeacherFormProps {
  onSection: () => void;
  onDeleteSection: (section: Section) => void;
  onBusyChange: (busy: boolean) => void;
  createdSection?: Section;
  teacher?: Teacher;
  sections: Section[];
  onSaved: () => void;
}
interface HandoverProps {
  section?: Section | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}
function incumbentSection(
  sections: Section[],
  sectionId: string,
  teacherId?: number,
): Section | undefined {
  return sections.find(
    (section) =>
      String(section.section_id) === sectionId &&
      Boolean(section.adviser_teacher_id) &&
      section.adviser_teacher_id !== teacherId &&
      section.role === "Primary Adviser" &&
      section.status === "Active",
  );
}
function SectionHandover({
  section,
  busy,
  onCancel,
  onConfirm,
}: HandoverProps) {
  const name =
    [section?.first_name, section?.last_name].filter(Boolean).join(" ") ||
    "another teacher";
  return (
    <Modal
      title={
        <span className="flex items-center gap-2 font-bold text-[#ed6c02]">
          <Icon name="AdminPanelSettings" />
          Confirm Section Handover
        </span>
      }
      className="rounded-2xl p-2"
      bodyClassName="pt-2"
      locked={busy}
      onClose={onCancel}
      footerClassName="p-4"
      footer={
        <>
          <Button
            variant="text"
            className="px-2! font-bold text-[#777]"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            className="bg-[#ed6c02] font-bold hover:bg-[#e65100]"
            disabled={busy || !section}
            onClick={onConfirm}
          >
            {busy && <ActionSpinner />}
            Confirm Handover
          </Button>
        </>
      }
    >
      <p className="text-base leading-[1.5]">
        Section{" "}
        <strong>{section?.section_name || "the selected section"}</strong> is
        currently assigned to <strong>{name}</strong>.
      </p>
      <p className="mt-4 text-sm leading-[1.43] text-[#777]">
        Assigning this section will detach the current Primary Adviser. Teachers
        without another active assignment are archived. The replacement teacher
        becomes the section's Primary Adviser. Student evaluations are
        preserved.
      </p>
    </Modal>
  );
}
function ActionSpinner() {
  return (
    <span
      role="status"
      aria-label="Saving changes"
      className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}
function TeacherForm({
  teacher,
  sections,
  onSaved,
  onSection,
  onDeleteSection,
  onBusyChange,
  createdSection,
}: TeacherFormProps) {
  const { values, change, save, key } = useDurableForm<TeacherFormValues>(
    `teacher_${teacher?.user_id || "new"}`,
    {
      first_name: teacher?.first_name || "",
      last_name: teacher?.last_name || "",
      email: teacher?.email || "",
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
  const submitting = useRef(false);
  const selectedCreation = useRef<number | null>(null);
  const [handover, setHandover] = useState<Section | null>(null);
  useEffect(() => {
    if (
      createdSection &&
      selectedCreation.current !== createdSection.section_id
    ) {
      selectedCreation.current = createdSection.section_id;
      change({ ...values, section_id: String(createdSection.section_id) });
    }
  }, [createdSection, values, change]);
  const submit = async () => {
    if (submitting.current) return;
    const section = sections.find(
      (item) => String(item.section_id) === values.section_id,
    );
    if (!values.first_name.trim() || !values.email.trim() || !section) {
      setError("Please fill in all required fields.");
      return;
    }
    if (!teacher && !temporaryPasswordValid(password)) {
      setError(
        "Use at least 8 characters for the temporary password. Maximum 72 UTF-8 bytes.",
      );
      return;
    }
    submitting.current = true;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      const data: TeacherUpdatePayload = {
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        email: values.email.trim(),
        username: values.email.trim(),
        employee_id: values.employee_id.trim() || null,
        class_name: section.section_name,
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
        const payload: TeacherCreatePayload = {
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email,
          username: data.username,
          employee_id: data.employee_id,
          section_id: section.section_id,
          password,
        };
        const response = await API.post("/api/teachers/", payload);
        if (response.status !== 200 && response.status !== 201)
          throw new Error("The server did not confirm this save.");
        if (version) confirmDraft(key, version);
        confirmPasswordDraft();
        onSaved();
      }
      setHandover(null);
    } catch (err) {
      setHandover(null);
      setError(errorMessage(err));
    } finally {
      submitting.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  };
  return (
    <>
      <form
        id="chairman-teacher-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (submitting.current) return;
          setError("");
          if (
            !values.first_name.trim() ||
            !values.email.trim() ||
            !values.section_id
          ) {
            setError("Please fill in all required fields.");
            return;
          }
          if (!teacher && !temporaryPasswordValid(password)) {
            setError(
              "Use at least 8 characters for the temporary password. Maximum 72 UTF-8 bytes.",
            );
            return;
          }
          const incumbent = incumbentSection(
            sections,
            values.section_id,
            teacher?.teacher_id,
          );
          if (incumbent) setHandover(incumbent);
          else void submit();
        }}
      >
        <Notice tone="error">{error}</Notice>
        <div className="mt-4 grid grid-cols-1 gap-4 legacy-sm:grid-cols-2">
          {(["first_name", "last_name", "email", "employee_id"] as const).map(
            (name) => (
              <Field
                key={name}
                captionLabel
                className="bg-[#f9f9f9]"
                label={
                  {
                    first_name: "First Name",
                    last_name: "Last Name (optional)",
                    email: "Email",
                    employee_id: "Employee ID (optional)",
                  }[name]
                }
                value={values[name]}
                type={name === "email" ? "email" : "text"}
                required={name === "first_name" || name === "email"}
                disabled={busy}
                maxLength={
                  name === "first_name" || name === "last_name" ? 100 : 50
                }
                onChange={(e) =>
                  change({
                    ...values,
                    [name]:
                      name === "first_name" || name === "last_name"
                        ? e.target.value.replace(/\p{Nd}/gu, "")
                        : e.target.value,
                  })
                }
              />
            ),
          )}
          <Select
            label="Class Name / Section"
            containerClassName="col-span-full"
            captionLabel
            floating={false}
            className={`bg-[#f9f9f9] ${values.section_id ? "" : "[&_button>span]:text-[#aaa]"}`}
            value={values.section_id}
            disabled={busy}
            optionAction={(value, closeMenu) => {
              const section = sections.find(
                (item) => String(item.section_id) === value,
              );
              return section ? (
                <IconButton
                  small
                  aria-label={`Delete section ${section.section_name}`}
                  className="mr-4 p-0.5! text-[#d32f2f]"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteSection(section);
                    closeMenu();
                  }}
                >
                  <Icon name="Delete" className="size-5" />
                </IconButton>
              ) : null;
            }}
            onChange={(e) => {
              if (e.target.value === "ADD_NEW") onSection();
              else change({ ...values, section_id: e.target.value });
            }}
          >
            <option value="" disabled>
              Select a Section
            </option>
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
              captionLabel
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={busy}
            />
          )}
        </div>
        {!teacher && password && (
          <p
            className={`text-xs leading-6 ${temporaryPasswordValid(password) ? "text-emerald-600" : "text-slate-500"}`}
          >
            Use 8 or more characters for the temporary password. Maximum 72
            UTF-8 bytes.
          </p>
        )}
      </form>
      {handover && (
        <SectionHandover
          section={handover}
          busy={busy}
          onCancel={() => setHandover(null)}
          onConfirm={() => void submit()}
        />
      )}
    </>
  );
}
function SectionForm({
  onSaved,
  onBusyChange,
}: {
  onSaved: (sectionName: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { values, change, save, key } = useDurableForm("section_new", {
    section_name: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  useEffect(() => {
    const synced = (event: Event) => {
      if ((event as CustomEvent<string>).detail === key)
        onSaved(values.section_name.trim());
    };
    window.addEventListener("ames-record-synced", synced);
    return () => window.removeEventListener("ames-record-synced", synced);
  }, [key, values.section_name, onSaved]);
  return (
    <form
      id="chairman-section-form"
      className="pt-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (submitting.current) return;
        if (!values.section_name.trim()) {
          setError("Section Identifier is required.");
          return;
        }
        submitting.current = true;
        setBusy(true);
        onBusyChange(true);
        setError("");
        try {
          const payload: SectionCreatePayload = {
            section_name: values.section_name.trim(),
          };
          const result = await save("/api/chairman/sections", "post", payload);
          if (result === "saved") onSaved(payload.section_name);
          else setError("Saved for reconnection.");
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          submitting.current = false;
          setBusy(false);
          onBusyChange(false);
        }
      }}
    >
      <Notice tone="error">{error}</Notice>
      <Field
        label="Section Identifier (e.g. A, B, Mabini)"
        captionLabel
        placeholder="Enter Identifier"
        className="bg-[#f9f9f9]"
        disabled={busy}
        maxLength={50}
        value={values.section_name}
        onChange={(e) => change({ ...values, section_name: e.target.value })}
        required
      />
    </form>
  );
}
function ManageAccess({
  teacher,
  sections,
  onSaved,
  onBusyChange,
}: {
  teacher: Teacher;
  sections: Section[];
  onSaved: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { values, change, save } = useDurableForm(
    `teacher_assignment_${teacher.teacher_id}`,
    {
      section_id: String(teacher.section_id || ""),
    },
  );
  const permissionForm = useDurableForm(
    `teacher_question_permission_${teacher.teacher_id}`,
    { permission: teacher.allow_eccd_question_management },
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [handover, setHandover] = useState<Section | null>(null);
  const assign = async () => {
    if (submitting.current || !values.section_id) return;
    submitting.current = true;
    setBusy(true);
    onBusyChange(true);
    setError("");
    setMessage("");
    try {
      const payload: TeacherAssignmentPayload = {
        teacher_id: teacher.teacher_id,
      };
      const result = await save(
        `/api/chairman/sections/${values.section_id}/assign-teacher`,
        "post",
        payload,
      );
      setHandover(null);
      setMessage(
        result === "saved"
          ? "Section assignment saved."
          : "Section assignment saved for reconnection.",
      );
      if (result === "saved") onSaved();
    } catch (err) {
      setHandover(null);
      setError(errorMessage(err));
    } finally {
      submitting.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  };
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
            disabled={busy}
            onChange={(e) => change({ ...values, section_id: e.target.value })}
          >
            <option value="">Choose section</option>
            {sections.map((s) => (
              <option key={s.section_id} value={s.section_id}>
                {s.section_name}
              </option>
            ))}
          </Select>
          <Notice>
            {(() => {
              const incumbent = incumbentSection(
                sections,
                values.section_id,
                teacher.teacher_id,
              );
              return incumbent
                ? `Section ${incumbent.section_name} is currently assigned to ${[incumbent.first_name, incumbent.last_name].filter(Boolean).join(" ") || "another teacher"}. Assigning this section will transfer the adviser role to this teacher.`
                : "Assign this teacher as the section's Adviser. Student records, assessments and section parent editing settings are preserved.";
            })()}
          </Notice>
          <Button
            disabled={busy || !values.section_id}
            onClick={() => {
              const incumbent = incumbentSection(
                sections,
                values.section_id,
                teacher.teacher_id,
              );
              if (incumbent) setHandover(incumbent);
              else void assign();
            }}
          >
            Assign teacher
          </Button>
        </div>
      </details>
      <div>
        <h3 className="mb-2 text-sm font-bold">System Permissions</h3>
        <div className="flex items-center justify-between rounded-lg border border-[#e0e0e0] bg-white p-4 text-sm">
          <span className="pr-4">
            <span className="block text-base font-semibold">
              Enable ECCD Question Management
            </span>
            <span className="text-[#777]">
              Grants this teacher access to configure, edit, add, and toggle
              ECCD questions and developmental domains.
            </span>
          </span>
          <Switch
            aria-label="Enable ECCD Question Management"
            checked={permissionForm.values.permission}
            disabled={busy}
            onChange={async (event) => {
              if (submitting.current) return;
              submitting.current = true;
              const next = { permission: event.target.checked };
              permissionForm.change(next);
              setBusy(true);
              onBusyChange(true);
              setError("");
              setMessage("");
              try {
                const payload: TeacherPermissionPayload = {
                  allow_eccd_question_management: next.permission,
                };
                const result = await permissionForm.save(
                  `/api/chairman/teachers/${teacher.teacher_id}/permissions`,
                  "put",
                  payload,
                  next,
                );
                setMessage(
                  result === "saved"
                    ? `ECCD Question Management permission ${next.permission ? "enabled" : "disabled"} successfully.`
                    : "Saved for reconnection.",
                );
                if (result === "saved") onSaved();
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                submitting.current = false;
                setBusy(false);
                onBusyChange(false);
              }
            }}
          />
        </div>
      </div>
      {handover && (
        <SectionHandover
          section={handover}
          busy={busy}
          onCancel={() => setHandover(null)}
          onConfirm={() => void assign()}
        />
      )}
    </div>
  );
}
export default function TeacherManagement() {
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
  const [formBusy, setFormBusy] = useState(false);
  const [sectionBusy, setSectionBusy] = useState(false);
  const [accessBusy, setAccessBusy] = useState(false);
  const [createdSectionName, setCreatedSectionName] = useState("");
  const confirmationSubmitting = useRef(false);
  const refreshVersion = useRef(0);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    text: string;
    path: string;
    method: "put" | "delete";
    data?: object;
    action?: "archive" | "restore";
  } | null>(null);
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    try {
      const [activeRows, archiveRows, secs] = await Promise.all([
        API.get<Teacher[]>("/api/teachers/active"),
        API.get<Teacher[]>("/api/teachers/archived"),
        API.get<Section[]>("/api/chairman/sections"),
      ]);
      if (version !== refreshVersion.current) return;
      setTeachers(archiveRows.data);
      setActiveTeachers(activeRows.data);
      setSections(secs.data);
      setAccess((current) =>
        current
          ? activeRows.data.find(
              (item) => item.teacher_id === current.teacher_id,
            ) || null
          : null,
      );
    } catch (err) {
      if (version === refreshVersion.current) setError(errorMessage(err));
    }
  }, []);
  useEffect(() => {
    void refresh();
    const handler = () => void refresh();
    window.addEventListener("ames-record-synced", handler);
    return () => window.removeEventListener("ames-record-synced", handler);
  }, [refresh, archived]);
  const confirmAction = async () => {
    if (!confirmation || confirmationSubmitting.current) return;
    const pending = confirmation;
    confirmationSubmitting.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await API.request({
        url: pending.path,
        method: pending.method,
        data: pending.data,
      });
      if (response.status !== 200 && response.status !== 201)
        throw new Error("The server did not confirm this save.");
      setConfirmation(null);
      setMessage("Changes saved.");
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      confirmationSubmitting.current = false;
      setBusy(false);
    }
  };
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
    <div
      className={`overflow-x-auto rounded-[4px] bg-white ${archive ? "" : "border border-[#e0e0e0]"}`}
    >
      <table className="w-full">
        <thead className="bg-[#f9f9f9]">
          <tr>
            {["Teacher Name", "Class Name", "Email", "Action"].map((label) => (
              <th
                key={label}
                className={`whitespace-normal! font-bold! ${label === "Action" ? "text-right!" : ""}`}
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
                <div className="text-right">
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
                        onClick={() => {
                          setCreatedSectionName("");
                          setForm(t);
                        }}
                      >
                        <Icon name="Edit" />
                      </IconButton>
                    </>
                  )}
                  <IconButton
                    title={archive ? "Restore Teacher" : "Archive Teacher"}
                    aria-label={`${archive ? "Restore" : "Archive"} ${t.first_name}`}
                    className={archive ? "text-[#2e7d32]" : "text-[#ed6c02]"}
                    onClick={() => {
                      setError("");
                      setConfirmation({
                        title: archive
                          ? "Restore Teacher Account"
                          : "Archive Teacher Account",
                        text: archive
                          ? `Restore ${[t.first_name, t.last_name].filter(Boolean).join(" ") || "this teacher"}'s account? A section must be manually assigned after restoration. Assessment history will be retained.`
                          : `Archive ${[t.first_name, t.last_name].filter(Boolean).join(" ") || "this teacher"}'s account? This will revoke active access and release their assigned section. Assessment history will be retained.`,
                        path: `/api/teachers/${t.user_id}/${archive ? "unarchive" : "archive"}`,
                        method: "put",
                        action: archive ? "restore" : "archive",
                      });
                    }}
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
              <td
                colSpan={4}
                className={`${archive ? "py-8!" : "py-6!"} text-center text-[#777]`}
              >
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
      <div className="mb-6 flex items-center justify-between">
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
            onClick={() => {
              setCreatedSectionName("");
              setForm("new");
            }}
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
          locked={busy || !!confirmation}
          footerClassName="p-4"
          size="md"
          titleClassName="bg-[#f4f5f7] [&_h2]:font-bold"
          bodyClassName="p-0!"
          onClose={() => setArchived(false)}
          footer={
            <Button
              disabled={busy || !!confirmation}
              onClick={() => setArchived(false)}
            >
              Close
            </Button>
          }
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
          locked={formBusy || sectionOpen || !!confirmation}
          footerClassName="justify-center! p-6"
          footer={
            <>
              <Button
                variant="text"
                className="mr-4 px-2! text-[#777]"
                disabled={formBusy}
                onClick={() => setForm(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="chairman-teacher-form"
                className="px-8!"
                disabled={formBusy}
              >
                {formBusy && <ActionSpinner />}
                {form === "new" ? "Save" : "Save Changes"}
              </Button>
            </>
          }
          onClose={() => setForm(null)}
        >
          <TeacherForm
            key={form === "new" ? "new" : form.user_id}
            onSection={() => setSectionOpen(true)}
            onDeleteSection={(section) => {
              setError("");
              setConfirmation({
                title: "Delete section?",
                text: "Transfer all students out of this section first. The server will reject deletion while any students remain assigned.",
                path: `/api/chairman/sections/${section.section_id}`,
                method: "delete",
              });
            }}
            onBusyChange={setFormBusy}
            createdSection={sections.find(
              (section) => section.section_name === createdSectionName,
            )}
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
          bodyClassName="border-y border-black/12 pt-4 pb-4!"
          locked={sectionBusy}
          footerClassName="p-4"
          footer={
            <>
              <Button
                variant="text"
                className="px-2! font-bold text-[#777]"
                disabled={sectionBusy}
                onClick={() => setSectionOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="chairman-section-form"
                className="font-bold"
                disabled={sectionBusy}
              >
                Create Section
              </Button>
            </>
          }
          onClose={() => setSectionOpen(false)}
        >
          <SectionForm
            onBusyChange={setSectionBusy}
            onSaved={(sectionName) => {
              setCreatedSectionName(sectionName);
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
          locked={accessBusy}
          footerClassName="p-4"
          footer={
            <Button
              className="px-6!"
              disabled={accessBusy}
              onClick={() => setAccess(null)}
            >
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
            key={access.teacher_id}
            onBusyChange={setAccessBusy}
            teacher={access}
            sections={sections}
            onSaved={() => void refresh()}
          />
        </Modal>
      )}
      {confirmation && (
        <Modal
          title={confirmation.title}
          className={confirmation.action ? "rounded-2xl p-2" : ""}
          titleClassName={
            confirmation.action
              ? `[&_h2]:font-bold ${confirmation.action === "restore" ? "text-[#4F46E5]" : "text-[#ed6c02]"}`
              : ""
          }
          locked={busy}
          onClose={() => setConfirmation(null)}
          footerClassName={confirmation.action ? "p-4" : ""}
          footer={
            <>
              <Button
                variant={confirmation.action ? "secondary" : "text"}
                className={
                  confirmation.action ? "border-[#aaa]! text-[#777]" : "px-2!"
                }
                disabled={busy}
                onClick={() => setConfirmation(null)}
              >
                Cancel
              </Button>
              <Button
                variant={
                  confirmation.action === "restore" ? "primary" : "danger"
                }
                className={
                  confirmation.action === "restore"
                    ? "bg-[#4F46E5] hover:bg-[#4338ca]"
                    : ""
                }
                disabled={busy}
                onClick={() => void confirmAction()}
              >
                {busy && <ActionSpinner />}
                {confirmation.action === "restore"
                  ? "Restore Account"
                  : confirmation.action === "archive"
                    ? "Archive Account"
                    : "Confirm"}
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">{confirmation.text}</p>
          <Notice tone="error">{error}</Notice>
        </Modal>
      )}
    </>
  );
}
