import { useEffect, useId, useRef } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
export function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <label
      className="block min-w-0 space-y-1.5 text-sm font-medium text-slate-600"
      htmlFor={id}
    >
      <span>{label}</span>
      <input id={id} className="field" {...props} />
    </label>
  );
}
export function Select({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId();
  return (
    <label
      className="block min-w-0 space-y-1.5 text-sm font-medium text-slate-600"
      htmlFor={id}
    >
      <span>{label}</span>
      <select id={id} className="field" {...props}>
        {children}
      </select>
    </label>
  );
}
export function TextArea({
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const id = useId();
  return (
    <label
      className="block space-y-1.5 text-sm font-medium text-slate-600"
      htmlFor={id}
    >
      <span>{label}</span>
      <textarea id={id} className="field" rows={3} {...props} />
    </label>
  );
}
export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "error" | "success";
}) {
  if (!children) return null;
  const styles = {
    info: "bg-blue-50 text-blue-800",
    error: "bg-red-50 text-red-800",
    success: "bg-emerald-50 text-emerald-800",
  };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl p-4 text-sm leading-relaxed ${styles[tone]}`}
    >
      {children}
    </div>
  );
}
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm leading-7 text-slate-500">
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <p role="status" className="py-6 text-sm text-slate-500">
      Loading your records…
    </p>
  );
}
export function Progress({ value }: { value: number | null }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }}
        />
      </div>
      <span className="text-xs text-slate-500">
        {value === null ? "Pending" : `${value}%`}
      </span>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  locked = false,
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  locked?: boolean;
}) {
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
      onCancel={(e) => {
        if (locked) e.preventDefault();
        else onClose?.();
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl bg-white p-0 shadow-xl backdrop:bg-slate-950/50 backdrop:backdrop-blur-sm"
    >
      <header className="flex items-center justify-between gap-4 bg-brand px-6 py-4 text-white">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {!locked && (
          <button
            aria-label="Close dialog"
            className="rounded-lg p-2 hover:bg-white/15"
            onClick={onClose}
          >
            ✕
          </button>
        )}
      </header>
      <div className="space-y-5 p-5 sm:p-6">{children}</div>
    </dialog>
  );
}
