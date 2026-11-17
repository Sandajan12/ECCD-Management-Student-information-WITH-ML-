import { useCallback, useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { useAuth } from "../context/AuthContext";
import API, { errorMessage, isNetworkError } from "../services/api";
import type { Student } from "../types";
import { refreshOnWake } from "./refreshOnWake";
import {
  confirmDraft,
  readDraft,
  storeDraft,
  type Draft,
} from "../utils/drafts";
import {
  profilePayload,
  profileValues,
  type ParentProfileValues,
} from "../utils/parentProfile";

interface ProfileDraft extends Draft<ParentProfileValues> {
  baseline?: ParentProfileValues;
}
const readProfileDraft = (key: string) =>
  readDraft<ParentProfileValues>(key) as ProfileDraft | null;

export function useParentProfile(id: number) {
  const { user } = useAuth();
  const owner = user?.id || 0;
  const key = `ames_draft_${owner}_parent_profile_${id}`;
  const [record, setRecord] = useState<Student | null>(null);
  const [failure, setFailure] = useState({ id: 0, message: "" });
  const [loading, setLoading] = useState(false);
  const [drafts, updateDrafts] = useState(new Map<string, ProfileDraft>());
  const memoryDrafts = useRef(new Map<string, ProfileDraft>());
  const version = useRef(0);
  const currentKey = useRef(key);
  const child = record?.student_id === id ? record : null;
  const error = failure.id === id ? failure.message : "";
  const stored = drafts.get(key) || readProfileDraft(key);
  const draft = stored?.owner_id === owner ? stored : null;
  const values = draft?.values ?? profileValues(child || undefined);
  const baseline = draft?.baseline ?? profileValues(child || undefined);
  const refresh = useCallback(async () => {
    if (currentKey.current !== key) return;
    const request = ++version.current;
    if (!id) {
      setRecord(null);
      setLoading(false);
      return;
    }
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
    currentKey.current = key;
    setRecord(null);
    void refresh();
    const reload = () => void refresh();
    const stop = refreshOnWake(refresh);
    const redraw = () => updateDrafts(new Map(memoryDrafts.current));
    window.addEventListener("ames-record-synced", reload);
    window.addEventListener("ames-drafts-changed", redraw);
    window.addEventListener("storage", redraw);
    return () => {
      currentKey.current = "";
      ++version.current;
      stop();
      window.removeEventListener("ames-record-synced", reload);
      window.removeEventListener("ames-drafts-changed", redraw);
      window.removeEventListener("storage", redraw);
    };
  }, [key, refresh]);
  const write = (snapshot: ProfileDraft) => {
    storeDraft(key, snapshot);
    if (readDraft<ParentProfileValues>(key)?.revision === snapshot.revision)
      memoryDrafts.current.delete(key);
    else memoryDrafts.current.set(key, snapshot);
    updateDrafts(new Map(memoryDrafts.current));
  };
  const change = (next: ParentProfileValues) =>
    write({
      owner_id: owner,
      values: next,
      baseline,
      revision: crypto.randomUUID(),
      is_pending_sync: false,
    });
  const save = async (): Promise<"saved" | "pending" | "unchanged"> => {
    const data = profilePayload(values, baseline);
    if (!Object.keys(data).length) return "unchanged";
    const path = `/api/parents/children/${id}`;
    const method = "put";
    const snapshot: ProfileDraft = {
      owner_id: owner,
      values,
      baseline,
      revision: crypto.randomUUID(),
      is_pending_sync: true,
      request: { path, method, data },
    };
    write(snapshot);
    if (!navigator.onLine) return "pending";
    try {
      const response = await API.request({ url: path, method, data });
      if (response.status !== 200 && response.status !== 201)
        throw new Error("The server did not confirm this save.");
      confirmDraft(key, snapshot.revision);
      if (memoryDrafts.current.get(key)?.revision === snapshot.revision)
        memoryDrafts.current.delete(key);
      // A confirmation may arrive after the user has continued editing. Keep
      // their revision and request, but advance its comparison baseline.
      const newer = memoryDrafts.current.get(key) || readProfileDraft(key);
      if (newer?.owner_id === owner && newer.revision !== snapshot.revision)
        write({ ...newer, baseline: values });
      if (currentKey.current === key)
        setRecord((previous) =>
          previous?.student_id === id
            ? ({ ...previous, ...data } as Student)
            : previous,
        );
      updateDrafts(new Map(memoryDrafts.current));
      return "saved";
    } catch (err) {
      if (
        isNetworkError(err) ||
        (isAxiosError(err) && (err.response?.status || 0) >= 500)
      )
        return "pending";
      if (
        (memoryDrafts.current.get(key) || readDraft<ParentProfileValues>(key))
          ?.revision === snapshot.revision
      )
        write({
          ...snapshot,
          is_pending_sync: false,
          error: errorMessage(err),
        });
      throw err;
    }
  };
  return {
    child,
    error,
    loading: loading || Boolean(id && !child && !error),
    refresh,
    form: {
      values,
      baseline,
      change,
      save,
      key,
      pending: draft?.is_pending_sync === true,
      error: draft?.error,
    },
  };
}
