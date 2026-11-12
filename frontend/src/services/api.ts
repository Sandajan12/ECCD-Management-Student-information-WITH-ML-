import axios from "axios";
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";
import type { SessionResponse } from "../types";
const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
const API = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  timeout: 60000,
});
export type SessionEndReason = "expired" | "revoked" | "invalid";
interface AuthRequestConfig extends InternalAxiosRequestConfig {
  _authRetry?: boolean;
  _authGeneration?: number;
  _authOwner?: string | null;
  _startedAt?: number;
}
interface AuthErrorData {
  code?: string;
  message?: string;
  detail?: string;
}
let serverClockOffset = 0;
let authGeneration = 0;
let refreshInFlight: Promise<void> | null = null;
let lastRenewalAt = -Infinity;
let refreshRetry: {
  token: string;
  at: number;
  delay: number;
  error: unknown;
} | null = null;

function sessionOwner(): string | null {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null") as {
      id: number;
      role: string;
    } | null;
    return user ? `${user.id}:${user.role}` : null;
  } catch {
    return null;
  }
}

export function accessTokenRemaining(token: string): number {
  try {
    const claims = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: unknown };
    return typeof claims.exp === "number" && Number.isFinite(claims.exp)
      ? claims.exp * 1000 - (Date.now() + serverClockOffset)
      : Number.NaN;
  } catch {
    return Number.NaN;
  }
}
export function saveSession(data: SessionResponse, renewal = false): void {
  refreshRetry = null;
  if (!renewal) {
    authGeneration += 1;
    refreshInFlight = null;
  }
  localStorage.setItem("token", data.access_token || data.token);
  if (data.refresh_token)
    localStorage.setItem("refresh_token", data.refresh_token);
  else localStorage.removeItem("refresh_token");
  localStorage.setItem("user", JSON.stringify(data.user));
  if (data.deviceToken)
    localStorage.setItem("ames_device_token", data.deviceToken);
  window.dispatchEvent(new Event("ames-session-updated"));
}
export function clearSession(): void {
  authGeneration += 1;
  refreshInFlight = null;
  refreshRetry = null;
  for (const key of ["token", "refresh_token", "user", "role"])
    localStorage.removeItem(key);
}
export function proactiveRefreshDelay(token: string): number {
  if (refreshRetry?.token === localStorage.getItem("refresh_token"))
    return Math.max(0, refreshRetry.at - performance.now());
  // Avoid rapid renewal loops if a skewed client cannot read the server Date.
  const remaining = accessTokenRemaining(token);
  return Math.max(
    0,
    Number.isFinite(remaining) ? remaining - 120000 : 0,
    30000 - (performance.now() - lastRenewalAt),
  );
}
export function endSession(reason: SessionEndReason): void {
  window.dispatchEvent(
    new CustomEvent("ames-session-expired", { detail: reason }),
  );
}
function failureReason(error: unknown): SessionEndReason {
  const code = axios.isAxiosError<AuthErrorData>(error)
    ? error.response?.data?.code
    : undefined;
  return code === "SESSION_REVOKED" || code === "ACCOUNT_INACTIVE"
    ? "revoked"
    : code === "TOKEN_EXPIRED"
      ? "expired"
      : "invalid";
}
export function refreshSession(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  const refreshToken = localStorage.getItem("refresh_token");
  const generation = authGeneration;
  if (!refreshToken) {
    endSession("expired");
    return Promise.reject(new Error("No refresh token is available."));
  }
  if (
    refreshRetry?.token === refreshToken &&
    performance.now() < refreshRetry.at
  )
    return Promise.reject(refreshRetry.error);
  if (!navigator.onLine)
    return Promise.reject(
      new axios.AxiosError("Renewal is paused while offline.", "ERR_NETWORK"),
    );
  const pending = (async () => {
    try {
      const response = await API.post<SessionResponse>("/api/auth/refresh", {
        refresh_token: refreshToken,
      });
      // Logout, another login, or a credential replacement wins over a late renewal.
      if (
        generation !== authGeneration ||
        localStorage.getItem("refresh_token") !== refreshToken
      )
        throw new axios.CanceledError("Session changed during renewal.");
      lastRenewalAt = performance.now();
      saveSession(response.data, true);
    } catch (error) {
      if (
        generation === authGeneration &&
        localStorage.getItem("refresh_token") === refreshToken &&
        !axios.isCancel(error)
      ) {
        const status = axios.isAxiosError(error)
          ? error.response?.status
          : undefined;
        if (
          axios.isAxiosError(error) &&
          (!error.response ||
            status === 408 ||
            status === 425 ||
            status === 429 ||
            (status !== undefined && status >= 500 && status < 600))
        ) {
          const delay =
            refreshRetry?.token === refreshToken
              ? Math.min(refreshRetry.delay * 2, 120000)
              : 30000;
          const header = String(error.response?.headers?.["retry-after"] || "");
          const retryAfter = Number(header);
          const responseTime = Date.parse(
            String(error.response?.headers?.date || ""),
          );
          const wait = Number.isFinite(retryAfter)
            ? retryAfter * 1000
            : Date.parse(header) -
              (Number.isFinite(responseTime)
                ? responseTime
                : Date.now() + serverClockOffset);
          refreshRetry = {
            token: refreshToken,
            at:
              performance.now() +
              Math.max(delay, Number.isFinite(wait) ? wait : 0),
            delay,
            error,
          };
          window.dispatchEvent(new Event("ames-session-refresh-deferred"));
        } else endSession(failureReason(error));
      }
      throw error;
    }
  })();
  refreshInFlight = pending;
  void pending
    .finally(() => {
      if (refreshInFlight === pending) refreshInFlight = null;
    })
    .catch(() => {});
  return pending;
}
export function isApiDestination(config: AxiosRequestConfig): boolean {
  try {
    // Resolve exactly what Axios will send, including per-request baseURL
    // overrides and protocol-relative URLs, before attaching a school session.
    const destination = new URL(API.getUri(config), window.location.origin);
    const configured = new URL(apiBaseUrl, window.location.origin);
    return (
      ["http:", "https:"].includes(destination.protocol) &&
      destination.origin === configured.origin &&
      !destination.username &&
      !destination.password
    );
  } catch {
    return false;
  }
}
API.interceptors.request.use((config) => {
  const authConfig = config as AuthRequestConfig;
  authConfig._startedAt = Date.now();
  authConfig._authGeneration ??= authGeneration;
  if (
    authConfig._authRetry &&
    (authConfig._authGeneration !== authGeneration ||
      authConfig._authOwner !== sessionOwner())
  )
    throw new axios.CanceledError("Session changed before retry.");
  authConfig._authOwner = sessionOwner();
  const token = localStorage.getItem("token");
  if (isApiDestination(config)) {
    if (token) config.headers.set("Authorization", `Bearer ${token}`);
    else config.headers.delete("Authorization");
  } else config.headers.delete("Authorization");
  if (
    config.url === "/api/settings/update" &&
    config.data &&
    !(config.data instanceof FormData) &&
    "existing_logo_url" in config.data
  ) {
    const form = new FormData();
    for (const [key, value] of Object.entries(
      config.data as Record<string, unknown>,
    ))
      if (value !== null && value !== undefined)
        form.append(key, String(value));
    config.data = form;
  }
  return config;
});
API.interceptors.response.use(
  (response) => {
    if (isApiDestination(response.config)) {
      const serverTime = Date.parse(String(response.headers.date || ""));
      if (Number.isFinite(serverTime)) {
        const started =
          (response.config as AuthRequestConfig)._startedAt ?? Date.now();
        serverClockOffset = serverTime - (started + Date.now()) / 2;
        window.dispatchEvent(new Event("ames-server-clock-updated"));
      }
    }
    return response;
  },
  async (error: unknown) => {
    if (
      axios.isAxiosError<AuthErrorData>(error) &&
      (error.response?.status === 401 || error.response?.status === 403) &&
      error.config &&
      isApiDestination(error.config) &&
      error.response.data?.message !== "Incorrect current password." &&
      error.response.data?.detail !== "Incorrect current password." &&
      !new URL(
        API.getUri(error.config),
        window.location.origin,
      ).pathname.startsWith("/api/auth/")
    ) {
      const config = error.config as AuthRequestConfig;
      if (
        config._authGeneration !== authGeneration ||
        config._authOwner !== sessionOwner() ||
        !localStorage.getItem("token")
      )
        return Promise.reject(error);
      // Export endpoints may return their authentication JSON as a Blob.
      if (error.response.data instanceof Blob) {
        try {
          error.response.data = JSON.parse(
            await error.response.data.text(),
          ) as AuthErrorData;
        } catch {
          /* Keep an unrecognized authentication response. */
        }
      }
      const code = error.response.data?.code;
      if (error.response.status === 403 && code !== "ACCOUNT_INACTIVE")
        return Promise.reject(error);
      if (
        code === "SESSION_REVOKED" ||
        code === "INVALID_TOKEN" ||
        code === "ACCOUNT_INACTIVE"
      ) {
        // An old in-flight response must not clear a replacement session.
        if (
          config.headers.get("Authorization") ===
          `Bearer ${localStorage.getItem("token")}`
        )
          endSession(failureReason(error));
      } else if (
        !config._authRetry &&
        (code === "TOKEN_EXPIRED" ||
          accessTokenRemaining(
            String(config.headers.get("Authorization") || "").replace(
              /^Bearer /,
              "",
            ),
          ) <= 0)
      ) {
        config._authRetry = true;
        if (
          config.headers.get("Authorization") ===
          `Bearer ${localStorage.getItem("token")}`
        )
          await refreshSession();
        if (
          config._authGeneration !== authGeneration ||
          config._authOwner !== sessionOwner() ||
          !localStorage.getItem("token")
        )
          return Promise.reject(error);
        config.headers.set(
          "Authorization",
          `Bearer ${localStorage.getItem("token")}`,
        );
        return API.request(config);
      } else if (!localStorage.getItem("refresh_token")) {
        endSession(code === "TOKEN_EXPIRED" ? "expired" : "invalid");
      }
    }
    return Promise.reject(error);
  },
);
export function errorMessage(error: unknown): string {
  if (
    axios.isAxiosError<{
      message?: string;
      detail?: string | { msg: string }[];
    }>(error)
  ) {
    if (
      !error.response &&
      ["post", "put", "patch", "delete"].includes(
        error.config?.method?.toLowerCase() || "",
      )
    )
      return "Your draft is saved on this device. Reconnect and submit again.";
    const data = error.response?.data;
    if (Array.isArray(data?.detail))
      return data.detail.map((item) => item.msg).join(" ");
    return (
      data?.message ||
      (typeof data?.detail === "string" ? data.detail : "") ||
      "Cannot reach the server. Your draft has been kept. Please try again."
    );
  }
  return error instanceof Error
    ? error.message
    : "The request could not be completed.";
}
export const isNetworkError = (error: unknown): boolean =>
  axios.isAxiosError(error) && !error.response;
export async function downloadFile(
  path: string,
  fallback: string,
): Promise<string> {
  const res = await API.get<Blob>(path, {
    responseType: "blob",
    timeout: 120000,
  }).catch(async (error: unknown) => {
    // Downloads also return JSON error details. Decode those so backup/export
    // cards show the server's rejection rather than a connection-error message.
    if (
      axios.isAxiosError<unknown>(error) &&
      error.response?.data instanceof Blob
    ) {
      try {
        error.response.data = JSON.parse(
          await error.response.data.text(),
        ) as unknown;
      } catch {
        // Retain the original error when the response is not JSON.
      }
    }
    throw error;
  });
  const disposition = String(res.headers["content-disposition"] || "");
  const filename =
    /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1] ||
    /filename="?([^";]+)"?/i.exec(disposition)?.[1];
  const url = URL.createObjectURL(res.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename ? decodeURIComponent(filename) : fallback;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return link.download;
}
export default API;
