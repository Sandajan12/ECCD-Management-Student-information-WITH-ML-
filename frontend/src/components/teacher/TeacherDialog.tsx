import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

interface TeacherDialogProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  locked?: boolean;
  wide?: boolean;
}
export default function TeacherDialog({
  title,
  children,
  onClose,
  locked = false,
  wide = false,
}: TeacherDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      className={`teacher-dialog ${wide ? "max-w-6xl bg-slate-50" : "max-w-xl bg-white"}`}
      onCancel={(e) => {
        e.preventDefault();
        if (!locked) onClose();
      }}
    >
      <header className="flex items-center justify-between gap-4 px-6 pt-6 pb-3">
        <h2 id={id} className="text-xl font-extrabold text-slate-900">
          {title}
        </h2>
        <button
          type="button"
          aria-label="Close dialog"
          disabled={locked}
          onClick={onClose}
          className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
        >
          ✕
        </button>
      </header>
      <div className="space-y-5 p-5 sm:p-6">{children}</div>
    </dialog>
  );
}
