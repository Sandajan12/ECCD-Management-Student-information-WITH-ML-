// Visual source: legacy pages/chairman/StudentRecords.jsx.
import { useCallback, useEffect, useRef, useState } from "react";
import { useSettings } from "../../context/SettingsContext";
import type { ReactNode } from "react";
import API, { downloadFile, errorMessage } from "../../services/api";
import type { Section, Student } from "../../types";
import { studentName } from "../../types";
import { useDurableForm } from "../../utils/drafts";
import { calculateRosterAge, formatDisplayDate } from "../../utils/dateUtils";
import Snackbar from "../../components/chairman/Snackbar";
import type { SnackbarMessage } from "../../components/chairman/Snackbar";
import {
  Button,
  Checkbox,
  Field,
  Modal,
  Select,
} from "../../components/chairman/ui";
import Icon from "../../components/chairman/Icon";
interface InfoRowProps {
  label: string;
  value: ReactNode;
}
function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="mb-3 flex flex-col gap-1 text-[14.4px] leading-[1.5] legacy-sm:flex-row legacy-sm:gap-0">
      <span className="shrink-0 font-bold text-[#4b5563] legacy-sm:basis-[140px]">
        {label}:
      </span>
      <span className="min-w-0 flex-1 break-words text-[#111827]">
        {value === null || value === undefined || value === "" ? "N/A" : value}
      </span>
    </div>
  );
}
interface TransferProps {
  ids: number[];
  sections: Section[];
  onClose: () => void;
  onSaved: () => void;
}
function TransferStudents({ ids, sections, onClose, onSaved }: TransferProps) {
  const { values, change, save, key } = useDurableForm(
    `student_transfer_${[...ids].sort((a, b) => a - b).join("_")}`,
    { new_section_id: String(sections[0]?.section_id || "") },
  );
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [notification, setNotification] = useState<SnackbarMessage | null>(
    null,
  );
  const dismiss = useCallback(() => setNotification(null), []);
  useEffect(() => {
    const synced = (event: Event) => {
      if ((event as CustomEvent<string>).detail === key) onSaved();
    };
    window.addEventListener("ames-record-synced", synced);
    return () => window.removeEventListener("ames-record-synced", synced);
  }, [key, onSaved]);
  const submit = async () => {
    if (
      saving.current ||
      !ids.length ||
      !sections.some((s) => String(s.section_id) === values.new_section_id)
    )
      return;
    saving.current = true;
    setBusy(true);
    try {
      const result = await save("/api/chairman/students/transfer", "put", {
        student_ids: ids,
        new_section_id: Number(values.new_section_id),
      });
      if (result === "saved") onSaved();
      else
        setNotification({
          severity: "info",
          message:
            "Transfer saved on this device. It will synchronize after reconnection.",
        });
    } catch (err) {
      setNotification({ severity: "error", message: errorMessage(err) });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      size="xs"
      title="Transfer Students"
      footerClassName="p-4 pt-0"
      className="rounded-xl"
      titleClassName="bg-[#4f46e5] text-white [&_h2]:font-bold"
      bodyClassName="px-6 pt-0 pb-6"
      closeButton
      locked={busy}
      onClose={onClose}
      footer={
        <>
          <Button
            variant="text"
            className="px-2! text-[#6b7280]"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="bg-[#4f46e5] font-bold"
            disabled={
              busy ||
              !sections.some(
                (s) => String(s.section_id) === values.new_section_id,
              )
            }
            onClick={() => void submit()}
          >
            {busy ? "Transferring..." : "Confirm Transfer"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col">
        <p className="mb-4 text-sm leading-[1.43] text-[#374151]">
          You have selected <strong>{ids.length}</strong> student(s) to
          transfer. Select the destination section:
        </p>
        <Select
          label="Destination Section"
          containerClassName="mt-2"
          value={values.new_section_id}
          disabled={busy}
          onChange={(e) => change({ new_section_id: e.target.value })}
        >
          {sections.map((section) => (
            <option key={section.section_id} value={section.section_id}>
              {section.section_name}{" "}
              {section.first_name
                ? `(Adviser: ${section.first_name} ${section.last_name || ""})`
                : "(No Adviser)"}
            </option>
          ))}
        </Select>
      </div>
      <Snackbar notification={notification} onClose={dismiss} />
    </Modal>
  );
}
export default function StudentRecords() {
  const { settings } = useSettings();
  const rosterAge = (record: Student): string => {
    const age = calculateRosterAge(
      record.date_of_birth,
      record.school_year || settings.current_school_year,
      settings.school_year_start_month || 8,
    );
    return age !== "N/A"
      ? age
      : record.decimal_age
        ? `${record.decimal_age} yrs`
        : "N/A";
  };
  const [students, setStudents] = useState<Student[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("All");
  const [year, setYear] = useState("All");
  const [selected, setSelected] = useState<number[]>([]);
  const [student, setStudent] = useState<Student | null>(null);
  const [transfer, setTransfer] = useState(false);
  const [download, setDownload] = useState(false);
  const downloadForm = useDurableForm("chairman_eccd_export", {
    section: "All Sections",
  });
  const [busy, setBusy] = useState(false);
  const exporting = useRef(false);
  const [notification, setNotification] = useState<SnackbarMessage | null>(
    null,
  );
  const dismiss = useCallback(() => setNotification(null), []);
  const refresh = useCallback(async () => {
    try {
      const [rows, secs] = await Promise.all([
        API.get<Student[]>("/api/chairman/students"),
        API.get<Section[]>("/api/chairman/sections"),
      ]);
      setStudents(rows.data);
      setSections(secs.data);
    } catch (err) {
      setNotification({ severity: "error", message: errorMessage(err) });
    }
  }, []);
  useEffect(() => {
    void refresh();
    const synced = () => void refresh();
    window.addEventListener("ames-record-synced", synced);
    return () => window.removeEventListener("ames-record-synced", synced);
  }, [refresh]);
  const visible = students.filter(
    (s) =>
      s.is_active &&
      (section === "All" || s.section_name === section) &&
      (year === "All" || s.school_year === year) &&
      `${studentName(s)} ${s.masked_lrn}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const years = [
    ...new Set(
      students
        .map((s) => s.school_year)
        .filter((value): value is string => !!value),
    ),
  ];
  const rosterSections = [
    ...new Set(
      students
        .map((s) => s.section_name)
        .filter((name): name is string => !!name),
    ),
  ];
  // Older scoped export drafts stored section IDs; resolve them without discarding the draft.
  const exportSection =
    downloadForm.values.section === "All"
      ? "All Sections"
      : (sections.find(
          (s) => String(s.section_id) === downloadForm.values.section,
        )?.section_name ?? downloadForm.values.section);
  // Filters preserve selected IDs, as in the reference. The header describes
  // only the visible rows, even when the selection also contains hidden rows.
  const visibleSelectedCount = visible.filter((s) =>
    selected.includes(s.student_id),
  ).length;
  const allSelected =
    visible.length > 0 && visibleSelectedCount === visible.length;
  const toggleAll = (checked: boolean) =>
    setSelected(checked ? visible.map((s) => s.student_id) : []);
  const openStudent = async (id: number) => {
    try {
      setStudent((await API.get<Student>(`/api/students/${id}`)).data);
    } catch (err) {
      setNotification({ severity: "error", message: errorMessage(err) });
    }
  };
  const heading = (text: string) => (
    <h3 className="mb-4 border-b border-[#e5e7eb] pb-2 text-base font-bold leading-[1.75] text-brand">
      {text}
    </h3>
  );
  return (
    <div className="mx-auto max-w-[1200px] p-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold leading-[1.334] text-[#111827]">
          Enrolled Students
        </h1>
        <div className="flex flex-wrap gap-4">
          <Button
            className="bg-[#4f46e5] font-bold"
            disabled={!selected.length}
            onClick={() => setTransfer(true)}
          >
            Transfer Selected {selected.length ? `(${selected.length})` : ""}
          </Button>
          <Button
            className="bg-brand font-bold"
            onClick={() => setDownload(true)}
          >
            Download ECCD Records
          </Button>
        </div>
      </div>
      {!download && <Snackbar notification={notification} onClose={dismiss} />}
      <div className="mb-8 flex flex-col items-stretch gap-4 rounded-lg bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,.1)] legacy-md:flex-row legacy-md:items-center">
        <Field
          aria-label="Search students"
          placeholder="Enter search Records by (LRN or Name)"
          containerClassName="flex-1"
          className="rounded-lg bg-[#f9fafb]"
          adornment={<Icon name="Search" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          aria-label="Section"
          className="rounded-lg bg-[#f9fafb]"
          containerClassName="legacy-md:min-w-[200px]"
          value={section}
          onChange={(e) => {
            setSection(e.target.value);
          }}
        >
          <option value="All">All Sections</option>
          {rosterSections.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="School year"
          className="rounded-lg bg-[#f9fafb]"
          containerClassName="legacy-md:min-w-[200px]"
          value={year}
          onChange={(e) => {
            setYear(e.target.value);
          }}
        >
          <option value="All">All School Years</option>
          {years.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </Select>
      </div>
      <div className="overflow-x-auto rounded-lg bg-white shadow-[0_4px_6px_rgba(0,0,0,.05)]">
        <table className="w-full min-w-[650px]">
          <thead className="bg-[#f3f4f6]">
            <tr>
              <th className="w-12 pl-1! pr-0! py-0! text-left!">
                <Checkbox
                  aria-label="Select all visible students"
                  type="checkbox"

                  checked={allSelected}
                  indeterminate={
                    visibleSelectedCount > 0 &&
                    visibleSelectedCount < visible.length
                  }
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>
              {["LRN ID", "Full Name", "Class Name", "School Year"].map(
                (label) => (
                  <th key={label} className="font-bold! text-[#4b5563]!">
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <tr
                key={s.student_id}
                tabIndex={0}
                className={`cursor-pointer hover:bg-[#f3f4f6] [&:last-child>td]:border-0 ${selected.includes(s.student_id) ? "bg-[#4543c0]/[.08]" : ""}`}
                onClick={() => void openStudent(s.student_id)}
                onKeyDown={(event) => {
                  if (
                    event.target === event.currentTarget &&
                    event.key === "Enter"
                  )
                    void openStudent(s.student_id);
                }}
              >
                <td
                  className="pl-1! pr-0! py-0! text-left"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Checkbox
                    type="checkbox"

                    aria-label={`Select ${studentName(s)}`}
                    checked={selected.includes(s.student_id)}
                    onChange={(e) =>
                      setSelected((previous) =>
                        e.target.checked
                          ? [...previous, s.student_id]
                          : previous.filter((id) => id !== s.student_id),
                      )
                    }
                  />
                </td>
                <td className="font-medium! text-[#111827]">{s.masked_lrn}</td>
                <td className="text-[#374151]">{studentName(s)}</td>
                <td className="text-[#374151]">
                  {s.section_name || "Unassigned"}
                </td>
                <td className="text-[#374151]">{s.school_year || "N/A"}</td>
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={5} className="py-6! text-center text-[#6b7280]">
                  No student records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {student && (
        <Modal
          title="Student Record Details"
          footerClassName="p-6 pt-0"
          className="rounded-xl"
          titleClassName="bg-brand text-white [&_h2]:font-bold"
          bodyClassName="px-8! pt-0! pb-8"
          closeButton
          onClose={() => setStudent(null)}
          footer={
            <Button className="bg-brand" onClick={() => setStudent(null)}>
              Close
            </Button>
          }
        >
          <div className="grid gap-6">
            <section>
              {heading("Academic Information")}
              <InfoRow label="LRN Number" value={student.masked_lrn} />
              <InfoRow label="Class Section" value={student.section_name} />
              <InfoRow label="School Year" value={student.school_year} />
            </section>
            <section>
              {heading("Personal Details")}
              <InfoRow label="Full Name" value={studentName(student)} />
              <InfoRow label="Gender" value={student.gender} />
              <InfoRow
                label="Date of Birth"
                value={formatDisplayDate(student.date_of_birth)}
              />
              <InfoRow label="Age" value={rosterAge(student)} />
              <InfoRow label="Handedness" value={student.handedness} />
              <InfoRow label="Birth Order" value={student.birth_order} />
              <InfoRow label="Siblings Count" value={student.num_of_siblings} />
              <InfoRow label="Address" value={student.address} />
            </section>
            <section>
              {heading("Family Background")}
              {student.parents.length ? (
                student.parents.map((parent, index) => (
                  <div
                    key={index}
                    className="mb-6 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-4"
                  >
                    <h4 className="mb-2 text-[13.6px] font-bold leading-[1.75] text-[#111827] uppercase">
                      {parent.relationship || "Guardian"} Information
                    </h4>
                    <InfoRow label="Full Name" value={parent.fullname} />
                    <InfoRow label="Age" value={parent.age} />
                    <InfoRow label="Occupation" value={parent.occupation} />
                    <InfoRow
                      label="Highest Education"
                      value={parent.educational_attainment}
                    />
                  </div>
                ))
              ) : (
                <p className="mb-4 text-base text-[#6b7280] italic">
                  No family records linked yet.
                </p>
              )}
              <div className="mt-4">
                <InfoRow
                  label="Emergency Contact"
                  value={student.emergency_contact}
                />
              </div>
            </section>
          </div>
        </Modal>
      )}
      {download && (
        <Modal
          title="Download ECCD Records"
          footerClassName="p-6 pt-0"
          size="xs"
          className="rounded-xl"
          titleClassName="bg-brand text-white [&_h2]:font-bold"
          bodyClassName="px-8! pt-0! pb-8"
          closeButton
          locked={busy}
          onClose={() => setDownload(false)}
          footer={
            <>
              <Button
                variant="text"
                className="px-2! text-[#6b7280]"
                disabled={busy}
                onClick={() => setDownload(false)}
              >
                Cancel
              </Button>
              <Button
                className="min-w-[110px] bg-brand"
                disabled={busy}
                onClick={async () => {
                  if (exporting.current) return;
                  if (
                    exportSection !== "All Sections" &&
                    !rosterSections.includes(exportSection)
                  ) {
                    setNotification({
                      severity: "error",
                      message:
                        "Select an available section before downloading.",
                    });
                    return;
                  }
                  exporting.current = true;
                  setBusy(true);
                  try {
                    const currentYear = new Date().getFullYear();
                    const fallback =
                      exportSection === "All Sections"
                        ? `ALL_SECTIONS_${currentYear}-${currentYear + 1}.zip`
                        : `${exportSection.replace(/[^a-zA-Z0-9-_]/g, "_").toUpperCase()}_${currentYear}-${currentYear + 1}.xlsx`;
                    // Legacy export scope is independent of the roster year filter.
                    // The API validates sections and splits oversized cohorts.
                    const filename = await downloadFile(
                      `/api/chairman/export-eccd?${new URLSearchParams({ section: exportSection })}`,
                      fallback,
                    );
                    setDownload(false);
                    setNotification({
                      severity: "success",
                      message: `Successfully downloaded ${filename}`,
                    });
                  } catch (err) {
                    setNotification({
                      severity: "error",
                      message: errorMessage(err),
                    });
                  } finally {
                    exporting.current = false;
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Exporting..." : "Download"}
              </Button>
            </>
          }
        >
          <p className="mb-4 text-base leading-[1.5] text-[#374151]">
            Select a section to download its ECCD records as an Excel file.
            Select "All Sections" to download a ZIP archive containing all
            sections.
          </p>
          <Select
            small={false}
            aria-label="Download section"
            className="rounded-lg bg-[#f9fafb]"
            value={exportSection}
            disabled={busy}
            onChange={(e) => downloadForm.change({ section: e.target.value })}
          >
            <option value="All Sections">All Sections</option>
            {rosterSections.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
          <Snackbar notification={notification} onClose={dismiss} />
        </Modal>
      )}
      {transfer && (
        <TransferStudents
          ids={selected}
          sections={sections}
          onClose={() => setTransfer(false)}
          onSaved={() => {
            setTransfer(false);
            setSelected([]);
            setNotification({
              severity: "success",
              message: "Students transferred successfully!",
            });
            void refresh();
          }}
        />
      )}
    </div>
  );
}
