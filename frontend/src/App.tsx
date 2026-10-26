import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy } from "react";
import RouteContent from "./components/RouteContent";
import { AuthProvider } from "./context/AuthContext";
import { SettingsProvider } from "./context/SettingsContext";

import LoginPage from "./pages/LoginPage";
const RegisterParentPage = lazy(() => import("./pages/RegisterParentPage"));

// Chairman / Super-Admin Pages
const ChairmanDashboard = lazy(() => import("./pages/chairman/Dashboard"));
const TeacherManagement = lazy(
  () => import("./pages/chairman/TeacherManagement"),
);
const StudentRecords = lazy(() => import("./pages/chairman/StudentRecords"));
const SystemAuditLog = lazy(() => import("./pages/chairman/SystemAuditLog"));
const EccdQuestionsManagement = lazy(
  () => import("./pages/chairman/EccdQuestionsManagement"),
);
const SystemSettings = lazy(() => import("./pages/chairman/SystemSettings"));

// Teacher Pages
const TeacherDashboard = lazy(() => import("./pages/teacher/Dashboard"));
const StudentManagement = lazy(
  () => import("./pages/teacher/StudentManagement"),
);
const EccdAssessment = lazy(() => import("./pages/teacher/EccdAssessment"));
const MessageParent = lazy(() => import("./pages/teacher/MessageParent"));
const TeacherSettings = lazy(() => import("./pages/teacher/TeacherSettings"));
const MlInsights = lazy(() => import("./pages/teacher/MlInsights"));

// Parent Pages
const ParentDashboard = lazy(() => import("./pages/parent/Dashboard"));
const ParentMlInsights = lazy(() => import("./pages/parent/ParentMlInsights"));
const ParentEccdAssessment = lazy(
  () => import("./pages/parent/ParentEccdAssessment"),
);
const ChildManagement = lazy(() => import("./pages/parent/ChildManagement"));
const MessageTeacher = lazy(() => import("./pages/parent/MessageTeacher"));

import ProtectedRoute from "./components/ProtectedRoute";
const ParentLayout = lazy(() => import("./layouts/ParentLayout"));
const ChairmanLayout = lazy(() => import("./layouts/ChairmanLayout"));
const TeacherLayout = lazy(() => import("./layouts/TeacherLayout"));
import "./App.css";

function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <BrowserRouter>
          <RouteContent>
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
                  <Route
                    path="/super-admin/audit"
                    element={<SystemAuditLog />}
                  />
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
                  <Route
                    path="/teacher/settings"
                    element={<TeacherSettings />}
                  />
                  <Route path="/teacher/ml-insights" element={<MlInsights />} />
                  <Route
                    path="/teacher/eccd-questions"
                    element={
                      <ProtectedRoute
                        allowedRoles={["admin", "teacher"]}
                        requiredPermission="allow_eccd_question_management"
                      >
                        <EccdQuestionsManagement />
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
                  <Route
                    path="/parent/dashboard"
                    element={<ParentDashboard />}
                  />
                  <Route
                    path="/parent/ml-insights"
                    element={<ParentMlInsights />}
                  />
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
          </RouteContent>
        </BrowserRouter>
      </SettingsProvider>
    </AuthProvider>
  );
}

export default App;
