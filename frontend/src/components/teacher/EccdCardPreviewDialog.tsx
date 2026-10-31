import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import api, { errorMessage } from "../../services/api";
import type { Student } from "../../types";

interface EccdCardPreviewDialogProps {
  students: Student[];
  initialStudentId: string;
  onClose: () => void;
}

interface CardPreviewResponse {
  student_id: number;
  html: string;
}

interface PreviewResult {
  studentId: string;
  html?: string;
  error?: string;
}

export default function EccdCardPreviewDialog({
  students,
  initialStudentId,
  onClose,
}: EccdCardPreviewDialogProps) {
  const [studentId, setStudentId] = useState<string>(initialStudentId);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [attempt, setAttempt] = useState<number>(0);
  const eligible = students.some(
    (student) => String(student.student_id) === studentId,
  );
  const current = eligible && result?.studentId === studentId ? result : null;

  useEffect(() => {
    if (!studentId || !eligible) return;
    const controller = new AbortController();
    void api
      .get<CardPreviewResponse>(`/api/eccd/card-preview/${studentId}`, {
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (!controller.signal.aborted) {
          setResult({ studentId, html: data.html });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setResult({ studentId, error: errorMessage(error) });
        }
      });
    return () => controller.abort();
  }, [studentId, eligible, attempt]);

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="xl"
      aria-labelledby="eccd-card-preview-title"
      slotProps={{
        paper: {
          sx: {
            borderRadius: 3,
            m: { xs: 1, sm: 3 },
            width: { xs: "calc(100% - 1rem)", sm: "calc(100% - 3rem)" },
          },
        },
      }}
    >
      <DialogTitle id="eccd-card-preview-title">Preview ECCD Card</DialogTitle>
      <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <FormControl fullWidth size="small">
            <InputLabel id="eccd-preview-student-label">
              Select Student
            </InputLabel>
            <Select
              labelId="eccd-preview-student-label"
              label="Select Student"
              value={eligible ? studentId : ""}
              onChange={(event) => setStudentId(event.target.value)}
              sx={{ borderRadius: 3 }}
            >
              {students.map((student) => (
                <MenuItem
                  key={student.student_id}
                  value={String(student.student_id)}
                >
                  {student.first_name} {student.last_name} ({student.masked_lrn}
                  )
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            This card shows saved records. Save assessment changes to include
            them. Scroll within the preview to review the full card.
          </Typography>
          {!eligible && (
            <Alert severity="info">
              Select a student to preview their ECCD Card.
            </Alert>
          )}
          {eligible && !current && (
            <Stack
              direction="row"
              spacing={2}
              role="status"
              sx={{ py: 3, alignItems: "center" }}
            >
              <CircularProgress size={24} />
              <Typography>Loading ECCD Card...</Typography>
            </Stack>
          )}
          {current?.error && (
            <Alert
              severity="error"
              action={
                <Button
                  color="inherit"
                  onClick={() => {
                    setResult(null);
                    setAttempt((value) => value + 1);
                  }}
                >
                  Retry
                </Button>
              }
            >
              {current.error}
            </Alert>
          )}
          {current?.html && (
            <Box
              component="iframe"
              title="Official ECCD Card"
              sandbox=""
              srcDoc={current.html}
              sx={{
                width: "100%",
                height: "65vh",
                border: 0,
                borderRadius: 3,
                boxShadow: 1,
                bgcolor: "white",
              }}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} sx={{ borderRadius: 3 }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
