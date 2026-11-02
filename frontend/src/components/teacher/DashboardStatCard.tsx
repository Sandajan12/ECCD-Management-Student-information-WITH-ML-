import type { ReactNode } from "react";

export interface DashboardStatCardProps {
  title: string;
  value: ReactNode;
  subtitle: string;
  icon: ReactNode;
  iconClassName: string;
  badgeClassName?: string;
  muted?: boolean;
}

export function DashboardStatCard({
  title,
  value,
  subtitle,
  icon,
  iconClassName,
  badgeClassName,
  muted = false,
}: DashboardStatCardProps) {
  return (
    <article
      aria-label={title}
      className="min-w-0 flex flex-col justify-between p-4 sm:p-5 rounded-2xl bg-white border border-slate-100 shadow-sm"
    >
      <div className="flex min-w-0 items-center justify-center gap-1.5">
        <span
          aria-hidden="true"
          className={`flex size-6 shrink-0 items-center justify-center rounded-xl p-1 [&>svg]:size-4! ${iconClassName}`}
        >
          {icon}
        </span>
        <h2
          title={title}
          className="line-clamp-2 min-w-0 text-center text-xs font-semibold leading-tight text-slate-500"
        >
          {title}
        </h2>
      </div>
      <div
        title={typeof value === "string" ? value : undefined}
        className={`my-1 line-clamp-2 min-w-0 break-words text-center tracking-tight ${muted ? "truncate text-[11px] font-normal text-slate-400" : "text-xl font-bold leading-6 text-slate-900 sm:text-2xl sm:leading-6 lg:text-base lg:leading-[1.125rem] xl:text-2xl xl:leading-6"}`}
      >
        {value}
      </div>
      <div className="flex h-6 min-w-0 shrink-0 items-center justify-center text-center">
        <span
          className={`min-w-0 truncate ${muted ? "text-[11px] font-normal text-slate-400" : "text-xs font-medium"} ${badgeClassName ? `rounded-full px-2 py-0.5 ${badgeClassName}` : muted ? "" : "text-slate-500"}`}
          title={subtitle}
        >
          {subtitle}
        </span>
      </div>
    </article>
  );
}
