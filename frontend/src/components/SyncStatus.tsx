import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { listPending, syncDrafts } from "../utils/drafts";
import { pendingFiles, syncFiles } from "../utils/fileDrafts";
import { Button, Notice } from "./ui";
export default function SyncStatus() {
  const { user } = useAuth();
  const [online, setOnline] = useState(navigator.onLine);
  const [count, setCount] = useState(0);
  const [storageError, setStorageError] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {
    if (!user) return;
    const refresh = () => {
      const pending = listPending(user.id);
      setCount(pending.length);
      setErrors([
        ...new Set(
          pending
            .map((item) => item.draft.error)
            .filter((error): error is string => !!error),
        ),
      ]);
      void pendingFiles(user.id)
        .then((files) => setCount(pending.length + files.length))
        .catch(() => {});
    };
    const reconnect = () => {
      setOnline(true);
      void syncDrafts(user.id);
      void syncFiles(user.id);
    };
    const offline = () => setOnline(false);
    const storage = (event: Event) =>
      setStorageError((event as CustomEvent<string>).detail);
    refresh();
    void syncDrafts(user.id);
    void syncFiles(user.id);
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", offline);
    window.addEventListener("ames-drafts-changed", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("ames-draft-error", storage);
    return () => {
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", offline);
      window.removeEventListener("ames-drafts-changed", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("ames-draft-error", storage);
    };
  }, [user]);
  if (!storageError && online && !count) return null;
  return (
    <div className="mb-5">
      <Notice tone={storageError ? "error" : "info"}>
        {storageError ||
          (!online
            ? "You are offline. Changes are saved on this device until you reconnect."
            : `${count} saved draft${count === 1 ? "" : "s"} waiting for confirmation. Validation or permission errors stay saved for your review.`)}
        {online && count > 0 && (
          <Button
            className="ml-3"
            variant="secondary"
            onClick={() => {
              if (user) {
                void syncDrafts(user.id);
                void syncFiles(user.id);
              }
            }}
          >
            Retry sync
          </Button>
        )}
      </Notice>
      {errors.map((error) => (
        <div className="mt-2" key={error}>
          <Notice tone="error">{error}</Notice>
        </div>
      ))}
    </div>
  );
}
