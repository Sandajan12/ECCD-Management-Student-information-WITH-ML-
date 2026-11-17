// Focus, visibility and reconnect often arrive together. Never poll while idle.
export function refreshOnWake(refresh: () => void | Promise<unknown>) {
  let lastRefresh = Date.now();
  const wake = () => {
    if (
      !navigator.onLine ||
      document.visibilityState !== "visible" ||
      Date.now() - lastRefresh < 60000
    )
      return;
    lastRefresh = Date.now();
    void Promise.resolve(refresh()).catch(() => {});
  };
  window.addEventListener("focus", wake);
  window.addEventListener("online", wake);
  document.addEventListener("visibilitychange", wake);
  return () => {
    window.removeEventListener("focus", wake);
    window.removeEventListener("online", wake);
    document.removeEventListener("visibilitychange", wake);
  };
}
