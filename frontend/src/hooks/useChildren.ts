import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, isNetworkError } from "../services/api";
import { sharedGet } from "../services/sharedGet";
import { refreshOnWake } from "./refreshOnWake";
import { useAuth } from "../context/AuthContext";
import type { Student } from "../types";

export function useChildren() {
  const { user } = useAuth();
  const key = `ames_child_${user?.id}`;
  const [children, setChildren] = useState<Student[]>([]);
  const [selected, setSelected] = useState<number>(
    () => Number(localStorage.getItem(key)) || 0,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const version = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++version.current;
    try {
      const rows = await sharedGet<Student[]>("/api/students/my-child");
      if (request !== version.current) return;
      setChildren(rows);
      const stored = Number(localStorage.getItem(key));
      const id = rows.some((s) => s.student_id === stored)
        ? stored
        : rows[0]?.student_id || 0;
      setSelected(id);
      localStorage.setItem(key, String(id));
      setError("");
    } catch (err) {
      if (request !== version.current) return;
      if (!isNetworkError(err)) setChildren([]);
      setError(errorMessage(err));
    } finally {
      if (request === version.current) setLoading(false);
    }
  }, [key]);
  useEffect(() => {
    setChildren([]);
    setLoading(true);
    void refresh();
    const reload = () => void refresh();
    const stop = refreshOnWake(refresh);
    const selection = () => setSelected(Number(localStorage.getItem(key)) || 0);
    window.addEventListener("ames-record-synced", reload);
    window.addEventListener("ames-child-selected", selection);
    window.addEventListener("storage", selection);
    return () => {
      ++version.current;
      stop();
      window.removeEventListener("ames-record-synced", reload);
      window.removeEventListener("ames-child-selected", selection);
      window.removeEventListener("storage", selection);
    };
  }, [key, refresh]);
  const select = (id: number) => {
    if (!children.some((child) => child.student_id === id)) return;
    localStorage.setItem(key, String(id));
    setSelected(id);
    window.dispatchEvent(new Event("ames-child-selected"));
  };
  return {
    children,
    child: children.find((s) => s.student_id === selected),
    selected,
    select,
    refresh,
    error,
    loading,
  };
}
