import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import API, { errorMessage, isNetworkError } from "../services/api";
import type { Assessment } from "../types";
import { assessmentRefreshScheduler } from "./assessmentRefresh";

export function useAssessment(id: number, parent: boolean) {
  const { user } = useAuth();
  const [data, setData] = useState<Assessment | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const requestVersion = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const scope = `${user?.id}_${parent}_${id}`;
  const activeScope = useRef<string | null>(scope);
  const refresh = useCallback(async () => {
    if (activeScope.current !== scope) return;
    const version = ++requestVersion.current;
    controller.current?.abort();
    if (!id) {
      setData(null);
      setError("");
      setLoading(false);
      return;
    }
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    const cacheKey = `ames_assessment_cache_${user?.id}_${id}`;
    try {
      const res = await API.get<Assessment>(
        `/api/eccd/${parent ? "parent/" : ""}assessment/${id}`,
        { signal: request.signal },
      );
      if (request.signal.aborted || version !== requestVersion.current) return;
      setData(res.data);
      if (!parent) localStorage.setItem(cacheKey, JSON.stringify(res.data));
      setError("");
    } catch (err) {
      if (request.signal.aborted || version !== requestVersion.current) return;
      setError(errorMessage(err));
      if (!parent && isNetworkError(err)) {
        try {
          setData(
            JSON.parse(
              localStorage.getItem(cacheKey) || "null",
            ) as Assessment | null,
          );
        } catch {
          setData(null);
        }
      } else setData(null);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [id, parent, user?.id, scope]);
  useEffect(() => {
    activeScope.current = scope;
    setData(null);
    void refresh();
    const scheduler = assessmentRefreshScheduler(user?.id || 0, refresh);
    const synced = (event: Event) => {
      if (parent) {
        void refresh();
        return;
      }
      const key = (event as CustomEvent<string>).detail;
      if (
        id &&
        (!key ||
          !key.startsWith("eccd_draft_") ||
          (key.startsWith(`eccd_draft_${id}_`) && key.endsWith(`_${user?.id}`)))
      )
        scheduler.schedule();
    };
    window.addEventListener("ames-record-synced", synced);
    return () => {
      ++requestVersion.current;
      activeScope.current = null;
      controller.current?.abort();
      scheduler.cancel();
      window.removeEventListener("ames-record-synced", synced);
    };
  }, [refresh, id, user?.id, scope, parent]);
  return {
    data: data?.student_id === id ? data : null,
    error,
    loading,
    refresh,
  };
}
