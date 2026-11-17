import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import API, { errorMessage, getSessionUser } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useTeacher } from "../../context/TeacherContext";
import {
  readDraft,
  storeDraft,
  confirmDraft,
  type Draft,
} from "../../utils/drafts";
import type { Domain, Period, Student } from "../../types";
import { PERIODS, PERIOD_LABELS, studentName } from "../../types";

type Decision = "accepted" | "declined";
interface ReviewValues {
  decisions: Record<number, Decision>;
}
function Evidence({ id }: { id: number }) {
  const [photo, setPhoto] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true,
      url = "";
    void API.get<Blob>(`/api/eccd/home-observations/${id}/photo`, {
      responseType: "blob",
    })
      .then((response) => {
        url = URL.createObjectURL(response.data);
        if (active) setPhoto(url);
        else URL.revokeObjectURL(url);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  return error ? (
    <Typography color="text.secondary">Photo unavailable. {error}</Typography>
  ) : photo ? (
    <Box
      component="img"
      src={photo}
      alt="Parent's optional home observation evidence"
      sx={{
        maxWidth: "100%",
        maxHeight: "35vh",
        objectFit: "contain",
        borderRadius: 3,
      }}
    />
  ) : (
    <Typography>Loading photo…</Typography>
  );
}
export default function HomeObservationReview({
  students,
  domains,
  onSaved,
}: {
  students: Student[];
  domains: Domain[];
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const { homeObservations } = useTeacher();
  const { rows, refresh, error: loadError } = homeObservations;
  const [open, setOpen] = useState(false);
  const [student, setStudent] = useState<number | "">("");
  const [period, setPeriod] = useState<Period>("PRE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, redraw] = useState(0);
  const [memoryDrafts, setMemoryDrafts] = useState(
    new Map<string, Draft<ReviewValues>>(),
  );
  const saving = useRef(false);
  const selected =
    students.some((s) => s.student_id === student) &&
    rows.some((r) => r.student_id === student)
      ? student
      : rows.find((r) => students.some((s) => s.student_id === r.student_id))
          ?.student_id;
  const key = `ames_draft_${user?.id}_home_review_${selected}_${period}`;
  const draft = memoryDrafts.get(key) || readDraft<ReviewValues>(key);
  const decisions =
    draft && draft.owner_id === user?.id ? draft.values.decisions : {};
  const choose = (ids: number[], decision: Decision, skipDeclines = false) => {
    if (!user || busy) return;
    const latest = memoryDrafts.get(key) || readDraft<ReviewValues>(key);
    const next = {
      ...(latest?.owner_id === user.id ? latest.values.decisions : {}),
    };
    ids.forEach((id) => {
      if (!(skipDeclines && next[id] === "declined")) next[id] = decision;
    });
    const snapshot = {
      owner_id: user.id,
      values: { decisions: next },
      revision: crypto.randomUUID(),
      is_pending_sync: false,
    };
    storeDraft(key, snapshot);
    setMemoryDrafts((previous) => {
      const next = new Map(previous);
      if (readDraft<ReviewValues>(key)?.revision === snapshot.revision)
        next.delete(key);
      else next.set(key, snapshot);
      return next;
    });
    redraw((v) => v + 1);
  };
  const currentRows = rows.filter(
    (r) => r.student_id === selected && r.testing_period === period,
  );
  const save = async () => {
    const snapshot = memoryDrafts.get(key) || readDraft<ReviewValues>(key);
    if (
      !snapshot ||
      !selected ||
      saving.current ||
      snapshot.owner_id !== user?.id
    )
      return;
    const submitted = currentRows
      .filter((r) => snapshot.values.decisions[r.observation_id])
      .map((r) => ({
        observation_id: r.observation_id,
        status: snapshot.values.decisions[r.observation_id],
      }));
    if (!submitted.length) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      if (getSessionUser()?.id !== snapshot.owner_id)
        throw new Error(
          "Account changed. Your review draft is preserved for its original owner.",
        );
      const response = await API.post<{ cleanup_pending: number }>(
        "/api/eccd/home-observations/review",
        { student_id: selected, decisions: submitted },
      );
      if (![200, 201].includes(response.status))
        throw new Error("Review save was not confirmed.");
      confirmDraft(key, snapshot.revision);
      setMemoryDrafts((previous) => {
        if (previous.get(key)?.revision !== snapshot.revision) return previous;
        const next = new Map(previous);
        next.delete(key);
        return next;
      });
      if (response.data.cleanup_pending)
        setError("Review saved. Photo deletion is queued for retry.");
      await refresh();
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        variant="outlined"
        onClick={() => {
          setOpen(true);
          void refresh();
        }}
        sx={{ borderRadius: 3 }}
      >
        Pending Home-Based Assessments ({rows.length})
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        fullWidth
        maxWidth="md"
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
        aria-labelledby="home-review-title"
      >
        <DialogTitle id="home-review-title">
          Pending Home-Based Assessments
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3}>
            {(error || loadError) && (
              <Alert severity="warning">{error || loadError}</Alert>
            )}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                select
                label="Student"
                value={selected || ""}
                onChange={(e) => setStudent(Number(e.target.value))}
                fullWidth
                disabled={busy}
              >
                {students
                  .filter((s) =>
                    rows.some((r) => r.student_id === s.student_id),
                  )
                  .map((s) => (
                    <MenuItem key={s.student_id} value={s.student_id}>
                      {studentName(s)} · {s.masked_lrn}
                    </MenuItem>
                  ))}
              </TextField>
              <TextField
                select
                label="Period"
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
                fullWidth
                disabled={busy}
              >
                {PERIODS.map((p) => (
                  <MenuItem key={p} value={p}>
                    {PERIOD_LABELS[p]}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <Typography color="text.secondary">
              Accepting an answer does not set an official testing date.
              Optional photos are deleted after saved acceptance or decline.
            </Typography>
            {!currentRows.length && (
              <Typography>
                No pending observations for this selection.
              </Typography>
            )}
            {domains.map((domain) => {
              const questions = [...domain.questions].sort(
                (a, b) => a.sequence_order - b.sequence_order,
              );
              const domainRows = questions.flatMap((q) =>
                currentRows
                  .filter((r) => r.question_id === q.question_id)
                  .map((row) => ({ row, question: q })),
              );
              return domainRows.length ? (
                <Stack key={domain.domain_id} spacing={2}>
                  <Typography component="h3" sx={{ fontWeight: 600 }}>
                    {domain.domain_name}
                  </Typography>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      choose(
                        domainRows.map((r) => r.row.observation_id),
                        "accepted",
                        true,
                      )
                    }
                    sx={{ alignSelf: "flex-start", borderRadius: 3 }}
                  >
                    Accept all in this domain
                  </Button>
                  {domainRows.map(({ row, question }) => (
                    <Stack
                      key={row.observation_id}
                      spacing={2}
                      sx={{ p: 2, borderRadius: 3, bgcolor: "action.hover" }}
                    >
                      <Typography>{question.question_text}</Typography>
                      <Typography>
                        {row.answer} · Submitted{" "}
                        {new Intl.DateTimeFormat("en-PH", {
                          timeZone: "Asia/Manila",
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(row.submitted_at))}
                      </Typography>
                      {row.has_photo && <Evidence id={row.observation_id} />}
                      <Stack
                        direction="row"
                        spacing={2}
                        useFlexGap
                        sx={{ flexWrap: "wrap" }}
                      >
                        {(["accepted", "declined"] as const).map((decision) => (
                          <Button
                            key={decision}
                            disabled={busy}
                            variant={
                              decisions[row.observation_id] === decision
                                ? "contained"
                                : "outlined"
                            }
                            color={
                              decision === "accepted" ? "success" : "warning"
                            }
                            onClick={() =>
                              choose([row.observation_id], decision)
                            }
                            sx={{ borderRadius: 3 }}
                          >
                            {decision === "accepted" ? "Accept" : "Decline"}
                          </Button>
                        ))}
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
              ) : null;
            })}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            disabled={busy}
            onClick={() => setOpen(false)}
            sx={{ borderRadius: 3 }}
          >
            Close
          </Button>
          <Button
            disabled={
              busy || !currentRows.some((r) => decisions[r.observation_id])
            }
            variant="contained"
            onClick={() => void save()}
            sx={{ borderRadius: 3 }}
          >
            {busy ? "Saving…" : "Save Review"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
