import { useCallback, useEffect, useState } from "react";
import API, { errorMessage } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useDurableForm } from "../utils/drafts";
import type { Student } from "../types";
import { studentName } from "../types";
import StudentForm from "../components/StudentForm";
import {
  Button,
  Empty,
  Field,
  Notice,
  PageHeader,
  Select,
} from "../components/ui";
export function useChildren() {
  const { user } = useAuth();
  const [children, setChildren] = useState<Student[]>([]);
  const [selected, setSelected] = useState<number>(
    () => Number(localStorage.getItem(`ames_child_${user?.id}`)) || 0,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const rows = (await API.get<Student[]>("/api/students/my-child")).data;
      setChildren(rows);
      setSelected((id) =>
        rows.some((s) => s.student_id === id) ? id : rows[0]?.student_id || 0,
      );
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const select = (id: number) => {
    localStorage.setItem(`ames_child_${user?.id}`, String(id));
    setSelected(id);
  };
  return {
    children,
    child: children.find((s) => s.student_id === selected),
    selected,
    select,
    refresh,
    error,
    loading,
  };
}
export function ChildSelector({
  children,
  selected,
  select,
}: {
  children: Student[];
  selected: number;
  select: (id: number) => void;
}) {
  return (
    <Select
      label="Select child"
      value={selected || ""}
      onChange={(e) => select(Number(e.target.value))}
    >
      {children.map((s) => (
        <option key={s.student_id} value={s.student_id}>
          {studentName(s)} • {s.masked_lrn}
        </option>
      ))}
    </Select>
  );
}
export function LinkChild({ onLinked }: { onLinked: () => void }) {
  const { values, change, save } = useDurableForm("link_child", {
    lrn_number: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const result = await save("/api/students/link", "post");
          setMessage(
            result === "saved"
              ? "Child linked successfully."
              : "Your request is saved for reconnection.",
          );
          if (result === "saved") onLinked();
        } catch (err) {
          setMessage(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm text-slate-500">
        Enter the 12-digit LRN provided by your child’s teacher to link their
        record.
      </p>
      <Notice>{message}</Notice>
      <Field
        label="Child’s LRN"
        inputMode="numeric"
        pattern="[0-9]{12}"
        maxLength={12}
        required
        value={values.lrn_number}
        onChange={(e) =>
          change({ lrn_number: e.target.value.replace(/\D/g, "") })
        }
      />
      <Button disabled={busy} type="submit">
        {busy ? "Linking…" : "Link child"}
      </Button>
    </form>
  );
}
export default function ChildrenWorkspace() {
  const { children, child, selected, select, refresh, error, loading } =
    useChildren();
  useEffect(() => {
    const handler = () => void refresh();
    window.addEventListener("ames-record-synced", handler);
    return () => window.removeEventListener("ames-record-synced", handler);
  }, [refresh]);
  return (
    <>
      <PageHeader
        title="Child Information"
        subtitle="Keep your child’s profile and family details up to date."
      />
      <Notice tone="error">{error}</Notice>
      <div className="grid gap-6 xl:grid-cols-[1fr_2fr]">
        <div className="card space-y-5">
          <ChildSelector
            children={children}
            selected={selected}
            select={select}
          />
          {child && (
            <>
              <div className="grid size-16 place-items-center rounded-full bg-blue-50 text-2xl font-bold text-blue-600">
                {child.first_name?.[0] || "♡"}
              </div>
              <h2 className="text-xl font-bold">{studentName(child)}</h2>
              <p className="text-sm text-slate-500">{child.masked_lrn}</p>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-slate-500">Section</dt>
                  <dd>{child.section_name || "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Adviser</dt>
                  <dd>
                    {[child.teacher_fname, child.teacher_lname]
                      .filter(Boolean)
                      .join(" ") || "Awaiting assignment"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">School year</dt>
                  <dd>{child.school_year}</dd>
                </div>
              </dl>
            </>
          )}
          <details
            className="rounded-xl bg-slate-50 p-4"
            open={!children.length}
          >
            <summary className="cursor-pointer text-sm font-semibold">
              Link another child
            </summary>
            <div className="mt-4">
              <LinkChild onLinked={() => void refresh()} />
            </div>
          </details>
        </div>
        <section className="card">
          {loading ? (
            <Empty>Loading child information…</Empty>
          ) : !child ? (
            <Empty>Link a child to view their information.</Empty>
          ) : !child.allow_parent_view_student_info ? (
            <Notice>
              Your adviser has locked student information. Contact the teacher
              to request access.
            </Notice>
          ) : (
            <StudentForm
              key={child.student_id}
              student={child}
              parent
              onSaved={() => void refresh()}
            />
          )}
        </section>
      </div>
    </>
  );
}
