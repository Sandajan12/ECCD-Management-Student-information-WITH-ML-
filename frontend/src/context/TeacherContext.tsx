import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import API, { errorMessage } from "../services/api";
import type { Section } from "../types";

interface TeacherContextState {
  sections: Section[];
  section: Section | null;
  loading: boolean;
  error: string;
  selectSection: (id: number) => void;
}
const TeacherContext = createContext<TeacherContextState | null>(null);
interface TeacherProviderProps {
  children: ReactNode;
}

export function TeacherProvider({ children }: TeacherProviderProps) {
  const { user } = useAuth();
  const storageKey = `ames_teacher_section_${user?.id}`;
  const [selectedId, setSelectedId] = useState<number>(
    () => Number(localStorage.getItem(storageKey)) || user?.section_id || 0,
  );
  const cacheKey = `ames_teacher_sections_${user?.id}`;
  const [sections, setSections] = useState<Section[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(cacheKey) || "[]") as Section[];
    } catch {
      return [];
    }
  });
  const requestVersion = useRef<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const selectSection = useCallback(
    (id: number) => {
      setSelectedId(id);
      localStorage.setItem(storageKey, String(id));
    },
    [storageKey],
  );
  useEffect(() => {
    let current = true;
    // The filters endpoint is scoped to active teacher assignments; /sections
    // alone returns the whole school and must not define teacher choices.
    const load = async () => {
      const version = ++requestVersion.current;
      setLoading(true);
      try {
        const [choices, names] = await Promise.all([
          API.get<Section[]>("/api/sections/"),
          API.get<{ sections: string[] }>("/api/teachers/dashboard-filters"),
        ]);
        if (!current || version !== requestVersion.current) return;
        const assigned = choices.data.filter((s) =>
          names.data.sections.includes(s.section_name),
        );
        setSections(assigned);
        localStorage.setItem(cacheKey, JSON.stringify(assigned));
        const stored = Number(localStorage.getItem(storageKey));
        const next =
          assigned.find((s) => s.section_id === stored) ||
          assigned.find((s) => s.section_id === user?.section_id) ||
          assigned[0];
        selectSection(next?.section_id || 0);
        setError("");
      } catch (err) {
        if (current && version === requestVersion.current)
          setError(errorMessage(err));
      } finally {
        if (current && version === requestVersion.current) setLoading(false);
      }
    };
    void load();
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      current = false;
      ++requestVersion.current;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [storageKey, cacheKey, user?.section_id, selectSection]);
  return (
    <TeacherContext.Provider
      value={{
        sections,
        section: sections.find((s) => s.section_id === selectedId) || null,
        loading,
        error,
        selectSection,
      }}
    >
      {children}
    </TeacherContext.Provider>
  );
}

export function useTeacher(): TeacherContextState {
  const value = useContext(TeacherContext);
  if (!value) throw new Error("TeacherProvider is required");
  return value;
}
