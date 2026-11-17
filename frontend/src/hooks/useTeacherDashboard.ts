import { useEffect, useState } from "react";
import { sharedGet } from "../services/sharedGet";
import { useTeacher } from "../context/TeacherContext";
import type { Period } from "../types";
import { assessmentRefreshScheduler } from "./assessmentRefresh";
import { refreshOnWake } from "./refreshOnWake";

export interface TeacherDomainSummary {
  domainId: number;
  domainName: string;
  totalKaya: number;
  totalDiKaya: number;
  totalItems: number;
  masteryRate: number;
}

interface PriorityStudentSummary {
  studentId: number;
  studentName: string;
  totalDiKaya: number;
}

interface TeacherPeriodInsights {
  period: Period;
  totalStudents: number;
  completedStudents: number;
  completionRate: number;
  domains: TeacherDomainSummary[];
  excellingDomain?: TeacherDomainSummary | null;
  criticalDomain?: TeacherDomainSummary | null;
  priorityStudent?: PriorityStudentSummary | null;
}

interface DashboardMessage {
  id: number;
  read: boolean;
  name: string | null;
  time: string;
  preview: string;
}

interface DashboardResponse {
  stats: {
    totalStudents: string;
    unreadMessages: string;
    eccdProgress: string;
  };
  messages: DashboardMessage[];
  teacherInsights: TeacherPeriodInsights;
}

interface PieData {
  name: string;
  value: number;
  color: string;
}

type RequestStatus = "idle" | "loading" | "ready" | "error";
interface DashboardResource<T> {
  key: string;
  data: T | null;
  status: RequestStatus;
}
type DashboardParams = Record<string, string | number>;

// Each resource refreshes independently, without hiding successful sibling data.
function useDashboardResource<T>(
  path: string,
  params: DashboardParams | null,
  ownerId: number,
): DashboardResource<T> {
  const paramsKey = params === null ? "" : JSON.stringify(params);
  const key = JSON.stringify([ownerId, path, paramsKey]);
  const [resource, setResource] = useState<DashboardResource<T>>({
    key: "",
    data: null,
    status: "idle",
  });

  useEffect(() => {
    if (!paramsKey || !ownerId) return;
    let current = true;
    let version = 0;
    const load = async () => {
      const request = ++version;
      setResource((previous) => ({
        key,
        data: previous.key === key ? previous.data : null,
        status: "loading",
      }));
      try {
        const data = await sharedGet<T>(
          path,
          JSON.parse(paramsKey) as DashboardParams,
        );
        if (current && request === version)
          setResource({ key, data, status: "ready" });
      } catch {
        if (current && request === version)
          setResource({ key, data: null, status: "error" });
      }
    };
    void load();
    const stop = refreshOnWake(load);
    const scheduler = assessmentRefreshScheduler(ownerId, load);
    window.addEventListener("ames-record-synced", scheduler.schedule);
    return () => {
      current = false;
      scheduler.cancel();
      stop();
      window.removeEventListener("ames-record-synced", scheduler.schedule);
    };
  }, [key, ownerId, paramsKey, path]);

  // Invalidate during render so an old section/period cannot flash before effects.
  return resource.key === key
    ? resource
    : { key, data: null, status: paramsKey && ownerId ? "loading" : "idle" };
}

export function useTeacherDashboard(
  sectionId: number | undefined,
  period: Period,
  domain: string,
  ownerId: number,
) {
  const { dashboardFilters, initialized, error } = useTeacher();
  const filters = {
    data: dashboardFilters,
    status: error ? "error" : initialized ? "ready" : "loading",
  };
  const ready = initialized && dashboardFilters !== null && Boolean(period);
  const summary = useDashboardResource<DashboardResponse>(
    "/api/teachers/dashboard-stats",
    ready && sectionId ? { section_id: sectionId, period } : null,
    ownerId,
  );
  const chart = useDashboardResource<PieData[]>(
    "/api/teachers/dashboard-pie",
    ready && sectionId ? { section_id: sectionId, period, domain } : null,
    ownerId,
  );
  return { filters, summary, chart };
}
