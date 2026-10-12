import { useCallback, useEffect, useState } from "react";
import API, { errorMessage } from "../../services/api";
import { Field, Modal } from "../../components/chairman/ui";
import Snackbar from "../../components/chairman/Snackbar";
import type { SnackbarMessage } from "../../components/chairman/Snackbar";
import Icon from "../../components/chairman/Icon";
interface Audit {
  id: number;
  action: string;
  performed_by: string;
  details: string | null;
  timestamp: string | null;
}
interface AuditPayload {
  id: number;
  action: string;
  performed_by: string;
  details: string | null;
  timestamp: string | null;
}
interface LegacyAuditPayload {
  log_id: number;
  action_type: string;
  teacher_name: string | null;
  details: string | null;
  timestamp: string | null;
}
function mapAudit(row: AuditPayload | LegacyAuditPayload): Audit {
  return {
    id: "log_id" in row ? row.log_id : row.id,
    action: "action_type" in row ? row.action_type : row.action,
    performed_by:
      ("teacher_name" in row ? row.teacher_name : row.performed_by) ?? "System",
    details: row.details,
    timestamp: row.timestamp,
  };
}
export default function SystemAuditLog() {
  const [rows, setRows] = useState<Audit[]>([]);
  const [search, setSearch] = useState("");
  const [notification, setNotification] = useState<SnackbarMessage | null>(
    null,
  );
  const dismiss = useCallback(() => setNotification(null), []);
  const [selected, setSelected] = useState<Audit | null>(null);
  useEffect(() => {
    void API.get<(AuditPayload | LegacyAuditPayload)[]>("/api/analytics/logs")
      .then((res) => setRows(res.data.map(mapAudit)))
      .catch((err) =>
        setNotification({ severity: "error", message: errorMessage(err) }),
      );
  }, []);
  const visible = rows.filter(
    (r) =>
      r.action.toLowerCase().includes(search.toLowerCase()) ||
      r.performed_by.toLowerCase().includes(search.toLowerCase()),
  );
  const date = (timestamp: string | null) =>
    timestamp
      ? new Date(timestamp).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
  return (
    <div className="p-6">
      <section className="mx-auto min-h-[80vh] max-w-[1200px] rounded-2xl bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,.05)] legacy-md:p-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-black leading-[1.334] text-[#111827]">
            System Audit Logs
          </h1>
          <Field
            aria-label="Search audit log"
            placeholder="Enter search Logs by (Name or Action Type)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            containerClassName="w-full legacy-sm:w-[350px]"
            className="rounded-[32px] bg-[#F9FAFB]"
            endAdornment={<Icon name="Search" />}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px]">
            <thead className="bg-[#f3f4f6]">
              <tr>
                {["Timestamp", "Fullname", "Action Type"].map((title, i) => (
                  <th
                    key={title}
                    className={`border-0! py-4! font-bold! text-[#6b7280]! ${i === 0 ? "w-[30%] rounded-l-lg" : i === 1 ? "w-[40%]" : "w-[30%] rounded-r-lg"}`}
                  >
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer transition-colors duration-200 hover:bg-[#f9fafb]"
                  onClick={() => setSelected(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(row);
                    }
                  }}
                  tabIndex={0}
                  aria-label={`View ${row.action}`}
                >
                  <td className="border-[#f3f4f6]! py-6! font-bold! text-[#111827]">
                    {date(row.timestamp)}
                  </td>
                  <td className="border-[#f3f4f6]! py-6! font-bold! text-[#111827]">
                    {row.performed_by}
                  </td>
                  <td className="border-[#f3f4f6]! py-6! font-bold! text-[#111827]">
                    {row.action}
                  </td>
                </tr>
              ))}
              {!visible.length && (
                <tr>
                  <td colSpan={3} className="py-12! text-center text-[#777]">
                    No audit logs found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
          <div className="flex flex-col gap-4 text-sm leading-[1.43]">
            {[
              ["Action Taken By", selected.performed_by],
              ["Date & Time", date(selected.timestamp)],
              ["Action Type", selected.action],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <span className="font-bold text-[#777]">{label}:</span>
                <span
                  className={`min-w-0 break-words text-right font-bold ${label === "Action Type" ? "text-brand" : "text-[#111827]"}`}
                >
                  {value}
                </span>
              </div>
            ))}
            <div className="mt-4">
              <p className="mb-2 text-xs font-bold leading-[1.66] text-[#777]">
                SPECIFIC DETAILS:
              </p>
              <div className="rounded-lg border border-[#f3f4f6] bg-[#f9fafb] p-4 text-sm leading-[1.6] whitespace-pre-wrap text-[#4b5563]">
                {selected.details ||
                  "No specific details were recorded for this action."}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
