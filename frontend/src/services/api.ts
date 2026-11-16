import axios from "axios";
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";
import type { SessionResponse, SessionUser } from "../types";
const apiBaseUrl = import.meta.env.VITE_API_URL || "https://api.ameskinder.com";
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
  generation: number;
  at: number;
  delay: number;
  error: unknown;
} | null = null;

let accessToken: string | null = null;
let sessionUser: SessionUser | null = null;
export const getAccessToken = (): string | null => accessToken;
export const getSessionUser = (): SessionUser | null => sessionUser;
const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("ames-auth")
    : null;
type AuthMessage =
  | { type: "session"; session: SessionResponse; renewal: boolean }
  | { type: "logout" };
function sessionOwner(): string | null {
  return sessionUser ? `${sessionUser.id}:${sessionUser.role}` : null;
}
function purgeLegacyCredentials(): void {
  for (const storage of [localStorage, sessionStorage])
    for (const key of [
      "token",
      "refresh_token",
      "user",
      "role",
      "ames_device_token",
      "ames_login_remember_device",
      "ames_registration_remember_device",
    ])
      storage.removeItem(key);
}
purgeLegacyCredentials();
channel?.addEventListener("message", (event: MessageEvent<AuthMessage>) => {
  if (event.data.type === "logout") clearSession(false);
  else if (event.data.type === "session") {
    if (
      event.data.renewal &&
      (!accessToken || localStorage.getItem("ames_logout_pending"))
    )
      return;
    saveSession(
      event.data.session,
      event.data.renewal &&
        sessionOwner() ===
          `${event.data.session.user.id}:${event.data.session.user.role}`,
      false,
    );
  }
});
export function updateSessionUser(user: SessionUser): void {
  if (!accessToken || sessionUser?.id !== user.id) return;
  sessionUser = user;
  window.dispatchEvent(new Event("ames-session-updated"));
}
export function refreshIsDeferred(): boolean {
  return refreshRetry !== null || !navigator.onLine;
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
export function saveSession(
  data: SessionResponse,
  renewal = false,
  broadcast = true,
): void {
  refreshRetry = null;
  if (!renewal) {
    authGeneration += 1;
    refreshInFlight = null;
  }
  accessToken = data.access_token || data.token;
  sessionUser = data.user;
  localStorage.removeItem("ames_logout_pending");
  purgeLegacyCredentials();
  window.dispatchEvent(new Event("ames-session-updated"));
  if (broadcast)
    channel?.postMessage({
      type: "session",
      session: data,
      renewal,
    } satisfies AuthMessage);
}
export function clearSession(broadcast = true): void {
  authGeneration += 1;
  refreshInFlight = null;
  refreshRetry = null;
  accessToken = null;
  sessionUser = null;
  purgeLegacyCredentials();
  window.dispatchEvent(new Event("ames-session-updated"));
  if (broadcast) channel?.postMessage({ type: "logout" } satisfies AuthMessage);
}
export function proactiveRefreshDelay(token: string): number {
  if (refreshRetry?.generation === authGeneration)
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
export function refreshSession(bootstrap = false): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  const generation = authGeneration;
  if (
    refreshRetry?.generation === generation &&
    performance.now() < refreshRetry.at
  )
    return Promise.reject(refreshRetry.error);
  if (!navigator.onLine)
    return Promise.reject(
      new axios.AxiosError("Renewal is paused while offline.", "ERR_NETWORK"),
    );
  const pending = (async () => {
    try {
      const response = await API.post<SessionResponse>("/api/auth/refresh");
      // Logout, another login, or a credential replacement wins over a late renewal.
      if (generation !== authGeneration)
        throw new axios.CanceledError("Session changed during renewal.");
      lastRenewalAt = performance.now();
      saveSession(response.data, true);
    } catch (error) {
      if (generation === authGeneration && !axios.isCancel(error)) {
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
            refreshRetry?.generation === generation
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
            generation,
            at:
              performance.now() +
              Math.max(delay, Number.isFinite(wait) ? wait : 0),
            delay,
            error,
          };
          window.dispatchEvent(new Event("ames-session-refresh-deferred"));
        } else if (!bootstrap) endSession(failureReason(error));
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
  const token = getAccessToken();
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
        !getAccessToken()
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
          config.headers.get("Authorization") === `Bearer ${getAccessToken()}`
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
          config.headers.get("Authorization") === `Bearer ${getAccessToken()}`
        )
          await refreshSession();
        if (
          config._authGeneration !== authGeneration ||
          config._authOwner !== sessionOwner() ||
          !getAccessToken()
        )
          return Promise.reject(error);
        config.headers.set("Authorization", `Bearer ${getAccessToken()}`);
        return API.request(config);
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
    const message =
      data?.message || (typeof data?.detail === "string" ? data.detail : "");
    if (error.response?.status === 429) {
      const path = new URL(
        API.getUri(error.config || {}),
        window.location.origin,
      ).pathname.replace(/\/$/, "");
      if (path.startsWith("/api/eccd/parent/home-photos/"))
        return "Photo upload limit reached. Please wait a minute and submit again. Your draft has been kept.";
      if (path === "/api/eccd/parent/evaluate")
        return "Observation submission limit reached. Please wait a minute and submit again. Your draft has been kept.";
      if (
        message.startsWith("Export or backup limit reached") &&
        !/\/(?:backup|export(?:-all|-eccd|-summary)?|download(?:-all)?)(?:\/|$)/.test(
          path,
        )
      )
        return "Too many requests. Please wait and try again. Your draft has been kept.";
    }
    if (Array.isArray(data?.detail))
      return data.detail.map((item) => item.msg).join(" ");
    return (
      message ||
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
