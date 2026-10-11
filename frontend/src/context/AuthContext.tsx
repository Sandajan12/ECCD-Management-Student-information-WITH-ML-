import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import API from "../services/api";
import type { SessionResponse, SessionUser } from "../types";
interface AuthState {
  token: string | null;
  user: SessionUser | null;
  login: (data: SessionResponse) => void;
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
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    if (data.deviceToken)
      localStorage.setItem("ames_device_token", data.deviceToken);
    setToken(data.token);
    setUser(data.user);
  }, []);
  const clear = useCallback(() => {
    for (const key of ["token", "user", "role"]) localStorage.removeItem(key);
    setToken(null);
    setUser(null);
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
    const expired = () => {
      clear();
      window.location.assign("/login?session=expired");
    };
    window.addEventListener("ames-session-expired", expired);
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (token) {
      try {
        const claims = JSON.parse(
          atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
        ) as { exp: number };
        timer = setTimeout(
          expired,
          Math.max(0, claims.exp * 1000 - Date.now()),
        );
      } catch {
        expired();
      }
    }
    const storage = (e: StorageEvent) => {
      if (e.key === "token" || e.key === "user") {
        setToken(localStorage.getItem("token"));
        setUser(readUser());
      }
    };
    window.addEventListener("storage", storage);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("ames-session-expired", expired);
      window.removeEventListener("storage", storage);
    };
  }, [token, clear]);
  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is required");
  return value;
}
