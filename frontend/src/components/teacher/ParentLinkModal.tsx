import { useRef, useState } from "react";
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import api, { errorMessage } from "../../services/api";
import type { ParentLinkActionResponse, Student } from "../../types";

interface ParentLinkModalProps {
  student: Student;
  onClose: () => void;
  onUpdated: (student: Student, message: string) => void;
}
type LinkAction =
  "unlink-parent" | "approve-parent-link" | "reject-parent-link";

function displayDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      });
}

export default function ParentLinkModal({
  student,
  onClose,
  onUpdated,
}: ParentLinkModalProps) {
  const parent = student.parent_info;
  const pending = student.parent_link_status === "PENDING";
  const [confirming, setConfirming] = useState<boolean>(false);
  const [busy, setBusy] = useState<LinkAction | null>(null);
  const [error, setError] = useState<string>("");
  const lock = useRef<boolean>(false);
  const name = [student.first_name, student.middle_name, student.last_name]
    .filter(Boolean)
    .join(" ");

  const act = async (action: LinkAction): Promise<void> => {
    if (lock.current || !parent) return;
    lock.current = true;
    setBusy(action);
    setError("");
    try {
      const response = await api.post<ParentLinkActionResponse>(
        `/api/teachers/students/${student.student_id}/${action}`,
        { parent_id: parent.parent_id },
      );
      if (response.status !== 200 || !response.data.success)
        throw new Error(
          "The server did not confirm this change. Please refresh and try again.",
        );
      const approved = action === "approve-parent-link";
      onUpdated(
        {
          ...student,
          parent_link_status: approved ? "SYNCED" : "NONE",
          parent_info: approved
            ? { ...parent, linked_at: new Date().toISOString() }
            : null,
        },
        response.data.message,
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };
  const progress = (action: LinkAction) =>
    busy === action ? (
      <CircularProgress
        size="1rem"
        color="inherit"
        aria-label="Processing parent link"
      />
    ) : undefined;

  return (
    <Dialog
      open
      onClose={() => {
        if (!lock.current) onClose();
      }}
      fullWidth
      maxWidth="sm"
      aria-labelledby="parent-link-title"
      slotProps={{ paper: { sx: { borderRadius: 4 } } }}
    >
      <DialogTitle id="parent-link-title" sx={{ fontWeight: 600 }}>
        {pending ? "Parent Link Request" : "Linked Parent Account"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          <Paper
            elevation={0}
            sx={{ p: 2, borderRadius: 3, bgcolor: "grey.50" }}
          >
            <Stack spacing={0.5}>
              <Typography sx={{ fontWeight: 600 }}>{name}</Typography>
              <Typography variant="body2" color="text.secondary">
                LRN: {student.masked_lrn}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Section: {student.section_name || "—"}
              </Typography>
            </Stack>
          </Paper>
          {pending && (
            <Typography color="text.secondary">
              A parent account is requesting access to view official ECCD
              records for <strong>{name}</strong>:
            </Typography>
          )}
          {parent && (
            <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
              <Stack spacing={2} sx={{ overflowWrap: "anywhere" }}>
                {[
                  [pending ? "Parent Name" : "Full Name", parent.full_name],
                  ["Email Address", parent.email],
                  [
                    pending ? "Declared Relationship" : "Relationship",
                    parent.relationship ||
                      (pending ? "Parent/Guardian" : "Guardian"),
                  ],
                  [
                    pending ? "Date Requested" : "Linked Date",
                    displayDate(
                      pending ? parent.requested_at : parent.linked_at,
                    ),
                  ],
                ].map(([label, value]) => (
                  <Stack spacing={0.5} key={label}>
                    <Typography variant="body2" color="text.secondary">
                      {label}
                    </Typography>
                    <Typography>{value}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Paper>
          )}
          {error && (
            <Alert severity="error" sx={{ borderRadius: 3 }}>
              {error}
            </Alert>
          )}
          {!pending && confirming && parent && (
            <Alert severity="warning" sx={{ borderRadius: 3 }}>
              <Stack spacing={2}>
                <Typography variant="body2">
                  Are you sure you want to unlink{" "}
                  <strong>{parent.full_name}</strong> ({parent.email}) from this
                  student? The parent will immediately lose access to this
                  child&apos;s profile and ECCD assessment records.
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <Button
                    variant="contained"
                    color="error"
                    disabled={busy !== null}
                    startIcon={progress("unlink-parent")}
                    onClick={() => void act("unlink-parent")}
                    sx={{ borderRadius: 3 }}
                  >
                    Yes, Unlink Parent
                  </Button>
                  <Button
                    disabled={busy !== null}
                    onClick={() => setConfirming(false)}
                    sx={{ borderRadius: 3 }}
                  >
                    Cancel
                  </Button>
                </Stack>
              </Stack>
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 3 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ width: "100%", justifyContent: "flex-end" }}
        >
          {pending ? (
            <>
              <Button
                variant="contained"
                color="success"
                disabled={busy !== null}
                startIcon={progress("approve-parent-link")}
                onClick={() => void act("approve-parent-link")}
                sx={{ borderRadius: 3 }}
              >
                Accept Link
              </Button>
              <Button
                variant="outlined"
                color="error"
                disabled={busy !== null}
                startIcon={progress("reject-parent-link")}
                onClick={() => void act("reject-parent-link")}
                sx={{ borderRadius: 3 }}
              >
                Decline
              </Button>
            </>
          ) : (
            !confirming && (
              <Button
                variant="outlined"
                color="error"
                disabled={busy !== null}
                onClick={() => setConfirming(true)}
                sx={{ borderRadius: 3 }}
              >
                Unlink Parent
              </Button>
            )
          )}
          <Button
            disabled={busy !== null}
            onClick={onClose}
            sx={{ borderRadius: 3, color: "text.secondary" }}
          >
            Close
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
