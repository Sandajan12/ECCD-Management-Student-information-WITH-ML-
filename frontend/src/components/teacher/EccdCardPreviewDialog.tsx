import { useEffect, useState } from "react";
import { Alert, Button, CircularProgress, Modal } from "@mui/material";
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import Close from "@mui/icons-material/Close";
import api, { errorMessage } from "../../services/api";
import type { Student } from "../../types";
import EccdCardPreviewDocument from "./EccdCardPreviewDocument";

interface EccdCardPreviewDialogProps {
  students: Student[];
  initialStudentId: string;
  onClose: () => void;
}

interface CardPreviewResponse {
  student_id: number;
  html: string;
}

interface PreviewResult {
  studentId: string;
  html?: string;
  error?: string;
}

export default function EccdCardPreviewDialog({
  students,
  initialStudentId,
  onClose,
}: EccdCardPreviewDialogProps) {
  const [studentId, setStudentId] = useState<string>(initialStudentId);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [attempt, setAttempt] = useState<number>(0);
  const currentIndex = students.findIndex(
    (student) => String(student.student_id) === studentId,
  );
  const eligible = currentIndex >= 0;
  const isFirstStudent = currentIndex <= 0;
  const isLastStudent = !eligible || currentIndex >= students.length - 1;
  const current = eligible && result?.studentId === studentId ? result : null;

  function handlePrevStudent(): void {
    if (!isFirstStudent) {
      setStudentId(String(students[currentIndex - 1].student_id));
    }
  }

  function handleNextStudent(): void {
    if (!isLastStudent) {
      setStudentId(String(students[currentIndex + 1].student_id));
    }
  }

  useEffect(() => {
    if (!studentId || !eligible) return;
    const controller = new AbortController();
    void api
      .get<CardPreviewResponse>(`/api/eccd/card-preview/${studentId}`, {
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (!controller.signal.aborted) {
          setResult({ studentId, html: data.html });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setResult({ studentId, error: errorMessage(error) });
        }
      });
    return () => controller.abort();
  }, [studentId, eligible, attempt]);

  return (
    <Modal
      open
      onClose={onClose}
      className="flex items-center justify-center p-2 sm:p-4"
      slotProps={{
        backdrop: { className: "!bg-slate-900/50" },
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="eccd-card-preview-title"
        tabIndex={-1}
        className="relative mx-auto my-6 flex max-h-[92vh] w-[92vw] max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl outline-none"
      >
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-white px-4 py-3.5 sm:flex-nowrap sm:px-6">
          <div className="min-w-0 flex-1">
            <h2
              id="eccd-card-preview-title"
              className="text-lg font-bold tracking-tight text-slate-900"
            >
              Preview ECCD Card
            </h2>
          </div>
          <div className="order-last flex w-full min-w-0 items-center gap-2 sm:order-none sm:w-auto">
            <button
              type="button"
              onClick={handlePrevStudent}
              disabled={isFirstStudent}
              aria-label="Previous Student"
              title="Previous Student"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4! w-4!" />
            </button>
            <div className="min-w-0 flex-1 sm:w-64 sm:flex-none">
              <select
                aria-label="Select Student"
                value={eligible ? studentId : ""}
                onChange={(event) => setStudentId(event.target.value)}
                className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
              >
                <option value="" disabled>
                  Select Student
                </option>
                {students.map((student) => (
                  <option
                    key={student.student_id}
                    value={String(student.student_id)}
                  >
                    {student.first_name} {student.last_name} (
                    {student.masked_lrn})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleNextStudent}
              disabled={isLastStudent}
              aria-label="Next Student"
              title="Next Student"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4! w-4!" />
            </button>
          </div>
          <div
            aria-hidden="true"
            className="mx-1 hidden h-4 w-px bg-slate-200 sm:block"
          />
          <button
            type="button"
            aria-label="Close ECCD card preview"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <Close className="h-5! w-5!" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto bg-slate-100/70 p-4 sm:p-6">
          {!eligible && (
            <Alert severity="info">
              Select a student to preview their ECCD Card.
            </Alert>
          )}
          {eligible && !current && (
            <div
              role="status"
              className="flex items-center gap-3 py-6 text-slate-600"
            >
              <CircularProgress size={24} />
              <p>Loading ECCD Card...</p>
            </div>
          )}
          {current?.error && (
            <Alert
              severity="error"
              action={
                <Button
                  color="inherit"
                  onClick={() => {
                    setResult(null);
                    setAttempt((value) => value + 1);
                  }}
                >
                  Retry
                </Button>
              }
            >
              {current.error}
            </Alert>
          )}
          {current?.html && <EccdCardPreviewDocument html={current.html} />}
        </div>
        <footer className="flex shrink-0 justify-end border-t border-slate-100 p-4">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </footer>
      </div>
    </Modal>
  );
}
