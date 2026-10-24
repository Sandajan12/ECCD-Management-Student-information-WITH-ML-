import axios from "axios";
import type { AxiosRequestConfig } from "axios";
const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
const API = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  timeout: 60000,
});
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
  const token = localStorage.getItem("token");
  if (isApiDestination(config)) {
    if (token) config.headers.set("Authorization", `Bearer ${token}`);
  } else config.headers.delete("Authorization");
  if (
    config.url === "/api/settings/update" &&
    config.data &&
    !(config.data instanceof FormData) &&
    ("existing_logo_url" in config.data ||
      "existing_profile_pic_url" in config.data)
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
  (response) => response,
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      error.config &&
      isApiDestination(error.config) &&
      error.response.data?.message !== "Incorrect current password." &&
      error.response.data?.detail !== "Incorrect current password." &&
      !error.config?.url?.startsWith("/api/auth/")
    )
      window.dispatchEvent(new Event("ames-session-expired"));
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
