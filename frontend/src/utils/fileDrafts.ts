import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import API, { errorMessage, isNetworkError } from "../services/api";
interface StoredFile {
  file: File;
  revision: string;
  is_pending_sync?: boolean;
  request?: { path: string; fields: Record<string, string> };
  error?: string;
}
async function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ames-form-files", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function readFile(key: string): Promise<StoredFile | null> {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("files").objectStore("files").get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
async function writeFile(key: string, value: StoredFile): Promise<void> {
  const db = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function confirmStoredFile(key: string, version: string): Promise<void> {
  const db = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      const store = tx.objectStore("files");
      const request = store.get(key);
      request.onsuccess = () => {
        if (request.result?.revision === version) store.delete(key);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function pendingFiles(
  owner: number,
): Promise<{ key: string; record: StoredFile }[]> {
  const db = await openStore();
  try {
    const rows = await new Promise<{
      keys: IDBValidKey[];
      records: StoredFile[];
    }>((resolve, reject) => {
      const tx = db.transaction("files");
      const store = tx.objectStore("files");
      const keys = store.getAllKeys();
      const records = store.getAll();
      tx.oncomplete = () =>
        resolve({ keys: keys.result, records: records.result });
      tx.onerror = () => reject(tx.error);
    });
    return rows.keys.flatMap((key, index) =>
      String(key).startsWith(`ames_file_${owner}_`) &&
      rows.records[index].is_pending_sync
        ? [{ key: String(key), record: rows.records[index] }]
        : [],
    );
  } finally {
    db.close();
  }
}
function multipart(record: StoredFile): FormData {
  const data = new FormData();
  data.append("file", record.file);
  for (const [key, value] of Object.entries(record.request?.fields || {}))
    data.append(key, value);
  return data;
}
let syncingFiles = false;
export async function syncFiles(owner: number): Promise<void> {
  if (syncingFiles || !navigator.onLine) return;
  syncingFiles = true;
  try {
    for (const { key, record } of await pendingFiles(owner)) {
      const user = JSON.parse(localStorage.getItem("user") || "null") as {
        id?: number;
      } | null;
      if (user?.id !== owner || !localStorage.getItem("token")) break;
      if (
        !record.request ||
        ![
          "/api/teachers/import-students",
          "/api/settings/upload-background",
        ].includes(record.request.path)
      )
        continue;
      if ((await readFile(key))?.revision !== record.revision) continue;
      try {
        const res = await API.post<{ failedCount?: number }>(
          record.request.path,
          multipart(record),
          { timeout: 120000 },
        );
        if (res.status === 200 || res.status === 201) {
          if (res.data.failedCount)
            await writeFile(key, {
              ...record,
              is_pending_sync: false,
              error:
                "Some spreadsheet rows need correction. Open Import Excel to review and retry.",
            });
          else await confirmStoredFile(key, record.revision);
          window.dispatchEvent(
            new CustomEvent("ames-record-synced", { detail: key }),
          );
        }
      } catch (error) {
        if ((await readFile(key))?.revision === record.revision)
          await writeFile(key, { ...record, error: errorMessage(error) });
        if (isNetworkError(error)) break;
      }
    }
  } finally {
    syncingFiles = false;
    window.dispatchEvent(new Event("ames-drafts-changed"));
  }
}
export function useDurableFile(resource: string) {
  const { user } = useAuth();
  const key = `ames_file_${user?.id}_${resource}`;
  const [file, setFile] = useState<File | null>(null);
  const revision = useRef("");
  useEffect(() => {
    let active = true;
    void readFile(key)
      .then((record) => {
        if (active && record && !revision.current) {
          revision.current = record.revision;
          setFile(record.file);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [key]);
  const choose = useCallback(
    (next: File | null) => {
      if (!next) return;
      const version = crypto.randomUUID();
      revision.current = version;
      setFile(next);
      void writeFile(key, { file: next, revision: version }).catch(() =>
        window.dispatchEvent(
          new CustomEvent("ames-draft-error", {
            detail:
              "This file could not be saved on the device. Keep this page open until the upload succeeds.",
          }),
        ),
      );
    },
    [key],
  );
  const confirm = useCallback(
    async (version: string) => {
      await confirmStoredFile(key, version);
      if (revision.current === version) {
        revision.current = "";
        setFile(null);
      }
    },
    [key],
  );
  useEffect(() => {
    const synced = (event: Event) => {
      if ((event as CustomEvent<string>).detail === key)
        void readFile(key).then((record) => {
          if (!record) {
            revision.current = "";
            setFile(null);
          }
        });
    };
    window.addEventListener("ames-record-synced", synced);
    return () => window.removeEventListener("ames-record-synced", synced);
  }, [key]);
  const upload = async <T>(
    path: string,
    fields: Record<string, string> = {},
  ): Promise<T | null> => {
    if (!file) throw new Error("Select a file first.");
    const version = revision.current;
    const record: StoredFile = {
      file,
      revision: version,
      is_pending_sync: true,
      request: { path, fields },
    };
    await writeFile(key, record);
    try {
      const res = await API.post<T>(path, multipart(record), {
        timeout: 120000,
      });
      if ((res.data as { failedCount?: number }).failedCount)
        await writeFile(key, { ...record, is_pending_sync: false });
      else await confirm(version);
      return res.data;
    } catch (error) {
      if (isNetworkError(error)) {
        window.dispatchEvent(new Event("ames-drafts-changed"));
        return null;
      }
      if ((await readFile(key))?.revision === version)
        await writeFile(key, { ...record, is_pending_sync: false });
      throw error;
    }
  };
  return { file, choose, confirm, revision, upload };
}
