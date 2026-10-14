import "virtual:legacy-global.css";
// Test-only rendering of the unmodified legacy sources. Never imported by the app.
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { CssBaseline, ThemeProvider } from "@mui/material";
import theme from "../../../AMES-SYSTEM-LEGACY/frontend/theme.js";
import Login from "../../../AMES-SYSTEM-LEGACY/frontend/src/pages/auth/Login.jsx";
import Register from "../../../AMES-SYSTEM-LEGACY/frontend/src/pages/auth/Register.jsx";
import MainLayout from "../../../AMES-SYSTEM-LEGACY/frontend/src/components/MainLayout.jsx";
import ForceChangePassword from "../../../AMES-SYSTEM-LEGACY/frontend/src/components/ForceChangePasswordModal.jsx";
import Dashboard from "../../../AMES-SYSTEM-LEGACY/frontend/src/pages/chairman/Dashboard.jsx";
import TeacherManagement from "../../../AMES-SYSTEM-LEGACY/frontend/src/pages/chairman/TeacherManagement.jsx";
import StudentRecords from "../../../AMES-SYSTEM-LEGACY/frontend/src/pages/chairman/StudentRecords.jsx";
import SystemAuditLog from "../../../AMES-SYSTEM-LEGACY/frontend/src/pages/chairman/SystemAuditLog.jsx";
import EccdQuestionsManagement from "../../../AMES-SYSTEM-LEGACY/frontend/src/pages/chairman/EccdQuestionsManagement.jsx";
import SystemSettings from "../../../AMES-SYSTEM-LEGACY/frontend/src/pages/chairman/SystemSettings.jsx";
import "@fontsource/poppins/latin-300.css";
import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-500.css";
import "@fontsource/poppins/latin-600.css";
import "@fontsource/poppins/latin-700.css";
import "@fontsource/poppins/latin-800.css";
import TeacherDashboard from "../../../AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/TeacherDashboard.jsx";
import TeacherStudents from "../../../AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/StudentManagement.jsx";
import TeacherAssessment from "../../../AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/EccdAssessment.jsx";
import TeacherSettings from "../../../AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/TeacherSettings.jsx";
import ParentDashboard from "../../../AMES-SYSTEM-LEGACY/frontend/src/pages/users/ParentDashboard.jsx";
import ChildManagement from "../../../AMES-SYSTEM-LEGACY/frontend/src/pages/users/ChildManagement.jsx";
import ParentAssessment from "../../../AMES-SYSTEM-LEGACY/frontend/src/pages/users/ParentEccdAssessment.jsx";
import MessageTeacher from "../../../AMES-SYSTEM-LEGACY/frontend/src/pages/users/MessageTeacher.jsx";

const path = window.location.pathname;
const parentPages: Record<string, React.ComponentType> = {
  dashboard: ParentDashboard,
  childinformation: ChildManagement,
  eccdassessment: ParentAssessment,
  messages: MessageTeacher,
};
const ParentPage = path.startsWith("/parent/")
  ? parentPages[path.split("/").at(-1)!]
  : undefined;
const teacherPages: Record<string, React.ComponentType> = {
  dashboard: TeacherDashboard,
  students: TeacherStudents,
  eccdassessment: TeacherAssessment,
  settings: TeacherSettings,
};
const TeacherPage = path.startsWith("/teacher/")
  ? teacherPages[path.split("/").at(-1)!]
  : undefined;
const chairmanPages: Record<string, React.ComponentType> = {
  dashboard: Dashboard,
  teachers: TeacherManagement,
  students: StudentRecords,
  audit: SystemAuditLog,
  "eccd-questions": EccdQuestionsManagement,
  settings: SystemSettings,
};
const ChairmanPage = path.startsWith("/chairman/")
  ? chairmanPages[path.split("/").at(-1)!]
  : undefined;
createRoot(document.getElementById("root")!).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <MemoryRouter
      initialEntries={[
        path === "/parent/childinformation"
          ? "/parents/childinformation"
          : path,
      ]}
    >
      {path === "/login" ? (
        <Login />
      ) : path === "/register-parent" ? (
        <Register />
      ) : path === "/first-login" ? (
        <ForceChangePassword />
      ) : (
        <MainLayout>
          {ParentPage ? (
            <ParentPage />
          ) : TeacherPage ? (
            <TeacherPage />
          ) : ChairmanPage ? (
            <ChairmanPage />
          ) : (
            <p>Layout reference</p>
          )}
        </MainLayout>
      )}
    </MemoryRouter>
  </ThemeProvider>,
);
