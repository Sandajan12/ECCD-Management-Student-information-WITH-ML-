import { Link, Outlet, useLocation } from "react-router-dom";
import MainLayout from "./MainLayout";
import { TeacherProvider, useTeacher } from "../context/TeacherContext";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { Notice } from "../components/ui";
import "../components/teacher/teacher.css";

const pageLabels: Record<string, string> = {
  dashboard: "Dashboard",
  students: "My Students",
  eccdassessment: "Assessments",
  "eccd-questions": "ECCD Questions",
  messages: "Messages",
  settings: "Settings",
};
function TeacherContent() {
  const { user } = useAuth();
  const { settings, isLoaded, settingsError } = useSettings();
  const { section, sections, selectSection, loading, error } = useTeacher();
  const location = useLocation();
  const page =
    pageLabels[location.pathname.split("/").at(-1) || ""] || "Teacher Portal";
  return (
    <div className="teacher-portal">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-2"
        >
          <Link to="/teacher/dashboard" className="hover:text-brand">
            Teacher Portal
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{page}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-lg bg-emerald-50 px-3 py-2 font-semibold text-emerald-700">
            SY{" "}
            {settings.current_school_year ||
              (isLoaded ? "Not configured" : "Loading…")}
          </span>
          <label className="flex items-center gap-2 font-semibold text-blue-700">
            <span>Section</span>
            <select
              aria-label="Active teacher section"
              className="max-w-full rounded-lg bg-blue-50 p-2"
              value={section?.section_id || ""}
              disabled={loading || !sections.length}
              onChange={(e) => selectSection(Number(e.target.value))}
            >
              {!sections.length && (
                <option value="">
                  {loading ? "Loading…" : "No assignment"}
                </option>
              )}
              {sections.map((s) => (
                <option key={s.section_id} value={s.section_id}>
                  {s.section_name}
                </option>
              ))}
            </select>
          </label>
          <Link
            to="/teacher/settings"
            aria-label="Account settings"
            className="flex min-w-0 items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand font-bold text-white">
              {user?.username.slice(0, 1).toUpperCase()}
            </span>
            <span className="max-w-40 truncate font-semibold text-slate-700">
              {user?.username}
              <span className="block text-[10px] font-normal text-slate-500">
                Teacher
              </span>
            </span>
          </Link>
        </div>
      </header>
      <Notice tone="error">{error || settingsError}</Notice>
      <Outlet />
    </div>
  );
}
export default function TeacherLayout() {
  const { user } = useAuth();
  return (
    <TeacherProvider key={user?.id}>
      <MainLayout>
        <TeacherContent />
      </MainLayout>
    </TeacherProvider>
  );
}
