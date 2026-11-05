import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import API, { isNetworkError } from "../services/api";
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
export function useDurableFile(resource: string) {
  const { user } = useAuth();
  const key = `ames_file_${user?.id}_${resource}`;
  const [file, setFile] = useState<File | null>(null);
  const revision = useRef("");
  useEffect(() => {
    let active = true;
    revision.current = "";
    setFile(null);
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
    window.dispatchEvent(new Event("ames-drafts-changed"));
    try {
      if (!navigator.onLine) return null;
      const res = await API.post<T>(path, multipart(record), {
        timeout: 120000,
      });
      if (res.status !== 200 && res.status !== 201)
        throw new Error("The server did not confirm this upload.");
      if ((res.data as { failedCount?: number }).failedCount) {
        if ((await readFile(key))?.revision === version)
          await writeFile(key, { ...record, is_pending_sync: false });
      } else await confirm(version);
      return res.data;
    } catch (error) {
      if (isNetworkError(error)) {
        return null;
      }
      if ((await readFile(key))?.revision === version)
        await writeFile(key, { ...record, is_pending_sync: false });
      throw error;
    } finally {
      window.dispatchEvent(new Event("ames-drafts-changed"));
    }
  };
  return { file, choose, confirm, revision, upload };
}
