import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { isTeacherEccdDraft, listPending, syncDrafts } from "../utils/drafts";
import { pendingFiles } from "../utils/fileDrafts";
import { Button, Notice } from "./ui";
export default function SyncStatus() {
  const { user } = useAuth();
  const [online, setOnline] = useState(navigator.onLine);
  const [count, setCount] = useState(0);
  const [teacherCount, setTeacherCount] = useState(0);
  const [storageError, setStorageError] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    let version = 0;
    const refresh = () => {
      const request = ++version;
      const pending = listPending(user.id);
      setCount(pending.length);
      setTeacherCount(
        user.role === "admin"
          ? pending.filter(({ key, draft }) => isTeacherEccdDraft(key, draft))
              .length
          : 0,
      );
      setErrors([
        ...new Set(
          pending
            .map((item) => item.draft.error)
            .filter((error): error is string => !!error),
        ),
      ]);
      void pendingFiles(user.id)
        .then((files) => {
          if (!active || request !== version) return;
          setCount(pending.length + files.length);
          setErrors([
            ...new Set(
              [
                ...pending.map((item) => item.draft.error),
                ...files.map((item) => item.record.error),
              ].filter((error): error is string => !!error),
            ),
          ]);
        })
        .catch(() => {});
    };
    const reconnect = () => {
      setOnline(true);
      void syncDrafts(user.id);
    };
    const offline = () => setOnline(false);
    const storage = (event: Event) =>
      setStorageError((event as CustomEvent<string>).detail);
    refresh();
    void syncDrafts(user.id);
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", offline);
    window.addEventListener("ames-drafts-changed", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("ames-draft-error", storage);
    return () => {
      active = false;
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
          (teacherCount > 0
            ? `${teacherCount} teacher ECCD submission${teacherCount === 1 ? "" : "s"} awaiting confirmation. Teacher ECCD submissions sync automatically when connected.`
            : !online
              ? "You are offline."
              : "")}
        {!storageError &&
          (count > teacherCount || (!online && !teacherCount)) && (
            <div>
              Your draft is saved on this device. Reconnect and submit again.
            </div>
          )}
        {online && teacherCount > 0 && (
          <Button
            className="ml-3"
            variant="secondary"
            onClick={() => {
              if (user) {
                void syncDrafts(user.id);
              }
            }}
          >
            Retry teacher ECCD sync
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
