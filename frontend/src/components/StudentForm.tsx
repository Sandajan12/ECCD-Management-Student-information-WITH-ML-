import { useState } from "react";
import { useDurableForm } from "../utils/drafts";
import { errorMessage } from "../services/api";
import type { Section, Student } from "../types";
import { Button, Field, Notice, Select } from "./ui";
interface StudentFields {
  first_name: string;
  middle_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  lrn_number: string;
  section_id: string;
  address: string;
  emergency_contact: string;
  handedness: string;
  num_of_siblings: string;
  birth_order: string;
  father_name: string;
  father_age: string;
  father_occ: string;
  father_educ: string;
  mother_name: string;
  mother_age: string;
  mother_occ: string;
  mother_educ: string;
  legal_guardian_name: string;
  legal_guardian_age: string;
  legal_guardian_occ: string;
  legal_guardian_educ: string;
}
export default function StudentForm({
  student,
  sections = [],
  parent = false,
  onSaved,
}: {
  student?: Student;
  sections?: Section[];
  parent?: boolean;
  onSaved: () => void;
}) {
  const fields = [
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
  const initial = Object.fromEntries(
    fields.map((key) => [key, String(student?.[key] ?? "")]),
  ) as unknown as StudentFields;
  initial.lrn_number = "";
  initial.section_id = String(
    student?.section_id || sections[0]?.section_id || "",
  );
  initial.gender ||= "Male";
  const { values, change, save } = useDurableForm(
    `student_${student?.student_id || "new"}`,
    initial,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const editable = !parent || student?.allow_parent_edit_student_info === true;
  const field = (
    key: keyof StudentFields,
    label: string,
    type = "text",
    readOnly = false,
  ) => (
    <Field
      key={key}
      label={label}
      type={type}
      value={values[key]}
      readOnly={readOnly || !editable}
      onChange={(e) => change({ ...values, [key]: e.target.value })}
      required={
        !parent && ["first_name", "last_name", "date_of_birth"].includes(key)
      }
      maxLength={
        key.endsWith("_educ")
          ? 20
          : key.endsWith("_occ")
            ? 50
            : key === "emergency_contact"
              ? 20
              : undefined
      }
      min={type === "number" ? 0 : undefined}
    />
  );
  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!editable || busy) return;
        setBusy(true);
        setError("");
        setMessage("");
        const data: Record<string, string | number | null> = {};
        for (const [key, value] of Object.entries(values)) {
          if (student && ["section_id", "lrn_number"].includes(key)) continue;
          if (
            !student &&
            (key.startsWith("father_") ||
              key.startsWith("mother_") ||
              key.startsWith("legal_guardian_"))
          )
            continue;
          if (
            parent &&
            [
              "first_name",
              "middle_name",
              "last_name",
              "date_of_birth",
              "gender",
            ].includes(key)
          )
            continue;
          data[key] = [
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
            data,
          );
          if (result === "saved") {
            setMessage("Student details saved.");
            onSaved();
          } else
            setMessage(
              "Saved on this device. We will retry when the connection returns.",
            );
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Notice tone="error">{error}</Notice>
      <Notice tone="success">{message}</Notice>
      {!editable && (
        <Notice>
          Student information is read-only. Your adviser has locked editing.
        </Notice>
      )}
      <div>
        <h3 className="mb-4 font-semibold">Student information</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("first_name", "First name", "text", parent)}
          {field("last_name", "Last name", "text", parent)}
          {field("middle_name", "Middle name", "text", parent)}
          {field("date_of_birth", "Date of birth", "date", parent)}
          <Select
            label="Gender"
            value={values.gender}
            disabled={parent}
            onChange={(e) => change({ ...values, gender: e.target.value })}
          >
            <option>Male</option>
            <option>Female</option>
          </Select>
          {student ? (
            <Field label="LRN" value={student.masked_lrn} readOnly />
          ) : (
            <>
              <Field
                label="LRN (12 digits)"
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
              <Select
                label="Section"
                required
                value={values.section_id}
                onChange={(e) =>
                  change({ ...values, section_id: e.target.value })
                }
              >
                <option value="">Select section</option>
                {sections.map((s) => (
                  <option value={s.section_id} key={s.section_id}>
                    {s.section_name}
                  </option>
                ))}
              </Select>
            </>
          )}
          {field("emergency_contact", "Emergency contact")}
          {field("address", "Home address")}
          <Select
            label="Handedness"
            value={values.handedness}
            disabled={!editable}
            onChange={(e) => change({ ...values, handedness: e.target.value })}
          >
            <option value="">Choose handedness</option>
            <option>Right</option>
            <option>Left</option>
          </Select>
          {field("num_of_siblings", "Number of siblings", "number")}
          {field("birth_order", "Birth order")}
        </div>
      </div>
      {student && (
        <div className="space-y-5">
          <h3 className="font-semibold">Family background & details</h3>
          {(["father", "mother", "legal_guardian"] as const).map((prefix) => (
            <fieldset key={prefix} className="rounded-xl bg-slate-50 p-4">
              <legend className="px-2 text-sm font-semibold capitalize">
                {prefix.replace(/_/g, " ")}
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                {field(`${prefix}_name`, "Full name")}
                {field(`${prefix}_age`, "Age", "number")}
                {field(`${prefix}_occ`, "Occupation")}
                {field(`${prefix}_educ`, "Educational attainment")}
              </div>
            </fieldset>
          ))}
        </div>
      )}
      <Button type="submit" disabled={busy || !editable}>
        {busy ? "Saving…" : student ? "Save changes" : "Add student"}
      </Button>
    </form>
  );
}
