import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import API, {
  accessTokenRemaining,
  clearSession,
  endSession,
  proactiveRefreshDelay,
  refreshSession,
  saveSession,
} from "../services/api";
import type { SessionEndReason } from "../services/api";
import type { SessionResponse, SessionUser } from "../types";
interface AuthState {
  token: string | null;
  user: SessionUser | null;
  login: (data: SessionResponse) => void;
  updateUser: (data: SessionUser) => void;
  logout: (forget?: boolean) => Promise<void>;
}
const AuthContext = createContext<AuthState | null>(null);
function readUser(): SessionUser | null {
  try {
    return JSON.parse(
      localStorage.getItem("user") || "null",
    ) as SessionUser | null;
  } catch {
    return null;
  }
}
export function roleHome(role?: string): string {
  return role === "super-admin"
    ? "/super-admin/dashboard"
    : role === "admin"
      ? "/teacher/dashboard"
      : "/parent/dashboard";
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("token"),
  );
  const [user, setUser] = useState<SessionUser | null>(readUser);
  const login = useCallback((data: SessionResponse) => {
    saveSession(data);
    setToken(data.access_token || data.token);
    setUser(data.user);
  }, []);
  const clear = useCallback(() => {
    clearSession();
    setToken(null);
    setUser(null);
  }, []);
  const updateUser = useCallback((data: SessionUser) => {
    if (readUser()?.id !== data.id || !localStorage.getItem("token")) return;
    localStorage.setItem("user", JSON.stringify(data));
    setUser(data);
  }, []);
  const logout = useCallback(
    async (forget = false) => {
      const deviceToken = localStorage.getItem("ames_device_token");
      clear();
      if (forget) localStorage.removeItem("ames_device_token");
      try {
        await API.post(
          "/api/auth/logout",
          { forgetDevice: forget, deviceToken },
          { timeout: 5000 },
        );
      } catch {
        /* Local logout remains available offline. */
      }
    },
    [clear],
  );
  useEffect(() => {
    const expired = (event: Event) => {
      const detail = (event as CustomEvent<SessionEndReason>).detail;
      const reason =
        detail === "expired" || detail === "revoked" ? detail : "invalid";
      clear();
      window.location.assign(`/login?session=${reason}`);
    };
    window.addEventListener("ames-session-expired", expired);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const renew = () => {
      if (disposed || !token || localStorage.getItem("token") !== token) return;
      if (localStorage.getItem("refresh_token"))
        void refreshSession().catch(() => {});
      else
        endSession(
          Number.isFinite(accessTokenRemaining(token)) ? "expired" : "invalid",
        );
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (!token) return;
      if (localStorage.getItem("refresh_token") && !navigator.onLine) return;
      // Legacy sessions without refresh tokens can finish their original lifetime.
      const delay = localStorage.getItem("refresh_token")
        ? proactiveRefreshDelay(token)
        : Math.max(0, accessTokenRemaining(token) || 0);
      timer = setTimeout(renew, delay);
    };
    const wake = () => {
      if (document.visibilityState === "visible") schedule();
    };
    const updated = () => {
      setToken(localStorage.getItem("token"));
      setUser(readUser());
      schedule();
    };
    schedule();
    const storage = (e: StorageEvent) => {
      if (["token", "refresh_token", "user"].includes(e.key || "")) updated();
    };
    window.addEventListener("storage", storage);
    window.addEventListener("ames-session-updated", updated);
    window.addEventListener("ames-server-clock-updated", schedule);
    window.addEventListener("ames-session-refresh-deferred", schedule);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    window.addEventListener("offline", schedule);
    document.addEventListener("visibilitychange", wake);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("ames-session-expired", expired);
      window.removeEventListener("storage", storage);
      window.removeEventListener("ames-session-updated", updated);
      window.removeEventListener("ames-server-clock-updated", schedule);
      window.removeEventListener("ames-session-refresh-deferred", schedule);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", schedule);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [token, clear]);
  return (
    <AuthContext.Provider value={{ token, user, login, updateUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is required");
  return value;
}
