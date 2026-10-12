export default function StatCard({
  title,
  value,
  subtitle,
  tone = "blue",
}: {
  title: string;
  value: string;
  subtitle?: string;
  tone?: "blue" | "green" | "orange" | "purple";
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    orange: "bg-orange-50 text-orange-700",
    purple: "bg-violet-50 text-violet-700",
  };
  return (
    <section className={`rounded-2xl p-5 shadow-sm ${colors[tone]}`}>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-3 break-words text-2xl font-bold">{value}</p>
      {subtitle && <p className="mt-2 text-xs opacity-80">{subtitle}</p>}
    </section>
  );
}
