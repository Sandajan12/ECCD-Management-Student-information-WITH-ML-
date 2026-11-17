import { useCallback, useEffect, useRef, useState } from "react";
import { sharedGet } from "../services/sharedGet";
import { errorMessage } from "../services/api";
import type { Answer, Period } from "../types";
import { refreshOnWake } from "./refreshOnWake";

export interface HomeObservation {
  observation_id: number;
  student_id: number;
  question_id: number;
  testing_period: Period;
  answer: Answer;
  submitted_at: string;
  has_photo: boolean;
}

// Owned once by TeacherProvider; badges, dashboard and review share this state.
export function useHomeObservations(owner: number) {
  const [rows, setRows] = useState<HomeObservation[]>([]);
  const [error, setError] = useState("");
  const version = useRef(0);
  const activeOwner = useRef(0);
  const refresh = useCallback(
    async (fresh = true) => {
      if (!owner || activeOwner.current !== owner) return;
      const request = ++version.current;
      try {
        const data = await sharedGet<HomeObservation[]>(
          "/api/eccd/home-observations/pending",
          undefined,
          fresh,
        );
        if (!Array.isArray(data))
          throw new Error("Pending review list could not be loaded.");
        if (request !== version.current) return;
        setRows(data);
        setError("");
      } catch (err) {
        if (request === version.current) setError(errorMessage(err));
      }
    },
    [owner],
  );
  useEffect(() => {
    activeOwner.current = owner;
    setRows([]);
    setError("");
    void refresh(false);
    const stop = refreshOnWake(() => refresh(false));
    return () => {
      activeOwner.current = 0;
      ++version.current;
      stop();
    };
  }, [owner, refresh]);
  return { rows, error, refresh };
}
