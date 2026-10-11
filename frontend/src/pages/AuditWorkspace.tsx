import { useEffect, useState } from "react";
import API, { errorMessage } from "../services/api";
import { Empty, Field, Modal, Notice, PageHeader } from "../components/ui";
interface Audit {
  id: number;
  action: string;
  performed_by: string;
  details: string | null;
  timestamp: string | null;
}
export default function AuditWorkspace() {
  const [rows, setRows] = useState<Audit[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Audit | null>(null);
  useEffect(() => {
    void API.get<Audit[]>("/api/analytics/logs")
      .then((res) => setRows(res.data))
      .catch((err) => setError(errorMessage(err)));
  }, []);
  const visible = rows.filter((r) =>
    `${r.action} ${r.performed_by} ${r.details}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        title="System Audit Log"
        subtitle="Review the latest 100 recorded school operations."
      />
      <Notice tone="error">{error}</Notice>
      <div className="card mt-5">
        <Field
          label="Search audit log"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="mt-5 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th>Action</th>
                <th>Performed by</th>
                <th>Date & time</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td>
                    <button
                      className="font-medium text-blue-700"
                      onClick={() => setSelected(row)}
                    >
                      {row.action}
                    </button>
                  </td>
                  <td>{row.performed_by}</td>
                  <td className="whitespace-nowrap">
                    {row.timestamp
                      ? new Date(row.timestamp).toLocaleString()
                      : "—"}
                  </td>
                  <td className="max-w-xs truncate">{row.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && <Empty>No matching activity.</Empty>}
        </div>
      </div>
      {selected && (
        <Modal title="Activity Details" onClose={() => setSelected(null)}>
          <p className="font-semibold">{selected.action}</p>
          <p className="text-sm text-slate-500">
            {selected.performed_by} •{" "}
            {selected.timestamp &&
              new Date(selected.timestamp).toLocaleString()}
          </p>
          <p className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 text-sm leading-7">
            {selected.details}
          </p>
        </Modal>
      )}
    </>
  );
}
