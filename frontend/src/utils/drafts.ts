import { useCallback, useEffect, useState } from "react";
import API, {
  errorMessage,
  isNetworkError,
  getAccessToken,
  getSessionUser,
} from "../services/api";
import { useAuth } from "../context/AuthContext";

type DraftMethod = "post" | "put" | "patch" | "delete";
export interface DraftRequest {
  path: string;
  method: DraftMethod | Uppercase<DraftMethod>;
  data: unknown;
}
function hasUnsafePathCharacters(value: string): boolean {
  return [...value].some(
    (character) =>
      character === "\\" ||
      character.charCodeAt(0) <= 32 ||
      character.charCodeAt(0) === 127,
  );
}
export function isDraftRequest(value: unknown): value is DraftRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<DraftRequest>;
  if (
    typeof request.path !== "string" ||
    !request.path.startsWith("/") ||
    request.path.startsWith("//") ||
    hasUnsafePathCharacters(request.path) ||
    typeof request.method !== "string" ||
    !["post", "put", "patch", "delete"].includes(request.method.toLowerCase())
  )
    return false;
  try {
    const url = new URL(request.path, "https://draft.invalid");
    const decoded = decodeURIComponent(url.pathname);
    return (
      url.origin === "https://draft.invalid" &&
      url.pathname.startsWith("/api/") &&
      new URL(decoded, "https://draft.invalid").pathname.startsWith("/api/") &&
      !hasUnsafePathCharacters(decoded) &&
      !url.hash
    );
  } catch {
    return false;
  }
}
export interface Draft<T> {
  owner_id: number;
  values: T;
  revision: string;
  is_pending_sync: boolean;
  request?: DraftRequest;
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
export function isTeacherEccdDraft(
  key: string,
  draft: Draft<unknown>,
): boolean {
  const match =
    /^eccd_draft_([1-9]\d*)_(PRE|MID|POST)_([1-9]\d*)_([1-9]\d*)$/.exec(key);
  if (
    !match ||
    Number(match[4]) !== draft.owner_id ||
    !isDraftRequest(draft.request) ||
    draft.request.path !== "/api/eccd/evaluate" ||
    draft.request.method.toLowerCase() !== "post"
  )
    return false;
  const data = draft.request.data;
  return (
    typeof data === "object" &&
    data !== null &&
    "student_id" in data &&
    data.student_id === Number(match[1]) &&
    "testing_period" in data &&
    data.testing_period === match[2]
  );
}
let syncing = false;
export async function syncDrafts(owner: number): Promise<void> {
  if (syncing || !navigator.onLine) return;
  syncing = true;
  try {
    for (const { key, draft } of listPending(owner)) {
      const session = getSessionUser();
      // Teachers use the admin role. Parent and chairman sessions never replay.
      if (
        session?.id !== owner ||
        session.role !== "admin" ||
        !getAccessToken()
      )
        break;
      if (readDraft<unknown>(key)?.revision !== draft.revision) continue;
      // Leave every other saved form intact for manual review and submission.
      if (!isTeacherEccdDraft(key, draft)) continue;
      try {
        const res = await API.request<unknown>({
          url: draft.request!.path,
          method: draft.request!.method,
          data: draft.request!.data,
        });
        if (res.status === 200 || res.status === 201) {
          confirmDraft(key, draft.revision);
          window.dispatchEvent(
            Object.assign(
              new CustomEvent("ames-record-synced", { detail: key }),
              {
                response: res.data,
              },
            ),
          );
        }
      } catch (error) {
        if (readDraft<unknown>(key)?.revision === draft.revision)
          storeDraft(key, {
            ...draft,
            error: isNetworkError(error)
              ? "Cannot reach the server. Your teacher ECCD submission is still saved on this device."
              : errorMessage(error),
          });
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
    snapshot: T = values,
  ): Promise<"saved" | "pending"> => {
    const draft: Draft<T> = {
      owner_id: owner,
      values: snapshot,
      revision: crypto.randomUUID(),
      is_pending_sync: true,
      request: { path, method, data },
    };
    storeDraft(key, draft);
    try {
      if (!isDraftRequest(draft.request))
        throw new Error("This save has an invalid API path or method.");
      if (!navigator.onLine) return "pending";
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
