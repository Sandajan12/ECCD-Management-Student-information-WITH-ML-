import { useEffect } from "react";
import { studentName } from "../../types";
import StudentForm from "../../components/StudentForm";
import {
  ChildSelector,
  LinkChild,
} from "../../components/parent/ChildSelection";
import { useChildren } from "../../hooks/useChildren";
import { Empty, Notice, PageHeader } from "../../components/ui";

export default function ChildManagement() {
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
