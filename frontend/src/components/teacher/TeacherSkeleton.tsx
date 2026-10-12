interface TeacherSkeletonProps {
  cards?: number;
}
export default function TeacherSkeleton({ cards = 1 }: TeacherSkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading teacher records"
      className={`grid gap-4 ${cards > 1 ? "sm:grid-cols-2 legacy-md:grid-cols-4" : ""}`}
    >
      <span className="sr-only">Loading…</span>
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="card animate-pulse space-y-4">
          <div className="h-4 w-2/3 rounded-full bg-slate-100" />
          <div className="h-8 w-1/2 rounded-lg bg-slate-100" />
          <div className="h-3 w-full rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
