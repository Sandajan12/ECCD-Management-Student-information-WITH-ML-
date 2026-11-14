import { useState } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  createFilterOptions,
} from "@mui/material";
import type { Section, Student } from "../../types";

export type EccdDownloadKind = "records" | "summary";

interface StudentOption {
  id: string;
  label: string;
  search: string;
}

interface EccdDownloadDialogProps {
  kind: EccdDownloadKind;
  section: Section;
  students: Student[];
  currentSchoolYear: string;
  schoolYears: string[];
  initialStudentId: string;
  downloading: boolean;
  onClose: () => void;
  onDownload: (
    path: string,
    fallback: string,
    message: string,
  ) => Promise<string | null>;
}

export default function EccdDownloadDialog({
  kind,
  section,
  students,
  currentSchoolYear,
  schoolYears,
  downloading,
  onClose,
  onDownload,
}: EccdDownloadDialogProps) {
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("all");
  const [error, setError] = useState<string>("");
  const [format, setFormat] = useState<"xlsx" | "pdf">("xlsx");
  const years = [...new Set([currentSchoolYear, ...schoolYears])]
    .filter(Boolean)
    .sort()
    .reverse();
  const schoolYear = selectedYear || currentSchoolYear;
  const isCurrentYear = schoolYear === currentSchoolYear;
  const isSummary = kind === "summary";
  const currentStudents = students.filter(
    (student) =>
      student.section_id === section.section_id &&
      student.school_year === currentSchoolYear &&
      student.is_active,
  );
  const validStudent = currentStudents.some(
    (student) => String(student.student_id) === studentId,
  );
  const studentOptions: StudentOption[] = [
    {
      id: "all",
      label: "All Students in Section (ZIP)",
      search: "All Students in Section (ZIP)",
    },
    ...currentStudents.map((student) => ({
      id: String(student.student_id),
      label: `${student.first_name} ${student.last_name} (${student.masked_lrn})`,
      search: `${student.first_name} ${student.middle_name || ""} ${student.last_name} ${student.masked_lrn} ${student.lrn_number || ""}`,
    })),
  ];
  const canDownload =
    Boolean(currentSchoolYear) &&
    years.includes(schoolYear) &&
    (isSummary || !isCurrentYear || studentId === "all" || validStudent);

  const download = async () => {
    if (!canDownload || downloading) return;
    setError("");
    const params = new URLSearchParams({ school_year: schoolYear });
    if (format === "pdf") params.set("format", format);
    const bulk = !isCurrentYear || studentId === "all";
    const endpoint = isSummary
      ? "section-summary"
      : bulk
        ? "cards-zip"
        : "card-single";
    params.set(
      isSummary || bulk ? "section_id" : "student_id",
      isSummary || bulk ? String(section.section_id) : studentId,
    );
    const downloadError = await onDownload(
      `/api/eccd/export/${endpoint}?${params.toString()}`,
      isSummary
        ? `Section_ECCD_Summary_${schoolYear}.${format}`
        : bulk
          ? `ECCD_Section_${schoolYear}.zip`
          : `ECCD_Assessment_${schoolYear}.${format}`,
      isSummary
        ? "Section summary record downloaded successfully!"
        : bulk
          ? "All section assessments downloaded successfully!"
          : "Assessment checklist downloaded successfully!",
    );
    if (downloadError) setError(downloadError);
    else onClose();
  };

  return (
    <Dialog
      open
      onClose={downloading ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="eccd-records-download-title"
      slotProps={{ paper: { sx: { borderRadius: 3 } } }}
    >
      <DialogTitle id="eccd-records-download-title">
        {isSummary
          ? "Download Section Summary Record"
          : "Download ECCD Records"}
      </DialogTitle>
      <DialogContent>
        <Stack sx={{ pt: 1, gap: 2 }}>
          <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2 }}>
            <FormControl fullWidth size="small" disabled={downloading}>
              <InputLabel id="teacher-export-format-label">
                File Format
              </InputLabel>
              <Select
                labelId="teacher-export-format-label"
                label="File Format"
                value={format}
                onChange={(event) =>
                  setFormat(event.target.value === "pdf" ? "pdf" : "xlsx")
                }
                sx={{ borderRadius: 3 }}
              >
                <MenuItem value="xlsx">Excel (.xlsx)</MenuItem>
                <MenuItem value="pdf">PDF (.pdf)</MenuItem>
              </Select>
            </FormControl>
            <FormControl
              fullWidth
              size="small"
              disabled={downloading || !currentSchoolYear}
            >
              <InputLabel id="teacher-export-year-label">
                School Year
              </InputLabel>
              <Select
                labelId="teacher-export-year-label"
                label="School Year"
                value={years.includes(schoolYear) ? schoolYear : ""}
                onChange={(event) => {
                  setSelectedYear(event.target.value);
                  setStudentId("all");
                  setError("");
                }}
                sx={{ borderRadius: 3 }}
              >
                {years.map((year) => (
                  <MenuItem key={year} value={year}>
                    {year}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
          {!currentSchoolYear && (
            <Alert severity="info" sx={{ borderRadius: 3 }}>
              School year options are unavailable. Try refreshing the page.
            </Alert>
          )}
          {!isSummary && isCurrentYear && currentSchoolYear && (
            <Autocomplete<StudentOption>
              fullWidth
              size="small"
              disabled={downloading}
              options={studentOptions}
              value={
                studentOptions.find((option) => option.id === studentId) || null
              }
              isOptionEqualToValue={(option, value) => option.id === value.id}
              filterOptions={createFilterOptions<StudentOption>({
                stringify: (option) => option.search,
              })}
              onChange={(_, value) => {
                setStudentId(value?.id || "");
                setError("");
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select Student"
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
                />
              )}
            />
          )}
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {isSummary
              ? "Download the consolidated section summary for the selected school year."
              : isCurrentYear
                ? "Select one student's checklist or download all section records as a ZIP."
                : "Download all section checklists for the selected school year."}
          </Typography>
          {!isSummary && !isCurrentYear && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
              <span>
                Archived Cohort: Past school year records are bundled and
                exported as a complete section ZIP archive.
              </span>
            </div>
          )}
          {error && (
            <Alert severity="error" sx={{ borderRadius: 3 }}>
              {error}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1, flexWrap: "wrap" }}>
        <Button
          onClick={onClose}
          disabled={downloading}
          color="inherit"
          sx={{ borderRadius: 3 }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void download()}
          disabled={!canDownload || downloading}
          sx={{ borderRadius: 3 }}
        >
          {downloading
            ? "Downloading..."
            : !isSummary && !isCurrentYear
              ? "Download Section ZIP"
              : "Download"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
