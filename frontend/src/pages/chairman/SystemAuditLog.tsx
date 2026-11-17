import { useCallback, useEffect, useState } from "react";
import { Stack } from "@mui/material";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import API, { errorMessage } from "../../services/api";
import { Field, Modal, Select } from "../../components/chairman/ui";
import Snackbar from "../../components/chairman/Snackbar";
import type { SnackbarMessage } from "../../components/chairman/Snackbar";
import Icon from "../../components/chairman/Icon";

interface AuditPayload {
  id?: number;
  log_id?: number;
  action?: string;
  action_type?: string;
  performed_by?: string;
  teacher_name?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  role?: string;
  metadata?: Record<string, string | number | null> | null;
  details: string | null;
  timestamp: string | null;
}
interface Audit {
  id: number;
  action: string;
  name: string;
  email: string;
  role: string;
  metadata: Record<string, string | number | null>;
  details: string | null;
  timestamp: string | null;
}
interface BadgeStyle {
  label: string;
  className: string;
}
type ActionCategory = "" | "sections" | "teachers" | "students" | "settings";
const actionCategories: { value: ActionCategory; label: string }[] = [
  { value: "", label: "All Actions" },
  { value: "sections", label: "Section Reassignments" },
  { value: "teachers", label: "Teacher Management" },
  { value: "students", label: "Student Records" },
  { value: "settings", label: "System Settings" },
];
const pageSize = 10;
const secondaryButton =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium whitespace-nowrap text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-40";

function actionCategory(action: string): ActionCategory {
  const key = action.toUpperCase().replace(/\s+/g, "_");
  if (key === "SECTION_HANDOVER_REASSIGNMENT") return "sections";
  if (key.includes("TEACHER")) return "teachers";
  if (/STUDENT|PARENT_(?:ASSESSMENT_SUBMITTED|LINK)|UNLINKED_PARENT/.test(key))
    return "students";
  if (
    /SETTINGS|ROLLOVER|REVERT_SCHOOL_YEAR|BACKUP|PARENT_ASSESSMENT_ACCESS/.test(
      key,
    )
  )
    return "settings";
  return "";
}

function exportCsv(rows: Audit[]): void {
  const cell = (value: string): string => {
    // Keep spreadsheet applications from interpreting user-entered names as formulas.
    const text = /^[\s\uFEFF]*[=+@-]/.test(value) ? `'${value}` : value;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const records = [
    ["Timestamp", "Actor", "Email", "Role", "Action", "Summary"],
    ...rows.map((row) => [
      date(row.timestamp),
      row.name,
      row.email,
      row.role,
      actionStyle(row.action).label,
      row.details ?? "",
    ]),
  ];
  const csv = records.map((record) => record.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const neutral = "bg-slate-50 text-slate-700 border-slate-200";
const account = {
  label: "Teacher Account",
  className: "bg-emerald-50 text-emerald-700 border-emerald-200",
};
const actions: Record<string, BadgeStyle> = {
  SECTION_HANDOVER_REASSIGNMENT: {
    label: "Section Reassignment",
    className: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  TEACHER_ARCHIVED: {
    label: "Teacher Archived",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  TEACHER_CREATED: account,
  TEACHER_RESTORED: account,
  PARENT_ASSESSMENT_SUBMITTED: {
    label: "Assessment Submitted",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
};
function actionStyle(action: string): BadgeStyle {
  return (
    actions[action] ?? {
      label: action
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase()),
      className: neutral,
    }
  );
}
function ActionBadge({ action }: { action: string }) {
  const style = actionStyle(action);
  return (
    <span
      className={`inline-flex max-w-full rounded-full border px-2 py-1 text-xs font-medium break-words ${style.className}`}
    >
      {style.label}
    </span>
  );
}
function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${neutral}`}
    >
      {role}
    </span>
  );
}
function mapAudit(row: AuditPayload): Audit {
  const role = row.role ?? "System";
  return {
    id: row.id ?? row.log_id ?? 0,
    action: row.action ?? row.action_type ?? "Unknown Action",
    name: row.actor_name || row.teacher_name || row.performed_by || "System",
    email: row.actor_email || "",
    role:
      (
        {
          "super-admin": "Super Admin",
          Chairman: "Super Admin",
          chairman: "Super Admin",
          admin: "Teacher",
          teacher: "Teacher",
          user: "Parent",
          parent: "Parent",
        } as Record<string, string>
      )[role] ?? role,
    metadata: row.metadata ?? {},
    details: row.details,
    timestamp: row.timestamp,
  };
}
function date(timestamp: string | null): string {
  if (!timestamp) return "Unavailable";
  const value = new Date(
    /(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp) ? timestamp : `${timestamp}Z`,
  );
  if (Number.isNaN(value.getTime())) return "Unavailable";
  return `${value.toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" })} • ${value.toLocaleTimeString("en-US", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: true })}`;
}
function SpecificDetails({ row }: { row: Audit }) {
  const details =
    row.details || "No specific details were recorded for this action.";
  const names = Object.entries(row.metadata)
    .filter(
      ([key, value]) =>
        /Name$/.test(key) && typeof value === "string" && value.length > 0,
    )
    .map(([, value]) => String(value));
  // Quoted names also cover readable historical entries. Render text safely.
  for (const match of details.matchAll(/"([^"\n]+)"/g)) names.push(match[1]);
  const pattern = [...new Set(names)]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  if (!pattern) return <>{details}</>;
  return (
    <>
      {details.split(new RegExp(`(${pattern})`, "g")).map((part, index) =>
        names.includes(part) ? (
          <strong key={index} className="font-semibold text-[#111827]">
            {part}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}

export default function SystemAuditLog() {
  const [rows, setRows] = useState<Audit[]>([]);
  const [search, setSearch] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [category, setCategory] = useState<ActionCategory>("");
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [notification, setNotification] = useState<SnackbarMessage | null>(
    null,
  );
  const dismiss = useCallback(() => setNotification(null), []);
  const [selected, setSelected] = useState<Audit | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void API.get<AuditPayload[]>("/api/analytics/logs", {
      signal: controller.signal,
    })
      .then((res) => setRows(res.data.map(mapAudit)))
      .catch((err: unknown) => {
        if (!controller.signal.aborted)
          setNotification({ severity: "error", message: errorMessage(err) });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  const query = search.trim().toLowerCase();
  const visible = rows.filter(
    (row) =>
      (!role || row.role === role) &&
      (!category || actionCategory(row.action) === category) &&
      [
        row.name,
        row.email,
        row.role,
        row.action,
        row.action.replace(/_/g, " "),
        actionStyle(row.action).label,
        row.details ?? "",
      ].some((value) => value.toLowerCase().includes(query)),
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const paginated = visible.slice(start, start + pageSize);
  return (
    <div className="chairman-page">
      <h1 className="chairman-page-title mb-4">System Audit Logs</h1>
      <section className="min-w-0 rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,.05)] sm:p-6">
        <Stack
          sx={{
            gap: 2,
            mb: 2,
          }}
        >
          <Stack
            sx={{
              gap: 2,
              minWidth: 0,
            }}
          >
            <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2 }}>
              <Field
                aria-label="Search audit log"
                placeholder="Search names, actions, or details"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                containerClassName="min-w-0 w-full flex-1"
                className="rounded-[32px] bg-[#F9FAFB]"
                endAdornment={<Icon name="Search" />}
              />
              <button
                type="button"
                className={secondaryButton}
                disabled={loading || !visible.length}
                onClick={() => exportCsv(visible)}
                title="Export all logs matching the current filters"
              >
                <Icon name="Download" className="size-4" />
                Export CSV
              </button>
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2 }}>
              <Select
                aria-label="Role filter"
                value={role}
                onChange={(event) => {
                  setRole(event.target.value);
                  setPage(1);
                }}
                floating={false}
                containerClassName="w-full legacy-sm:w-auto"
                className="rounded-xl bg-[#F9FAFB]"
              >
                <option value="">All Actors</option>
                <option value="Super Admin">Super Admin</option>
                <option value="Teacher">Teachers</option>
                <option value="Parent">Parents</option>
              </Select>
              <Select
                aria-label="Action filter"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value as ActionCategory);
                  setPage(1);
                }}
                floating={false}
                containerClassName="w-full legacy-sm:w-auto"
                className="rounded-xl bg-[#F9FAFB]"
              >
                {actionCategories.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Stack>
          </Stack>
        </Stack>
        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Audit log table"
        >
          <table
            className="w-full min-w-[53rem] table-fixed"
            aria-label="System audit logs"
            aria-busy={loading}
          >
            <colgroup>
              <col className="w-[9%]" />
              <col className="w-[22%]" />
              <col className="w-[17%]" />
              <col className="w-[41%]" />
              <col className="w-[11%]" />
            </colgroup>
            <thead className="bg-[#f3f4f6]">
              <tr>
                {["Timestamp", "Actor", "Action", "Summary", "Details"].map(
                  (title, index) => (
                    <th
                      scope="col"
                      key={title}
                      className={`border-0! py-4! text-xs! font-bold! text-[#6b7280]! ${index === 0 ? "rounded-l-lg px-2!" : index === 4 ? "rounded-r-lg px-2!" : "px-3!"}`}
                    >
                      {title}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {paginated.map((row) => (
                <tr
                  key={row.id}
                  className="transition-colors duration-200 hover:bg-[#f9fafb]"
                >
                  <td className="border-[#f3f4f6]! px-2! py-4! text-xs! text-[#4b5563]">
                    <time dateTime={row.timestamp ?? undefined}>
                      {date(row.timestamp)}
                    </time>
                  </td>
                  <td className="border-[#f3f4f6]! px-3! py-4!">
                    <Stack
                      direction="row"
                      sx={{ gap: 1, alignItems: "center", minWidth: 0 }}
                    >
                      <span
                        className="min-w-0 truncate font-semibold text-[#111827]"
                        title={row.name}
                      >
                        {row.name}
                      </span>
                      <RoleBadge role={row.role} />
                    </Stack>
                    {row.email && (
                      <div
                        className="mt-1 max-w-[200px] truncate text-xs text-gray-400"
                        title={row.email}
                      >
                        {row.email}
                      </div>
                    )}
                  </td>
                  <td className="border-[#f3f4f6]! px-3! py-4!">
                    <ActionBadge action={row.action} />
                  </td>
                  <td className="border-[#f3f4f6]! px-3! py-4! text-sm text-[#4b5563]">
                    <p
                      className="line-clamp-2 break-words leading-relaxed"
                      title={row.details ?? undefined}
                    >
                      {row.details || "No specific details recorded."}
                    </p>
                  </td>
                  <td className="border-[#f3f4f6]! px-2! py-4!">
                    <button
                      type="button"
                      className={secondaryButton}
                      onClick={() => setSelected(row)}
                      aria-label={`View ${actionStyle(row.action).label} details by ${row.name}`}
                    >
                      <VisibilityOutlinedIcon
                        sx={{ fontSize: "1rem", color: "#9ca3af" }}
                      />
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {!visible.length && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-12! text-center text-[#777]"
                    role="status"
                  >
                    {loading
                      ? "Loading audit logs…"
                      : "No audit logs found matching your search and filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Stack
          component="nav"
          aria-label="Audit log pagination"
          direction={{ xs: "column", sm: "row" }}
          sx={{
            gap: 2,
            mt: 3,
            pt: 3,
            borderTop: "1px solid #f3f4f6",
            justifyContent: "space-between",
            alignItems: { xs: "stretch", sm: "center" },
          }}
        >
          <p className="text-xs text-gray-500" role="status" aria-live="polite">
            Showing {visible.length ? start + 1 : 0} to{" "}
            {Math.min(start + pageSize, visible.length)} of {visible.length}{" "}
            logs
          </p>
          <Stack
            direction="row"
            sx={{
              gap: 1,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <button
              type="button"
              className={secondaryButton}
              disabled={currentPage === 1 || loading}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            <span
              className="text-xs whitespace-nowrap text-gray-500"
              aria-current="page"
            >
              Page {currentPage} of {pageCount}
            </span>
            <button
              type="button"
              className={secondaryButton}
              disabled={currentPage === pageCount || loading}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </Stack>
        </Stack>
      </section>
      <Snackbar notification={notification} onClose={dismiss} />
      {selected && (
        <Modal
          title="Audit Action Details"
          onClose={() => setSelected(null)}
          closeButton
          closeSmall
          closeClassName="text-[#9ca3af]"
          className="rounded-xl p-2"
          titleClassName="border-b border-black/12 [&_h2]:font-black [&_h2]:text-[#111827]"
          bodyClassName="pt-6 pb-6"
        >
          <Stack sx={{ gap: 3, minWidth: 0 }}>
            <Stack direction="row" sx={{ gap: 2, alignItems: "center" }}>
              <span
                aria-hidden="true"
                className="flex aspect-square shrink-0 items-center justify-center rounded-full bg-indigo-50 p-4 font-semibold text-indigo-700"
              >
                {selected.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="break-words font-semibold text-[#111827]">
                  {selected.name}
                </p>
                {selected.email && selected.email !== selected.name && (
                  <p className="my-1 break-all text-sm text-[#6b7280]">
                    {selected.email}
                  </p>
                )}
                <RoleBadge role={selected.role} />
              </div>
            </Stack>
            <Stack sx={{ gap: 2, fontSize: "0.875rem" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[#6b7280]">
                  Date &amp; Time
                </span>
                <span>{date(selected.timestamp)}</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[#6b7280]">
                  Action Type
                </span>
                <ActionBadge action={selected.action} />
              </div>
            </Stack>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-[#6b7280]">
                Specific Details
              </h3>
              <div className="rounded-xl bg-[#f9fafb] p-4 text-sm leading-relaxed whitespace-pre-wrap break-words text-[#4b5563]">
                <SpecificDetails row={selected} />
              </div>
            </div>
          </Stack>
        </Modal>
      )}
    </div>
  );
}
