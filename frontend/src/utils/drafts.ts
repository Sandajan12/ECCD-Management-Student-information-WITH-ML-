import { useCallback, useEffect, useState } from "react";
import API, { errorMessage, isNetworkError } from "../services/api";
import { useAuth } from "../context/AuthContext";

export interface Draft<T> {
  owner_id: number;
  values: T;
  revision: string;
  is_pending_sync: boolean;
  request?: { path: string; method: "post" | "put"; data: unknown };
  error?: string;
}
export function readDraft<T>(key: string): Draft<T> | null {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") as Draft<T> | null;
  } catch {
    return null;
  }
}
export function storeDraft<T>(key: string, draft: Draft<T>): void {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
    window.dispatchEvent(new Event("ames-drafts-changed"));
  } catch {
    window.dispatchEvent(
      new CustomEvent("ames-draft-error", {
        detail:
          "Device storage is full or unavailable. Keep this page open until your changes are saved.",
      }),
    );
  }
}
export function confirmDraft(key: string, revision: string): void {
  if (readDraft<unknown>(key)?.revision === revision) {
    localStorage.removeItem(key);
    window.dispatchEvent(new Event("ames-drafts-changed"));
  }
}
export function listPending(
  owner: number,
): { key: string; draft: Draft<unknown> }[] {
  const items: { key: string; draft: Draft<unknown> }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (
      !key ||
      (!key.startsWith("ames_draft_") && !key.startsWith("eccd_draft_"))
    )
      continue;
    const draft = readDraft<unknown>(key);
    if (draft?.owner_id === owner && draft.is_pending_sync && draft.request)
      items.push({ key, draft });
  }
  return items;
}
let syncing = false;
export async function syncDrafts(owner: number): Promise<void> {
  if (syncing || !navigator.onLine) return;
  syncing = true;
  try {
    for (const { key, draft } of listPending(owner)) {
      const session = JSON.parse(localStorage.getItem("user") || "null") as {
        id?: number;
      } | null;
      if (session?.id !== owner || !localStorage.getItem("token")) break;
      if (readDraft<unknown>(key)?.revision !== draft.revision) continue;
      try {
        const res = await API.request({
          url: draft.request!.path,
          method: draft.request!.method,
          data: draft.request!.data,
        });
        if (res.status === 200 || res.status === 201) {
          confirmDraft(key, draft.revision);
          window.dispatchEvent(
            new CustomEvent("ames-record-synced", { detail: key }),
          );
        }
      } catch (error) {
        if (readDraft<unknown>(key)?.revision === draft.revision)
          storeDraft(key, { ...draft, error: errorMessage(error) });
        if (isNetworkError(error)) break;
      }
    }
  } finally {
    syncing = false;
  }
}
export function useDurableForm<T>(resource: string, initial: T) {
  const { user } = useAuth();
  const owner = user?.id || 0;
  const key = resource.startsWith("eccd_")
    ? `eccd_draft_${resource.slice(5)}_${owner}`
    : `ames_draft_${owner}_${resource}`;
  const [values, setValues] = useState<T>(
    () => readDraft<T>(key)?.values ?? initial,
  );
  useEffect(() => {
    setValues(readDraft<T>(key)?.values ?? initial);
  }, [key]); // Callers key forms by record; never overwrite edits after a refetch.
  const change = useCallback(
    (next: T) => {
      const previous = readDraft<T>(key);
      storeDraft(key, {
        owner_id: owner,
        values: next,
        revision: crypto.randomUUID(),
        is_pending_sync: false,
        error: previous?.error,
      });
      setValues(next);
    },
    [key, owner],
  );
  const save = async (
    path: string,
    method: "post" | "put",
    data: unknown = values,
  ): Promise<"saved" | "pending"> => {
    const draft: Draft<T> = {
      owner_id: owner,
      values,
      revision: crypto.randomUUID(),
      is_pending_sync: true,
      request: { path, method, data },
    };
    storeDraft(key, draft);
    try {
      const res = await API.request({ url: path, method, data });
      if (res.status !== 200 && res.status !== 201)
        throw new Error("The server did not confirm this save.");
      confirmDraft(key, draft.revision);
      return "saved";
    } catch (error) {
      if (isNetworkError(error)) return "pending";
      if (readDraft<T>(key)?.revision === draft.revision)
        storeDraft(key, {
          ...draft,
          is_pending_sync: false,
          error: errorMessage(error),
        });
      throw error;
    }
  };
  return { values, change, save, key };
}
