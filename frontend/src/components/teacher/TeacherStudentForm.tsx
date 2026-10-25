import { useRef, useState } from "react";
import { useDurableForm } from "../../utils/drafts";
import { errorMessage } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { userDisplayName } from "../../utils/displayName";
import { useSettings } from "../../context/SettingsContext";
import { calculateRosterAge } from "../../utils/dateUtils";
import type { Section, Student } from "../../types";
import { studentName } from "../../types";
import { Button, Field, Notice, Select } from "../ui";

const studentKeys = [
  "first_name",
  "middle_name",
  "last_name",
  "date_of_birth",
  "gender",
  "address",
  "emergency_contact",
  "handedness",
  "num_of_siblings",
  "birth_order",
  "father_name",
  "father_age",
  "father_occ",
  "father_educ",
  "mother_name",
  "mother_age",
  "mother_occ",
  "mother_educ",
  "legal_guardian_name",
  "legal_guardian_age",
  "legal_guardian_occ",
  "legal_guardian_educ",
] as const;
type StudentFields = Record<
  (typeof studentKeys)[number] | "section_id" | "lrn_number",
  string
>;
interface TeacherStudentFormProps {
  student?: Student;
  sections: Section[];
  sectionId?: number;
  onSaved: () => void;
  onCancel: () => void;
  onBusy: (busy: boolean) => void;
}
export default function TeacherStudentForm({
  student,
  sections,
  sectionId,
  onSaved,
  onCancel,
  onBusy,
}: TeacherStudentFormProps) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const initial = Object.fromEntries(
    studentKeys.map((key) => [key, String(student?.[key] ?? "")]),
  ) as StudentFields;
  initial.lrn_number = "";
  initial.section_id = String(
    student?.section_id || sectionId || sections[0]?.section_id || "",
  );
  initial.gender ||= "Male";
  const { values, change, save } = useDurableForm(
    `student_${student?.student_id || "new"}`,
    initial,
  );
  const lock = useRef<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const field = (key: keyof StudentFields, label: string, type = "text") => (
    <Field
      key={key}
      label={label}
      type={type}
      required={["first_name", "last_name", "date_of_birth"].includes(key)}
      value={values[key]}
      onChange={(e) => change({ ...values, [key]: e.target.value })}
      min={type === "number" ? 0 : undefined}
      maxLength={
        key.endsWith("_educ") || key === "emergency_contact"
          ? 20
          : key.endsWith("_occ")
            ? 50
            : undefined
      }
    />
  );
  const sectionName =
    sections.find((s) => s.section_id === Number(values.section_id))
      ?.section_name ||
    student?.section_name ||
    "No assignment";
  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        onBusy(true);
        setError("");
        setMessage("");
        const payload: Record<string, string | number | null> = {};
        for (const [key, value] of Object.entries(values)) {
          if (student && ["section_id", "lrn_number"].includes(key)) continue;
          if (
            !student &&
            (key.startsWith("father_") ||
              key.startsWith("mother_") ||
              key.startsWith("legal_guardian_"))
          )
            continue;
          payload[key] = [
            "section_id",
            "num_of_siblings",
            "father_age",
            "mother_age",
            "legal_guardian_age",
          ].includes(key)
            ? value
              ? Number(value)
              : null
            : value || null;
        }
        try {
          const result = await save(
            student ? `/api/students/${student.student_id}` : "/api/students/",
            student ? "put" : "post",
            payload,
          );
          if (result === "saved") onSaved();
          else
            setMessage(
              "Saved on this device. Pending reconnection; keep your draft for review.",
            );
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          lock.current = false;
          setBusy(false);
          onBusy(false);
        }
      }}
    >
      <Notice tone="error">{error}</Notice>
      <Notice tone="success">{message}</Notice>
      <fieldset
        disabled={busy}
        className={`grid gap-6 ${student ? "legacy-md:grid-cols-[2fr_3fr]" : ""}`}
      >
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          {student && (
            <div className="mb-6 flex flex-col items-center gap-2 text-center">
              <span className="grid size-20 place-items-center rounded-full bg-blue-50 text-2xl font-bold text-blue-700">
                {student.first_name?.charAt(0)}
                {student.last_name?.charAt(0)}
              </span>
              <h3 className="font-extrabold">{studentName(student)}</h3>
              <p className="text-xs text-slate-500">
                LRN: {student.masked_lrn}
              </p>
            </div>
          )}
          <div className="space-y-4">
            {field("first_name", "First Name")}
            <div className="grid gap-4 legacy-sm:grid-cols-2">
              {field("middle_name", "Middle Name")}
              {field("last_name", "Last Name")}
            </div>
            {student ? (
              <>
                <Field
                  label="School"
                  value={settings.school_name || "Not configured"}
                  readOnly
                />
                <Field
                  label="Section (Auto-Assigned)"
                  value={sectionName}
                  readOnly
                />
                <Field
                  label="Teacher"
                  value={
                    [student.teacher_fname, student.teacher_lname]
                      .filter(Boolean)
                      .join(" ") ||
                    userDisplayName(user)
                  }
                  readOnly
                />
              </>
            ) : (
              <>
                {field("date_of_birth", "Date of Birth", "date")}
                <Field
                  label="LRN"
                  inputMode="numeric"
                  pattern="[0-9]{12}"
                  maxLength={12}
                  required
                  value={values.lrn_number}
                  onChange={(e) =>
                    change({
                      ...values,
                      lrn_number: e.target.value.replace(/\D/g, ""),
                    })
                  }
                />
                {sections.length > 1 ? (
                  <Select
                    label="Assigned Section"
                    value={values.section_id}
                    required
                    onChange={(e) =>
                      change({ ...values, section_id: e.target.value })
                    }
                  >
                    {sections.map((s) => (
                      <option key={s.section_id} value={s.section_id}>
                        {s.section_name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Field
                    label="Section (Auto-Assigned)"
                    value={sectionName}
                    readOnly
                  />
                )}
              </>
            )}
            <div className="grid gap-4 legacy-sm:grid-cols-2">
              <Select
                label="Gender"
                value={values.gender}
                onChange={(e) => change({ ...values, gender: e.target.value })}
              >
                <option>Male</option>
                <option>Female</option>
              </Select>
              {student && (
                <Field
                  label="Age"
                  readOnly
                  value={calculateRosterAge(
                    values.date_of_birth,
                    student.school_year || settings.current_school_year,
                    settings.school_year_start_month,
                  )}
                />
              )}
            </div>
            {field("emergency_contact", "Emergency Contact Number", "tel")}
          </div>
        </section>
        {student && (
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="mb-5 text-lg font-extrabold">
              Family Background &amp; Details
            </h3>
            <div className="space-y-5">
              {field("address", "Home Address")}
              <div className="grid gap-4 legacy-sm:grid-cols-2">
                <Select
                  label="Handedness"
                  value={values.handedness}
                  onChange={(e) =>
                    change({ ...values, handedness: e.target.value })
                  }
                >
                  <option value="">Choose handedness</option>
                  <option>Right</option>
                  <option>Left</option>
                </Select>
                {field("date_of_birth", "Birth Date", "date")}
              </div>
              {(["father", "mother", "legal_guardian"] as const).map(
                (prefix) => (
                  <fieldset key={prefix} className="rounded-xl bg-slate-50 p-4">
                    <legend className="px-2 text-sm font-bold capitalize">
                      {prefix.replace(/_/g, " ")}
                    </legend>
                    <div className="grid gap-4 legacy-sm:grid-cols-2">
                      {field(`${prefix}_name`, "Full Name")}
                      {field(`${prefix}_age`, "Age", "number")}
                      {field(`${prefix}_occ`, "Occupation")}
                      {field(`${prefix}_educ`, "Educational Attainment")}
                    </div>
                  </fieldset>
                ),
              )}
              <div className="grid gap-4 legacy-sm:grid-cols-2">
                {field("num_of_siblings", "No. of siblings", "number")}
                {field("birth_order", "Pang-ilan sa mag kakapatid")}
              </div>
            </div>
          </section>
        )}
      </fieldset>
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          className={student ? "bg-emerald-600" : ""}
          disabled={busy || (!student && !values.section_id)}
        >
          {busy ? "Saving…" : student ? "Save Changes" : "Save"}
        </Button>
      </div>
    </form>
  );
}
