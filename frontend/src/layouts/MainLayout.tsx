import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { MessagingProvider, useMessaging } from "../context/MessagingContext";
import SyncStatus from "../components/SyncStatus";
import LegacyRipple from "../components/LegacyRipple";
import LegacyIcon from "../components/LegacyIcon";
import type { LegacyIconName } from "../components/LegacyIcon";
import type { ReactNode } from "react";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
interface NavItem {
  title: string;
  path: string;
  icon: LegacyIconName | "Sparkles";
}
interface MainLayoutProps {
  children?: ReactNode;
}
// Legacy visual source: components/MainLayout.jsx, MUI md = 900px.
export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <MessagingProvider>
      <MainLayoutContent>{children}</MainLayoutContent>
    </MessagingProvider>
  );
}
function MainLayoutContent({ children }: MainLayoutProps) {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const [mobile, setMobile] = useState(() => window.innerWidth < 900);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 899.95px)");
    const resize = () => {
      setMobile(query.matches);
      if (!query.matches) setOpen(false);
    };
    query.addEventListener("change", resize);
    return () => query.removeEventListener("change", resize);
  }, []);
  useEffect(() => {
    if (!open || !mobile) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key !== "Tab") return;
      const elements = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>("a, button") || [],
      );
      const first = elements[0];
      const last = elements.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === drawerRef.current)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keys);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keys);
      previous?.focus();
    };
  }, [open, mobile]);
  const { unread } = useMessaging();
  const role = user?.role;
  const items: NavItem[] =
    role === "super-admin"
      ? [
          {
            title: "Dashboard",
            path: "/super-admin/dashboard",
            icon: "BarChart",
          },
          {
            title: "Teacher Accounts",
            path: "/super-admin/teachers",
            icon: "People",
          },
          {
            title: "Student Records",
            path: "/super-admin/students",
            icon: "ChildCare",
          },
          {
            title: "System Audit Log",
            path: "/super-admin/audit",
            icon: "Accessibility",
          },
          {
            title: "ECCD Questions",
            path: "/super-admin/eccd-questions",
            icon: "Assignment",
          },
          {
            title: "Settings",
            path: "/super-admin/settings",
            icon: "Settings",
          },
        ]
      : role === "admin"
        ? [
            {
              title: "Dashboard",
              path: "/teacher/dashboard",
              icon: "BarChart",
            },
            { title: "My Students",
              path: "/teacher/students",
              icon: "People" },
            {
              title: "Assessments",
              path: "/teacher/eccdassessment",
              icon: "Assignment",
            },
            {
              title: "ML Insights",
              path: "/teacher/ml-insights",
              icon: "Sparkles",
            },

            ...(user?.allow_eccd_question_management
              ? [
                  {
                    title: "ECCD Questions",
                    path: "/teacher/eccd-questions",
                    icon: "Assignment" as const,
                  },
                ]
              : []),
            { title: "Messages", path: "/teacher/messages", icon: "Message" },
            { title: "Settings", path: "/teacher/settings", icon: "Settings" },
          ]
        : [
            { title: "Overview", path: "/parent/dashboard", icon: "Home" },
            {
              title: "ML Insights",
              path: "/parent/ml-insights",
              icon: "Sparkles",
            },
            {
              title: "ECCD Management",
              path: "/parent/eccdassessment",
              icon: "ChildCare",
            },
            {
              title: "Child Information",
              path: "/parent/childinformation",
              icon: "Assignment",
            },
            { title: "Messages", path: "/parent/messages", icon: "Message" },
          ];
  const badge = (item: NavItem, bottom = false) =>
    item.title === "Messages" && unread > 0 ? (
      <span
        className={`absolute top-0 flex h-4 min-w-4 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#d32f2f] px-1.5 text-center text-[0.65rem] leading-none text-white ${bottom ? "right-0 font-medium" : "right-1 font-bold"}`}
      >
        {unread > 99 ? "99+" : unread}
      </span>
    ) : null;
  const drawer = (
    <aside
      ref={drawerRef}
      tabIndex={-1}
      aria-label="Main navigation"
      role={open && mobile ? "dialog" : undefined}
      aria-modal={open && mobile ? true : undefined}
      className={`fixed inset-y-0 left-0 z-[1200] flex w-60 max-w-[80vw] flex-col overflow-y-auto bg-[#111827] p-4 text-white transition-transform duration-225 legacy-md:visible legacy-md:max-w-none legacy-md:translate-x-0 legacy-md:border-r legacy-md:border-black/12 ${mobile && open ? "visible translate-x-0 shadow-[0px_8px_10px_-5px_rgba(0,0,0,0.2),0px_16px_24px_2px_rgba(0,0,0,0.14),0px_6px_30px_5px_rgba(0,0,0,0.12)]" : "invisible -translate-x-full"}`}
    >
      <div>
        <div className="mb-3 flex flex-col items-center border-b border-white/10 pb-3 text-center">
          {settings.logo_url && (
            <img
              src={settings.logo_url}
              alt="System Logo"
              className="mb-2 h-10 w-10 rounded-full border-2 border-white/20 bg-white object-cover shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
            />
          )}
          <p className="line-clamp-2 w-full text-xs font-bold leading-tight tracking-[-0.02em] break-words text-white/90">
            {settings.school_name || "ECCD Management System"}
          </p>
          <p
            className={`mt-1 leading-[1.5] tracking-[0.1px] ${role === "super-admin" || role === "admin" ? "text-base font-bold text-white" : "text-[11px] text-[#94a3b8]"}`}
          >
            {role === "super-admin"
              ? "Chairman Portal"
              : role === "admin"
                ? "Teacher Portal"
                : "Parent Portal"}
          </p>
        </div>
        <nav aria-label="Sidebar">
          {items.map((item) => (
            <div key={item.path} className="mb-1 flex">
              <NavLink
                to={item.path}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `relative group my-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium leading-[1.25] outline-none transition-all duration-150 focus-visible:outline-none ${isActive ? `${role === "super-admin" ? "bg-brand hover:bg-brand focus-visible:bg-brand" : "bg-[#2563eb] hover:bg-[#2563eb] focus-visible:bg-[#2563eb]"} text-white shadow-sm` : "text-[#94a3b8] hover:bg-white/8 focus-visible:bg-black/12"}`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`relative inline-flex shrink-0 ${isActive ? "text-white" : "text-[#9ca3af]"}`}
                    >
                      {item.icon === "Sparkles" ? (
                        <AutoAwesomeRounded className="size-[18px]! shrink-0" />
                      ) : (
                        <LegacyIcon
                          name={item.icon}
                          className="h-[18px] w-[18px] shrink-0"
                        />
                      )}
                      {badge(item)}
                    </span>
                    <span
                      className={isActive ? "text-white" : "text-[#cbd5e1]"}
                    >
                      {item.title}
                    </span>
                    <LegacyRipple />
                  </>
                )}
              </NavLink>
            </div>
          ))}
        </nav>
      </div>
      <div className="mt-auto pt-4">
        <button
          onClick={() => void logout()}
          className="relative flex w-full items-center justify-center gap-2 rounded-xl bg-[#dc2626] px-3 py-2 text-sm leading-[1.75] font-medium text-white outline-none hover:bg-[#b91c1c] focus-visible:bg-[#b91c1c] focus-visible:outline-none"
        >
          <span className="inline-flex shrink-0">
            <LegacyIcon name="Logout" className="h-[18px] w-[18px] shrink-0" />
          </span>
          <span>Logout</span>
          <LegacyRipple />
        </button>
      </div>
    </aside>
  );
  return (
    <div className="flex min-h-screen flex-col font-sans">
      <header className="fixed inset-x-0 top-0 z-[1201] flex h-14 items-center bg-[#111827] px-3 text-white shadow-[0_2px_8px_rgba(0,0,0,0.15)] legacy-sm:px-4 legacy-md:hidden">
        {role !== "user" && (
          <button
            aria-label="Open navigation"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="relative -ml-3 mr-2 grid min-h-11 min-w-11 place-items-center rounded-full p-2 outline-none hover:bg-black/4 [@media(hover:none)]:hover:bg-transparent focus-visible:outline-none"
          >
            <LegacyIcon name="Menu" />
            <LegacyRipple center />
          </button>
        )}
        {role === "user" && settings.logo_url && (
          <img
            src={settings.logo_url}
            alt="School logo"
            className="mr-2 size-8 shrink-0 rounded-full bg-white object-cover"
          />
        )}
        <span className="min-w-0 flex-1 truncate text-sm leading-[1.5] font-bold tracking-[0.2px] legacy-sm:text-base">
          {settings.school_name || "ECCD Management System"}
        </span>
        {role === "user" && (
          <button
            type="button"
            aria-label="Logout"
            title="Logout"
            onClick={() => void logout()}
            className="ml-2 flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:bg-white/20"
          >
            <LegacyIcon name="Logout" className="size-4" />
            <span className="max-[360px]:hidden">Logout</span>
          </button>
        )}
      </header>
      {mobile
        ? role === "user"
          ? null
          : createPortal(
              <>
                {open && (
                  <button
                    aria-label="Close navigation"
                    tabIndex={-1}
                    className="fixed inset-0 z-[1200] bg-black/50 outline-none"
                    onClick={() => setOpen(false)}
                  />
                )}
                {drawer}
              </>,
              document.body,
            )
        : drawer}
      <div className="flex flex-1 pt-14 legacy-md:pt-0">
        <main
          data-layout-content
          aria-hidden={mobile && open ? true : undefined}
          className={`min-w-0 flex-1 p-3 legacy-sm:p-4 legacy-md:ml-60 legacy-md:p-6 ${role === "super-admin" ? "bg-slate-50 overflow-x-clip pb-4 legacy-md:pb-6" : role === "user" ? "bg-[#f9fafb] overflow-x-clip overflow-y-visible legacy-md:h-screen legacy-md:overflow-x-hidden legacy-md:overflow-y-auto pb-[4.75rem] legacy-sm:pb-4 legacy-md:pb-6" : "bg-[#f9fafb] overflow-x-hidden overflow-y-auto pb-4 legacy-md:h-screen legacy-md:pb-6"}`}
        >
          <SyncStatus />
          {children || <Outlet />}
        </main>
      </div>
      {role === "user" && (
        <nav
          aria-label="Parent bottom navigation"
          aria-hidden={mobile && open ? true : undefined}
          className="fixed inset-x-0 bottom-0 z-[1200] flex items-center justify-around border-t border-[#e2e8f0] bg-white px-2 py-1 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] legacy-md:hidden"
        >
          {items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              aria-label={item.title}
              className={({ isActive }) =>
                `flex min-h-11 min-w-[3.375rem] flex-col items-center justify-center rounded-lg border-0 bg-transparent px-1 py-1 outline-none transition-all active:scale-95 focus-visible:outline-none ${isActive ? "text-[#2563eb]" : "text-[#64748b]"}`
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative inline-flex items-center justify-center">
                    {item.icon === "Sparkles" ? (
                      <AutoAwesomeRounded sx={{ fontSize: "1.375rem" }} />
                    ) : (
                      <LegacyIcon name={item.icon} className="size-[22px]" />
                    )}
                    {badge(item, true)}
                  </span>
                  <span
                    className={`mt-1 text-[11px] leading-none ${isActive ? "font-bold" : "font-medium"}`}
                  >
                    {item.title === "Child Information"
                      ? "Child"
                      : item.title === "ECCD Management"
                        ? "ECCD"
                        : item.title}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
