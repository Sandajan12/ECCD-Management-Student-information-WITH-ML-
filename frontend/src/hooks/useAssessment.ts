import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import API, { errorMessage, isNetworkError } from "../services/api";
import type { Assessment } from "../types";

export function useAssessment(id: number, parent: boolean) {
  const { user } = useAuth();
  const [data, setData] = useState<Assessment | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const requestVersion = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!id) {
      setData(null);
      return;
    }
    setLoading(true);
    const cacheKey = `ames_assessment_cache_${user?.id}_${id}`;
    try {
      const res = await API.get<Assessment>(
        `/api/eccd/${parent ? "parent/" : ""}assessment/${id}`,
      );
      if (version !== requestVersion.current) return;
      setData(res.data);
      if (!parent) localStorage.setItem(cacheKey, JSON.stringify(res.data));
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
  }, [id, parent, user?.id]);
  useEffect(() => {
    setData(null);
    void refresh();
    const synced = () => void refresh();
    window.addEventListener("ames-record-synced", synced);
    return () => {
      ++requestVersion.current;
      window.removeEventListener("ames-record-synced", synced);
    };
  }, [refresh]);
  return {
    data: data?.student_id === id ? data : null,
    error,
    loading,
    refresh,
  };
}
