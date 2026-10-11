import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import API from "../services/api";
import SyncStatus from "../components/SyncStatus";
import { Button } from "../components/ui";
interface NavItem {
  title: string;
  path: string;
  icon: string;
}
export default function MainLayout() {
  const { user, token, login, logout } = useAuth();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const role = user?.role;
  useEffect(() => {
    if (role !== "admin" || !user || !token) return;
    let mounted = true;
    const refreshAccess = () => {
      void API.get<{
        allow_eccd_question_management: boolean;
        section_id: number | null;
        section_name: string | null;
      }>("/api/teachers/access-controls")
        .then(({ data }) => {
          if (
            mounted &&
            (user.allow_eccd_question_management !==
              data.allow_eccd_question_management ||
              user.section_id !== data.section_id)
          )
            login({
              success: true,
              requireOtp: false,
              requiresPasswordChange: false,
              token,
              user: {
                ...user,
                allow_eccd_question_management:
                  data.allow_eccd_question_management,
                section_id: data.section_id,
                section_name: data.section_name,
              },
            });
        })
        .catch(() => {});
    };
    refreshAccess();
    window.addEventListener("focus", refreshAccess);
    return () => {
      mounted = false;
      window.removeEventListener("focus", refreshAccess);
    };
  }, [user, role, token, login]);
  const items: NavItem[] =
    role === "super-admin"
      ? [
          { title: "Dashboard", path: "/super-admin/dashboard", icon: "◫" },
          {
            title: "Teacher Accounts",
            path: "/super-admin/teachers",
            icon: "♙",
          },
          {
            title: "Student Records",
            path: "/super-admin/students",
            icon: "♧",
          },
          { title: "System Audit Log", path: "/super-admin/audit", icon: "≡" },
          {
            title: "ECCD Questions",
            path: "/super-admin/eccd-questions",
            icon: "☑",
          },
          { title: "Settings", path: "/super-admin/settings", icon: "⚙" },
        ]
      : role === "admin"
        ? [
            { title: "Dashboard", path: "/teacher/dashboard", icon: "◫" },
            { title: "My Students", path: "/teacher/students", icon: "♧" },
            {
              title: "Assessments",
              path: "/teacher/eccdassessment",
              icon: "☑",
            },
            ...(user?.allow_eccd_question_management
              ? [
                  {
                    title: "ECCD Questions",
                    path: "/teacher/eccd-questions",
                    icon: "☷",
                  },
                ]
              : []),
            { title: "Messages", path: "/teacher/messages", icon: "✉" },
            { title: "Settings", path: "/teacher/settings", icon: "⚙" },
          ]
        : [
            { title: "Overview", path: "/parent/dashboard", icon: "⌂" },
            {
              title: "ECCD Management",
              path: "/parent/eccdassessment",
              icon: "☑",
            },
            {
              title: "Child Information",
              path: "/parent/childinformation",
              icon: "♧",
            },
            { title: "Messages", path: "/parent/messages", icon: "✉" },
          ];
  useEffect(() => {
    if (role === "super-admin") return;
    let mounted = true;
    const refresh = () => {
      void API.get<{ unreadCount: number }>("/api/messages/unread-count")
        .then((res) => {
          if (mounted) setUnread(res.data.unreadCount);
        })
        .catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    window.addEventListener("ames-messages-read", refresh);
    return () => {
      mounted = false;
      clearInterval(timer);
      window.removeEventListener("ames-messages-read", refresh);
    };
  }, [role]);
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-slate-900 px-4 py-3 text-white lg:hidden">
        <button
          aria-label="Open navigation"
          aria-expanded={open}
          className="rounded-lg p-2"
          onClick={() => setOpen(true)}
        >
          ☰
        </button>
        <span className="min-w-0 truncate text-sm font-semibold">
          {settings.school_name || settings.system_title}
        </span>
      </header>
      {open && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 max-w-[85vw] flex-col bg-slate-900 p-4 text-slate-300 transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="mb-6 border-b border-white/10 px-2 pb-5 pt-2 text-center">
          {settings.logo_url ? (
            <img
              className="mx-auto mb-3 size-12 rounded-full bg-white object-cover"
              src={settings.logo_url}
              alt="School logo"
            />
          ) : (
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-blue-600 text-xl text-white">
              A
            </div>
          )}
          <p className="text-sm font-semibold leading-6 text-white">
            {settings.school_name || settings.system_title}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {role === "super-admin"
              ? "Chairman"
              : role === "admin"
                ? "Teacher"
                : "Parent"}{" "}
            Portal
          </p>
        </div>
        <nav className="space-y-1">
          {items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${isActive ? "bg-brand text-white shadow-sm" : "hover:bg-white/10 hover:text-white"}`
              }
            >
              <span aria-hidden className="w-5 text-lg">
                {item.icon}
              </span>
              <span>{item.title}</span>
              {item.title === "Messages" && unread > 0 && (
                <span className="ml-auto rounded-full bg-red-500 px-2 text-xs text-white">
                  {unread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3 pt-6">
          <div className="truncate px-2 text-xs text-slate-400">
            {user?.username}
          </div>
          <Button
            className="w-full bg-red-600 text-white hover:bg-red-700"
            variant="danger"
            onClick={() => void logout()}
          >
            Logout
          </Button>
        </div>
      </aside>
      <main className="min-w-0 p-4 sm:p-6 lg:ml-64 lg:p-8">
        <div className="mx-auto w-full max-w-screen-2xl">
          <div className="mb-6 hidden items-center justify-between text-xs text-slate-500 lg:flex">
            <span>{settings.school_name || settings.system_title}</span>
            <span>School year {settings.current_school_year || "—"}</span>
          </div>
          <SyncStatus />
          <Outlet />
        </div>
      </main>
    </div>
  );
}
