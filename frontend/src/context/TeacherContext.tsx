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
import { errorMessage } from "../services/api";
import { sharedGet } from "../services/sharedGet";
import { refreshOnWake } from "../hooks/refreshOnWake";
import { useHomeObservations } from "../hooks/useHomeObservations";
import type { Permissions, Section, SessionUser } from "../types";

export interface TeacherDashboardFilters {
  sections: string[];
  domains: string[];
  schoolYears: string[];
  sectionOptions: Pick<Section, "section_id" | "section_name">[];
  currentSchoolYear: string | null;
}
interface TeacherAccess extends Permissions {
  allow_eccd_question_management: boolean;
  section_id: number | null;
  section_name: string | null;
  class_name: string | null;
}

interface TeacherContextState {
  sections: Section[];
  section: Section | null;
  loading: boolean;
  error: string;
  selectSection: (id: number) => void;
  dashboardFilters: TeacherDashboardFilters | null;
  access: TeacherAccess | null;
  initialized: boolean;
  refresh: () => Promise<void>;
  homeObservations: ReturnType<typeof useHomeObservations>;
}
const TeacherContext = createContext<TeacherContextState | null>(null);
interface TeacherProviderProps {
  children: ReactNode;
}

export function TeacherProvider({ children }: TeacherProviderProps) {
  const { user, token, updateUser } = useAuth();
  const userId = user?.id;
  const authenticated = Boolean(token);
  const homeObservations = useHomeObservations(userId || 0);
  const latestUser = useRef<SessionUser | null>(user);
  useEffect(() => {
    latestUser.current = user;
  }, [user]);
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
  const [dashboardFilters, setDashboardFilters] =
    useState<TeacherDashboardFilters | null>(null);
  const [access, setAccess] = useState<TeacherAccess | null>(null);
  const [initialized, setInitialized] = useState<boolean>(false);
  const selectSection = useCallback(
    (id: number) => {
      setSelectedId(id);
      localStorage.setItem(storageKey, String(id));
    },
    [storageKey],
  );
  const refresh = useCallback(async () => {
    if (!userId || !authenticated) return;
    // The filters endpoint is scoped to active teacher assignments; /sections
    // alone returns the whole school and must not define teacher choices.
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const [choices, filters, controls] = await Promise.all([
        sharedGet<Section[]>("/api/sections/"),
        sharedGet<TeacherDashboardFilters>("/api/teachers/dashboard-filters"),
        sharedGet<TeacherAccess>("/api/teachers/access-controls"),
      ]);
      if (version !== requestVersion.current) return;
      const assigned = choices.filter((s) =>
        filters.sections.includes(s.section_name),
      );
      setDashboardFilters(filters);
      setAccess(controls);
      setSections(assigned);
      localStorage.setItem(cacheKey, JSON.stringify(assigned));
      const stored = Number(localStorage.getItem(storageKey));
      const next =
        assigned.find((s) => s.section_id === stored) ||
        assigned.find((s) => s.section_id === controls.section_id) ||
        assigned[0];
      selectSection(next?.section_id || 0);
      const currentUser = latestUser.current;
      if (
        currentUser?.id === userId &&
        (currentUser.allow_eccd_question_management !==
          controls.allow_eccd_question_management ||
          currentUser.section_id !== controls.section_id ||
          currentUser.section_name !== controls.section_name)
      ) {
        updateUser({
          ...currentUser,
          allow_eccd_question_management:
            controls.allow_eccd_question_management,
          section_id: controls.section_id,
          section_name: controls.section_name,
        });
      }
      setInitialized(true);
      setError("");
    } catch (err) {
      if (version === requestVersion.current) setError(errorMessage(err));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [userId, authenticated, cacheKey, storageKey, selectSection, updateUser]);
  useEffect(() => {
    void refresh();
    const stop = refreshOnWake(refresh);
    return () => {
      ++requestVersion.current;
      stop();
    };
  }, [refresh]);
  return (
    <TeacherContext.Provider
      value={{
        sections,
        section: sections.find((s) => s.section_id === selectedId) || null,
        loading,
        error,
        selectSection,
        dashboardFilters,
        access,
        initialized,
        refresh,
        homeObservations,
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
