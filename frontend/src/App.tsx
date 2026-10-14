import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { SettingsProvider } from "./context/SettingsContext";

import LoginPage from "./pages/LoginPage";
import RegisterParentPage from "./pages/RegisterParentPage";

// Chairman / Super-Admin Pages
import ChairmanDashboard from "./pages/chairman/Dashboard";
import TeacherManagement from "./pages/chairman/TeacherManagement";
import StudentRecords from "./pages/chairman/StudentRecords";
import SystemAuditLog from "./pages/chairman/SystemAuditLog";
import EccdQuestionsManagement from "./pages/chairman/EccdQuestionsManagement";
import SystemSettings from "./pages/chairman/SystemSettings";

// Teacher Pages
import TeacherDashboard from "./pages/teacher/Dashboard";
import StudentManagement from "./pages/teacher/StudentManagement";
import EccdAssessment from "./pages/teacher/EccdAssessment";
import MessageParent from "./pages/teacher/MessageParent";
import TeacherSettings from "./pages/teacher/TeacherSettings";

// Parent Pages
import ParentDashboard from "./pages/parent/Dashboard";
import ParentEccdAssessment from "./pages/parent/ParentEccdAssessment";
import ChildManagement from "./pages/parent/ChildManagement";
import MessageTeacher from "./pages/parent/MessageTeacher";

import ProtectedRoute from "./components/ProtectedRoute";
import ParentLayout from "./layouts/ParentLayout";
import ChairmanLayout from "./layouts/ChairmanLayout";
import TeacherLayout from "./layouts/TeacherLayout";
import EccdQuestionManagement from "./pages/chairman/EccdQuestionsManagement";
import "./App.css";

function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register-parent" element={<RegisterParentPage />} />
            <Route
              path="/chairman/dashboard"
              element={<Navigate to="/super-admin/dashboard" replace />}
            />
            <Route
              path="/chairman/teachers"
              element={<Navigate to="/super-admin/teachers" replace />}
            />
            <Route
              path="/chairman/students"
              element={<Navigate to="/super-admin/students" replace />}
            />
            <Route
              path="/chairman/audit"
              element={<Navigate to="/super-admin/audit" replace />}
            />
            <Route
              path="/chairman/eccd-questions"
              element={<Navigate to="/super-admin/eccd-questions" replace />}
            />
            <Route
              path="/chairman/settings"
              element={<Navigate to="/super-admin/settings" replace />}
            />
            <Route
              path="/parents/childinformation"
              element={<Navigate to="/parent/childinformation" replace />}
            />

            {/* Super-Admin Protected Routes */}
            <Route
              element={
                <ProtectedRoute allowedRoles={["super-admin", "chairman"]} />
              }
            >
              <Route element={<ChairmanLayout />}>
                <Route
                  path="/super-admin/dashboard"
                  element={<ChairmanDashboard />}
                />
                <Route
                  path="/super-admin/teachers"
                  element={<TeacherManagement />}
                />
                <Route
                  path="/super-admin/students"
                  element={<StudentRecords />}
                />
                <Route path="/super-admin/audit" element={<SystemAuditLog />} />
                <Route
                  path="/super-admin/eccd-questions"
                  element={<EccdQuestionsManagement />}
                />
                <Route
                  path="/super-admin/settings"
                  element={<SystemSettings />}
                />
              </Route>
            </Route>

            {/* Admin/Teacher Protected Routes */}
            <Route
              element={<ProtectedRoute allowedRoles={["admin", "teacher"]} />}
            >
              <Route element={<TeacherLayout />}>
                <Route
                  path="/teacher/dashboard"
                  element={<TeacherDashboard />}
                />
                <Route
                  path="/teacher/students"
                  element={<StudentManagement />}
                />
                <Route
                  path="/teacher/eccdassessment"
                  element={<EccdAssessment />}
                />
                <Route path="/teacher/messages" element={<MessageParent />} />
                <Route path="/teacher/settings" element={<TeacherSettings />} />
                <Route
                  path="/teacher/eccd-questions"
                  element={
                    <ProtectedRoute
                      allowedRoles={["admin", "teacher"]}
                      requiredPermission="allow_eccd_question_management"
                    >
                      <EccdQuestionManagement />
                    </ProtectedRoute>
                  }
                />
              </Route>
            </Route>

            {/* User/Parent Protected Routes */}
            <Route
              element={<ProtectedRoute allowedRoles={["user", "parent"]} />}
            >
              <Route element={<ParentLayout />}>
                <Route
                  path="/parent/overview"
                  element={<Navigate to="/parent/dashboard" replace />}
                />
                <Route path="/parent/dashboard" element={<ParentDashboard />} />
                <Route
                  path="/parent/eccdassessment"
                  element={<ParentEccdAssessment />}
                />
                <Route
                  path="/parent/childinformation"
                  element={<ChildManagement />}
                />
                <Route path="/parent/messages" element={<MessageTeacher />} />
              </Route>
            </Route>

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </SettingsProvider>
    </AuthProvider>
  );
}

export default App;
