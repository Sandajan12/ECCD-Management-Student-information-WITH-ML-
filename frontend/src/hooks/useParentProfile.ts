import { useCallback, useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { useAuth } from "../context/AuthContext";
import API, { errorMessage, isNetworkError } from "../services/api";
import type { Student } from "../types";
import { confirmDraft, readDraft, storeDraft, type Draft } from "../utils/drafts";
import { profileValues, type ParentProfileValues } from "../utils/parentProfile";

export function useParentProfile(id: number) {
  const { user } = useAuth();
  const owner = user?.id || 0;
  const key = `ames_draft_${owner}_parent_profile_${id}`;
  const [record, setRecord] = useState<Student | null>(null);
  const [failure, setFailure] = useState({ id: 0, message: "" });
  const [loading, setLoading] = useState(false);
  const [, updateDrafts] = useState(0);
  const memoryDrafts = useRef(new Map<string, Draft<ParentProfileValues>>());
  const version = useRef(0);
  const currentKey = useRef(key);
  currentKey.current = key;
  const child = record?.student_id === id ? record : null;
  const error = failure.id === id ? failure.message : "";
  const draft = memoryDrafts.current.get(key) || readDraft<ParentProfileValues>(key);
  const values = draft?.owner_id === owner ? draft.values : profileValues(child || undefined);
  const refresh = useCallback(async () => {
    if (currentKey.current !== key) return;
    const request = ++version.current;
    if (!id) { setRecord(null); setLoading(false); return; }
    setLoading(true);
    try {
      const response = await API.get<Student>(`/api/students/${id}`);
      if (request !== version.current || currentKey.current !== key) return;
      setRecord(response.data);
      setFailure({ id, message: "" });
    } catch (err) {
      if (request !== version.current || currentKey.current !== key) return;
      setRecord(null);
      setFailure({ id, message: errorMessage(err) });
    } finally {
      if (request === version.current) setLoading(false);
    }
  }, [id, key]);
  useEffect(() => {
    setRecord(null);
    void refresh();
    const reload = () => void refresh();
    const redraw = () => updateDrafts(value => value + 1);
    window.addEventListener("online", reload);
    window.addEventListener("focus", reload);
    window.addEventListener("ames-record-synced", reload);
    window.addEventListener("ames-drafts-changed", redraw);
    window.addEventListener("storage", redraw);
    return () => {
      ++version.current;
      window.removeEventListener("online", reload);
      window.removeEventListener("focus", reload);
      window.removeEventListener("ames-record-synced", reload);
      window.removeEventListener("ames-drafts-changed", redraw);
      window.removeEventListener("storage", redraw);
    };
  }, [refresh]);
  const write = (snapshot: Draft<ParentProfileValues>) => {
    storeDraft(key, snapshot);
    if (readDraft<ParentProfileValues>(key)?.revision === snapshot.revision) memoryDrafts.current.delete(key);
    else memoryDrafts.current.set(key, snapshot);
    updateDrafts(value => value + 1);
  };
  const change = (next: ParentProfileValues) => write({ owner_id: owner, values: next, revision: crypto.randomUUID(), is_pending_sync: false });
  const save = async (path: string, method: "put", data: unknown): Promise<"saved" | "pending"> => {
    const snapshot: Draft<ParentProfileValues> = { owner_id: owner, values, revision: crypto.randomUUID(), is_pending_sync: true, request: { path, method, data } };
    write(snapshot);
    if (!navigator.onLine) return "pending";
    try {
      const response = await API.request({ url: path, method, data });
      if (response.status !== 200 && response.status !== 201) throw new Error("The server did not confirm this save.");
      confirmDraft(key, snapshot.revision);
      if (memoryDrafts.current.get(key)?.revision === snapshot.revision) memoryDrafts.current.delete(key);
      updateDrafts(value => value + 1);
      return "saved";
    } catch (err) {
      if (isNetworkError(err) || (isAxiosError(err) && (err.response?.status || 0) >= 500)) return "pending";
      if ((memoryDrafts.current.get(key) || readDraft<ParentProfileValues>(key))?.revision === snapshot.revision)
        write({ ...snapshot, is_pending_sync: false, error: errorMessage(err) });
      throw err;
    }
  };
  return { child, error, loading: loading || Boolean(id && !child && !error), refresh, form: { values, change, save, key } };
}
