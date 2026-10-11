import { useCallback, useState } from "react";
import type { SetStateAction } from "react";
// Credential inputs are scoped to this tab, rather than persisted in localStorage.
// Remove an exact field only after its request receives a confirmed success.
export function useSessionField<T>(
  key: string,
  initial: T,
): [T, (next: SetStateAction<T>) => void, () => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      return (
        (JSON.parse(sessionStorage.getItem(key) || "null") as T) ?? initial
      );
    } catch {
      return initial;
    }
  });
  const change = useCallback(
    (next: SetStateAction<T>) =>
      setValue((previous) => {
        const resolved =
          typeof next === "function"
            ? (next as (previous: T) => T)(previous)
            : next;
        try {
          sessionStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* Retain in-memory values when tab storage is unavailable. */
        }
        return resolved;
      }),
    [key],
  );
  const confirm = useCallback(() => {
    sessionStorage.removeItem(key);
  }, [key]);
  return [value, change, confirm];
}
