import { Navigate, Outlet } from "react-router-dom";
import type { ReactNode } from "react";
import { roleHome, useAuth } from "../context/AuthContext";
import ForceChangePassword from "./ForceChangePassword";
export default function ProtectedRoute({
  allowedRoles,
  requiredPermission,
  children,
}: {
  allowedRoles: string[];
  requiredPermission?: "allow_eccd_question_management";
  children?: ReactNode;
}) {
  const { user, token } = useAuth();
  if (!user || !token) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(user.role))
    return <Navigate to={roleHome(user.role)} replace />;
  if (user.role === "admin" && user.is_first_login)
    return <ForceChangePassword />;
  if (requiredPermission && !user[requiredPermission])
    return <Navigate to={roleHome(user.role)} replace />;
  return children || <Outlet />;
}
