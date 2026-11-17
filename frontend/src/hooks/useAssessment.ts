import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { errorMessage, isNetworkError } from "../services/api";
import { sharedGet } from "../services/sharedGet";
import type { Assessment } from "../types";
import { assessmentRefreshScheduler } from "./assessmentRefresh";
import { refreshOnWake } from "./refreshOnWake";

export function useAssessment(id: number, parent: boolean) {
  const { user } = useAuth();
  const [data, setData] = useState<Assessment | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const requestVersion = useRef(0);
  const scope = `${user?.id}_${parent}_${id}`;
  const activeScope = useRef<string | null>(scope);
  const refresh = useCallback(
    async (fresh = true) => {
      if (activeScope.current !== scope) return;
      const version = ++requestVersion.current;
      if (!id) {
        setData(null);
        setError("");
        setLoading(false);
        return;
      }
      setLoading(true);
      const cacheKey = `ames_assessment_cache_${user?.id}_${id}`;
      try {
        const assessment = await sharedGet<Assessment>(
          `/api/eccd/${parent ? "parent/" : ""}assessment/${id}`,
          undefined,
          fresh,
        );
        if (version !== requestVersion.current) return;
        setData(assessment);
        if (!parent) localStorage.setItem(cacheKey, JSON.stringify(assessment));
        setError("");
      } catch (err) {
        if (version !== requestVersion.current) return;
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
    },
    [id, parent, user?.id, scope],
  );
  useEffect(() => {
    activeScope.current = scope;
    setData(null);
    void refresh(false);
    const stop = refreshOnWake(() => refresh(false));
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
      scheduler.cancel();
      stop();
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
