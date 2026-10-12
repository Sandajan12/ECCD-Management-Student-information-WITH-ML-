import { useCallback, useEffect, useState } from "react";
import API, { errorMessage } from "../services/api";
import { useAuth } from "../context/AuthContext";
import type { Student } from "../types";

export function useChildren() {
  const { user } = useAuth();
  const [children, setChildren] = useState<Student[]>([]);
  const [selected, setSelected] = useState<number>(
    () => Number(localStorage.getItem(`ames_child_${user?.id}`)) || 0,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const rows = (await API.get<Student[]>("/api/students/my-child")).data;
      setChildren(rows);
      setSelected((id) =>
        rows.some((s) => s.student_id === id) ? id : rows[0]?.student_id || 0,
      );
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const select = (id: number) => {
    localStorage.setItem(`ames_child_${user?.id}`, String(id));
    setSelected(id);
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
