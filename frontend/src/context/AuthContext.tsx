import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import API, {
  clearSession,
  getAccessToken,
  getSessionUser,
  proactiveRefreshDelay,
  refreshIsDeferred,
  refreshSession,
  saveSession,
  updateSessionUser,
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
export function roleHome(role?: string): string {
  return role === "super-admin"
    ? "/super-admin/dashboard"
    : role === "admin"
      ? "/teacher/dashboard"
      : "/parent/dashboard";
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(getAccessToken);
  const [user, setUser] = useState<SessionUser | null>(getSessionUser);
  const [loading, setLoading] = useState(true);
  const [deferred, setDeferred] = useState(false);
  const login = useCallback((data: SessionResponse) => saveSession(data), []);
  const updateUser = useCallback(
    (data: SessionUser) => updateSessionUser(data),
    [],
  );
  const logout = useCallback(async (forget = false) => {
    const deviceToken = localStorage.getItem("ames_device_token");
    // An offline logout must not restore its still-present cookie on F5.
    localStorage.setItem("ames_logout_pending", "true");
    clearSession();
    if (forget) localStorage.removeItem("ames_device_token");
    try {
      await API.post(
        "/api/auth/logout",
        { forgetDevice: forget, deviceToken },
        { timeout: 5000 },
      );
      localStorage.removeItem("ames_logout_pending");
    } catch {
      /* Preserve pending logout for the next online page load. */
    }
  }, []);
  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const updated = () => {
      setToken(getAccessToken());
      setUser(getSessionUser());
    };
    const expired = (event: Event) => {
      const detail = (event as CustomEvent<SessionEndReason>).detail;
      const reason =
        detail === "expired" || detail === "revoked" ? detail : "invalid";
      localStorage.setItem("ames_logout_pending", "true");
      clearSession();
      window.location.assign(`/login?session=${reason}`);
    };
    const restore = async () => {
      if (retry) clearTimeout(retry);
      if (localStorage.getItem("ames_logout_pending")) {
        try {
          await API.post("/api/auth/logout");
          localStorage.removeItem("ames_logout_pending");
        } catch {
          /* Login is available; do not restore the old cookie. */
        }
        if (!disposed) setLoading(false);
        return;
      }
      try {
        await refreshSession(true);
        if (!disposed) {
          setLoading(false);
          setDeferred(false);
        }
      } catch {
        if (disposed) return;
        if (getAccessToken()) {
          setLoading(false);
          return;
        }
        if (refreshIsDeferred()) {
          setDeferred(true);
          retry = setTimeout(() => void restore(), 30000);
        } else setLoading(false);
      }
    };
    window.addEventListener("ames-session-updated", updated);
    window.addEventListener("ames-session-expired", expired);
    const reconnect = () => {
      if (!getAccessToken()) void restore();
    };
    window.addEventListener("online", reconnect);
    void restore();
    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      window.removeEventListener("ames-session-updated", updated);
      window.removeEventListener("ames-session-expired", expired);
      window.removeEventListener("online", reconnect);
    };
  }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (!token || !navigator.onLine || getAccessToken() !== token) return;
      timer = setTimeout(
        () => void refreshSession().catch(() => {}),
        proactiveRefreshDelay(token),
      );
    };
    const wake = () => {
      if (document.visibilityState === "visible") schedule();
    };
    schedule();
    window.addEventListener("ames-server-clock-updated", schedule);
    window.addEventListener("ames-session-refresh-deferred", schedule);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    window.addEventListener("offline", schedule);
    document.addEventListener("visibilitychange", wake);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ames-server-clock-updated", schedule);
      window.removeEventListener("ames-session-refresh-deferred", schedule);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", schedule);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [token]);
  return (
    <AuthContext.Provider value={{ token, user, login, updateUser, logout }}>
      {loading ? (
        <Stack
          role="status"
          sx={{
            minHeight: "100dvh",
            alignItems: "center",
            justifyContent: "center",
            p: 3,
            gap: 2,
          }}
        >
          <CircularProgress />
          <Typography color="text.secondary">
            {deferred
              ? "Waiting for a connection to restore your session. Your drafts are safe."
              : "Restoring your session…"}
          </Typography>
          {deferred && (
            <Button
              sx={{ borderRadius: 3 }}
              onClick={() => window.location.reload()}
            >
              Try again
            </Button>
          )}
        </Stack>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}
export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is required");
  return value;
}
