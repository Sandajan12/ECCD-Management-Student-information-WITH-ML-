import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import theme from './theme';
import { SettingsProvider } from './context/SettingsContext';

import LoginPage from './pages/LoginPage';
import RegisterParentPage from './pages/RegisterParentPage';

// Super-Admin Pages
import SuperAdminDashboard from './pages/super-admin/Dashboard';
import TeacherManagement from './pages/super-admin/TeacherManagement';
import StudentRecords from './pages/super-admin/StudentRecords';
import SystemAuditLog from './pages/super-admin/SystemAuditLog';
import EccdQuestionsManagement from './pages/super-admin/EccdQuestionsManagement';
import SystemSettings from './pages/super-admin/SystemSettings';

// Admin / Teacher Pages
import AdminDashboard from './pages/admin/Dashboard';
import StudentManagement from './pages/admin/StudentManagement';
import EccdAssessment from './pages/admin/EccdAssessment';
import MessageParent from './pages/admin/MessageParent';
import TeacherSettings from './pages/admin/TeacherSettings';

// User / Parent Pages
import UserDashboard from './pages/user/Dashboard';
import ParentEccdAssessment from './pages/user/ParentEccdAssessment';
import ChildManagement from './pages/user/ChildManagement';
import MessageTeacher from './pages/user/MessageTeacher';

import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import './App.css';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SettingsProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register-parent" element={<RegisterParentPage />} />
            
            {/* Super-Admin Protected Routes */}
            <Route element={<ProtectedRoute allowedRoles={['super-admin', 'chairman']} />}>
              <Route element={<MainLayout />}>
                <Route path="/super-admin/dashboard" element={<SuperAdminDashboard />} />
                <Route path="/super-admin/teachers" element={<TeacherManagement />} />
                <Route path="/super-admin/students" element={<StudentRecords />} />
                <Route path="/super-admin/audit" element={<SystemAuditLog />} />
                <Route path="/super-admin/eccd-questions" element={<EccdQuestionsManagement />} />
                <Route path="/super-admin/settings" element={<SystemSettings />} />
              </Route>
            </Route>

            {/* Admin/Teacher Protected Routes */}
            <Route element={<ProtectedRoute allowedRoles={['admin', 'teacher']} />}>
              <Route element={<MainLayout />}>
                <Route path="/teacher/dashboard" element={<AdminDashboard />} />
                <Route path="/teacher/students" element={<StudentManagement />} />
                <Route path="/teacher/eccdassessment" element={<EccdAssessment />} />
                <Route path="/teacher/messages" element={<MessageParent />} />
                <Route path="/teacher/settings" element={<TeacherSettings />} />
                <Route
                  path="/teacher/eccd-questions"
                  element={
                    <ProtectedRoute
                      allowedRoles={['admin', 'teacher']}
                      requiredPermission="allow_eccd_question_management"
                    >
                      <EccdQuestionsManagement />
                    </ProtectedRoute>
                  }
                />
              </Route>
            </Route>

            {/* User/Parent Protected Routes */}
            <Route element={<ProtectedRoute allowedRoles={['user', 'parent']} />}>
              <Route element={<MainLayout />}>
                <Route path="/parent/dashboard" element={<UserDashboard />} />
                <Route path="/parent/eccdassessment" element={<ParentEccdAssessment />} />
                <Route path="/parent/childinformation" element={<ChildManagement />} />
                <Route path="/parent/messages" element={<MessageTeacher />} />
              </Route>
            </Route>
            
            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </SettingsProvider>
    </ThemeProvider>
  );
}

export default App;
