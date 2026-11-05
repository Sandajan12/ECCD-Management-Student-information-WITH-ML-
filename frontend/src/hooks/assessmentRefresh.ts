import { isTeacherEccdDraft, listPending } from "../utils/drafts";

// Sync confirms records sequentially. Wait for the queue to settle so a batch
// causes one revalidation, even when confirmations arrive several requests apart.
export function assessmentRefreshScheduler(
  owner: number,
  refresh: () => Promise<void>,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let running = false;
  let queued = false;
  const schedule = () => {
    if (disposed) return;
    queued = true;
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), 200);
  };
  const flush = async () => {
    if (disposed || !queued || running) return;
    if (
      navigator.onLine &&
      listPending(owner).some(
        ({ key, draft }) => isTeacherEccdDraft(key, draft) && !draft.error,
      )
    ) {
      schedule();
      return;
    }
    queued = false;
    running = true;
    try {
      await refresh();
    } finally {
      running = false;
      if (queued) schedule();
    }
  };
  return {
    schedule,
    cancel: () => {
      disposed = true;
      clearTimeout(timer);
    },
  };
}
