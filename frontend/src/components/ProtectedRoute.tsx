import React from 'react';
import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';

interface ProtectedRouteProps {
  children?: ReactNode;
  allowedRoles?: string[];
  requiredPermission?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, requiredPermission }) => {
  const token = localStorage.getItem('token');
  const userString = localStorage.getItem('user');
  const user = userString ? JSON.parse(userString) : null;

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  const role = user.role?.toLowerCase() || '';

  if (allowedRoles && !allowedRoles.includes(role)) {
    if (role === 'super-admin' || role === 'chairman') return <Navigate to="/super-admin/dashboard" replace />;
    if (role === 'admin' || role === 'teacher') return <Navigate to="/teacher/dashboard" replace />;
    if (role === 'user' || role === 'parent') return <Navigate to="/parent/dashboard" replace />;
    
    return <Navigate to="/login" replace />;
  }

  if (requiredPermission && (role === 'admin' || role === 'teacher')) {
    if (!user[requiredPermission]) {
      return <Navigate to="/teacher/dashboard" replace />;
    }
  }

  return children ? <>{children}</> : <Outlet />;
};

export default ProtectedRoute;
