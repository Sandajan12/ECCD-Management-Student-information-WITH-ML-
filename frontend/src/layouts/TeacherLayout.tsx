import RouteContent from "../components/RouteContent";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import MainLayout from "./MainLayout";
import { TeacherProvider, useTeacher } from "../context/TeacherContext";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { Notice } from "../components/ui";
import { teacherTheme } from "../components/teacher/theme";
import "../components/teacher/teacher.css";
function TeacherContent() {
  const { settingsError } = useSettings();
  const { section, sections, selectSection, loading, error } = useTeacher();
  return (
    <div className="teacher-portal">
      {sections.length > 1 && (
        <label className="mb-4 flex flex-wrap items-center gap-2 text-sm font-semibold text-blue-700">
          Section
          <select
            aria-label="Active teacher section"
            className="max-w-full rounded-lg bg-blue-50 p-2"
            value={section?.section_id || ""}
            disabled={loading}
            onChange={(event) => selectSection(Number(event.target.value))}
          >
            {sections.map((choice) => (
              <option key={choice.section_id} value={choice.section_id}>
                {choice.section_name}
              </option>
            ))}
          </select>
        </label>
      )}
      <Notice tone="error">{error || settingsError}</Notice>
      <RouteContent />
    </div>
  );
}
export default function TeacherLayout() {
  const { user } = useAuth();
  return (
    <ThemeProvider theme={teacherTheme}>
      <CssBaseline />
      <TeacherProvider key={user?.id}>
        <MainLayout>
          <TeacherContent />
        </MainLayout>
      </TeacherProvider>
    </ThemeProvider>
  );
}
