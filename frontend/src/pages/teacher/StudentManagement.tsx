import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  InputAdornment,
  IconButton,
  Alert,
  Avatar,
  LinearProgress,
  Select,
  MenuItem,
  Grid,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import ArchiveIcon from "@mui/icons-material/Archive";
import DeleteIcon from "@mui/icons-material/Delete";
import RestoreIcon from "@mui/icons-material/Restore";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import api, { errorMessage, isNetworkError } from "../../services/api";
import { useSettings } from "../../context/SettingsContext";
import { useAuth } from "../../context/AuthContext";
import { useTeacher } from "../../context/TeacherContext";
import {
  useDurableForm,
  readDraft,
  storeDraft,
  confirmDraft,
} from "../../utils/drafts";
import type { Draft } from "../../utils/drafts";
import { useDurableFile } from "../../utils/fileDrafts";
import { calculateRosterAge } from "../../utils/dateUtils";
import type { ImportResult, Student as PublicStudent } from "../../types";
interface Student extends PublicStudent {
  profile_picture_url?: string;
}
interface StudentFormValues {
  lrn_number: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  date_of_birth: string;
  section_name: string;
  gender: string;
  emergency_contact: string;
  address: string;
  handedness: string;
  num_of_siblings: string;
  birth_order: string;
  father_name: string;
  father_age: string;
  father_occ: string;
  father_educ: string;
  mother_name: string;
  mother_age: string;
  mother_occ: string;
  mother_educ: string;
  legal_guardian_name: string;
  legal_guardian_age: string;
  legal_guardian_occ: string;
  legal_guardian_educ: string;
}
interface StudentPayload extends Omit<
  StudentFormValues,
  | "lrn_number"
  | "section_name"
  | "father_age"
  | "mother_age"
  | "legal_guardian_age"
  | "num_of_siblings"
  | "handedness"
> {
  lrn_number?: string;
  section_id?: number;
  father_age: number | null;
  mother_age: number | null;
  legal_guardian_age: number | null;
  num_of_siblings: number | null;
  handedness: string | null;
}
interface FieldChange {
  target: {
    name?: string;
    value: string;
  };
}
const emptyForm: StudentFormValues = {
  lrn_number: "",
  first_name: "",
  middle_name: "",
  last_name: "",
  date_of_birth: "",
  section_name: "",
  gender: "",
  emergency_contact: "",
  address: "",
  handedness: "",
  num_of_siblings: "",
  birth_order: "",
  father_name: "",
  father_age: "",
  father_occ: "",
  father_educ: "",
  mother_name: "",
  mother_age: "",
  mother_occ: "",
  mother_educ: "",
  legal_guardian_name: "",
  legal_guardian_age: "",
  legal_guardian_occ: "",
  legal_guardian_educ: "",
};
const numberFields = [
  "father_age",
  "mother_age",
  "legal_guardian_age",
  "num_of_siblings",
] as const;
function studentPayload(values: StudentFormValues): StudentPayload {
  const cleaned = Object.fromEntries(
    Object.entries(values)
      .filter(([key]) => key !== "lrn_number" && key !== "section_name")
      .map(([key, value]) => [key, value.trim()]),
  ) as Omit<StudentFormValues, "lrn_number" | "section_name">;
  const numeric = (value: string) => (value.trim() ? Number(value) : null);
  return {
    ...cleaned,
    handedness: cleaned.handedness || null,
    father_age: numeric(values.father_age),
    mother_age: numeric(values.mother_age),
    legal_guardian_age: numeric(values.legal_guardian_age),
    num_of_siblings: numeric(values.num_of_siblings),
  };
}
function validateStudent(
  values: StudentFormValues,
  enrollment = false,
): string {
  if (
    !values.first_name.trim() ||
    !values.last_name.trim() ||
    !values.date_of_birth ||
    !values.gender
  )
    return "First Name, Last Name, Date of Birth, and Gender are required.";
  if (enrollment && !/^\d{12}$/.test(values.lrn_number.trim()))
    return "LRN must contain exactly 12 digits.";
  for (const name of [
    "first_name",
    "middle_name",
    "last_name",
    "father_name",
    "mother_name",
    "legal_guardian_name",
  ] as const) {
    if (
      values[name] &&
      (!/^[\p{L}\p{M} .'-]+$/u.test(values[name]) ||
        !/\p{L}/u.test(values[name]) ||
        values[name].length > 100)
    )
      return "Names may contain only letters, spaces, hyphens, apostrophes and periods (up to 100 characters).";
  }
  if (values.emergency_contact && !/^09\d{9}$/.test(values.emergency_contact))
    return "Contact number must begin with 09 and contain exactly 11 digits.";
  for (const field of numberFields)
    if (
      values[field].trim() &&
      (!Number.isInteger(Number(values[field])) || Number(values[field]) < 0)
    )
      return "Ages and sibling counts must be non-negative whole numbers.";
  if (Number.isNaN(Date.parse(values.date_of_birth)))
    return "Select a valid date of birth.";
  return "";
}
const StudentManagement: React.FC = () => {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { section } = useTeacher();
  const owner = user?.id || 0;
  const teacherClass = section?.section_name || "";
  const [open, setOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmArchiveAllOpen, setConfirmArchiveAllOpen] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [archivedStudents, setArchivedStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");
  const [editError, setEditError] = useState("");
  const [editingLrn, setEditingLrn] = useState(0);
  const editingId = useRef(0);
  const editVersion = useRef(0);
  const submissionLock = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const workbook = useDurableFile("teacher_import");
  const importFile = workbook.file;
  const [importing, setImporting] = useState(false);
  const importLock = useRef(false);
  const [importSummary, setImportSummary] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState("");
  const createForm = useDurableForm(
    "teacher_student_new_" + section?.section_id,
    emptyForm,
  );
  const formData = { ...createForm.values, section_name: teacherClass };
  const [editFormData, setEditFormData] =
    useState<StudentFormValues>(emptyForm);
  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const photoKey = (id: number) =>
    "ames_draft_" + owner + "_teacher_student_photo_" + id;
  const editKey = (id: number) =>
    "ames_draft_" + owner + "_teacher_student_" + id;
  const fetchActiveStudents = useCallback(async () => {
    try {
      const response = await api.get<Student[]>("/api/students/");
      setStudents(response.data);
      try {
        localStorage.setItem(
          "ames_teacher_roster_" + owner,
          JSON.stringify(response.data),
        );
      } catch {
        /* Server data remains usable when device storage is full. */
      }
    } catch (err) {
      if (isNetworkError(err)) {
        try {
          setStudents(
            JSON.parse(
              localStorage.getItem("ames_teacher_roster_" + owner) || "[]",
            ) as Student[],
          );
        } catch {
          /* Keep current records. */
        }
      }
      setError(errorMessage(err));
    }
  }, [owner]);
  const fetchArchivedStudents = useCallback(async () => {
    try {
      const response = await api.get<Student[]>("/api/students/archived");
      setArchivedStudents(response.data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);
  useEffect(() => {
    void fetchActiveStudents();
    const reload = () => {
      void fetchActiveStudents();
      void fetchArchivedStudents();
    };
    window.addEventListener("online", reload);
    window.addEventListener("focus", reload);
    window.addEventListener("ames-record-synced", reload);
    return () => {
      window.removeEventListener("online", reload);
      window.removeEventListener("focus", reload);
      window.removeEventListener("ames-record-synced", reload);
    };
  }, [fetchActiveStudents, fetchArchivedStudents]);
  useEffect(() => {
    const confirmed = (event: Event) => {
      const key = (event as CustomEvent<string>).detail;
      if (key === createForm.key && !readDraft(key)) {
        createForm.change(emptyForm);
        setOpen(false);
      }
      if (key === editKey(editingId.current) && !readDraft(key))
        setEditOpen(false);
    };
    window.addEventListener("ames-record-synced", confirmed);
    return () => window.removeEventListener("ames-record-synced", confirmed);
  }, [createForm.key, createForm.change, owner]);
  useEffect(() => {
    ++editVersion.current;
    editingId.current = 0;
    setEditOpen(false);
  }, [section?.section_id]);
  const handleOpenArchive = () => {
    void fetchArchivedStudents();
    setArchiveOpen(true);
  };
  const handleInputChange = ({ target: { name, value } }: FieldChange) => {
    if (name) createForm.change({ ...formData, [name]: value });
  };
  const handleEditInputChange = ({ target: { name, value } }: FieldChange) => {
    if (!name || detailLoading) return;
    const next = { ...editFormData, [name]: value };
    storeDraft(editKey(editingLrn), {
      owner_id: owner,
      values: next,
      revision: crypto.randomUUID(),
      is_pending_sync: false,
    });
    setEditFormData(next);
  };
  const handleProfileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const id = editingLrn;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== "string") return;
      storeDraft(photoKey(id), {
        owner_id: owner,
        values: { preview: reader.result },
        revision: crypto.randomUUID(),
        is_pending_sync: false,
      });
      if (editingId.current === id) setProfilePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };
  const handleSaveStudent = async () => {
    if (submissionLock.current) return;
    const validation = validateStudent(formData, true);
    if (validation || !section) {
      setError(validation || "An active section assignment is required.");
      return;
    }
    submissionLock.current = true;
    setSubmitting(true);
    setError("");
    try {
      const payload = {
        ...studentPayload(formData),
        lrn_number: formData.lrn_number.trim(),
        section_id: section.section_id,
      };
      if (!navigator.onLine) {
        storeDraft(createForm.key, {
          owner_id: owner,
          values: formData,
          revision: crypto.randomUUID(),
          is_pending_sync: true,
          request: { path: "/api/students/", method: "post", data: payload },
        });
        setError(
          "Saved locally on device. Will automatically sync once reconnected.",
        );
        return;
      }
      const result = await createForm.save("/api/students/", "post", payload);
      if (result === "saved") {
        if (!readDraft(createForm.key)) {
          createForm.change(emptyForm);
          setOpen(false);
        }
        void fetchActiveStudents();
      } else
        setError(
          "Saved locally on device. Will automatically sync once reconnected.",
        );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  };
  const handleEditClick = async (student: Student) => {
    const id = student.student_id;
    const version = ++editVersion.current;
    editingId.current = id;
    setEditingLrn(id);
    setEditError("");
    setEditFormData(
      readDraft<StudentFormValues>(editKey(id))?.values || emptyForm,
    );
    setProfilePreview(
      readDraft<{
        preview: string;
      }>(photoKey(id))?.values.preview || null,
    );
    setEditOpen(true);
    setDetailLoading(true);
    try {
      const cacheKey = "ames_teacher_student_cache_" + owner + "_" + id;
      let data: Student;
      try {
        const response = await api.get<Student>("/api/students/" + id);
        data = response.data;
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch {
          /* Server data remains usable when device storage is full. */
        }
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        const cached = JSON.parse(
          localStorage.getItem(cacheKey) || "null",
        ) as Student | null;
        if (!cached) throw err;
        data = cached;
      }
      if (version !== editVersion.current) return;
      const hydrated = { ...emptyForm };
      for (const field of Object.keys(emptyForm) as (keyof StudentFormValues)[])
        hydrated[field] = String(data[field as keyof Student] ?? "");
      hydrated.lrn_number = data.masked_lrn;
      hydrated.date_of_birth = data.date_of_birth?.split("T")[0] || "";
      setEditFormData(
        readDraft<StudentFormValues>(editKey(id))?.values || hydrated,
      );
      setProfilePreview(
        readDraft<{
          preview: string;
        }>(photoKey(id))?.values.preview ||
          data.profile_picture_url ||
          null,
      );
    } catch (err) {
      if (version === editVersion.current) setEditError(errorMessage(err));
    } finally {
      if (version === editVersion.current) setDetailLoading(false);
    }
  };
  const handleUpdateStudent = async () => {
    if (submissionLock.current || detailLoading) return;
    const validation = validateStudent(editFormData);
    if (validation) {
      setEditError(validation);
      return;
    }
    const key = editKey(editingLrn);
    const draft: Draft<StudentFormValues> = {
      owner_id: owner,
      values: editFormData,
      revision: crypto.randomUUID(),
      is_pending_sync: true,
      request: {
        path: "/api/students/" + editingLrn,
        method: "put",
        data: studentPayload(editFormData),
      },
    };
    storeDraft(key, draft);
    submissionLock.current = true;
    setSubmitting(true);
    setEditError("");
    try {
      if (!navigator.onLine) {
        setEditError(
          "Saved locally on device. Will automatically sync once reconnected.",
        );
        return;
      }
      const response = await api.put(draft.request!.path, draft.request!.data);
      if (response.status !== 200 && response.status !== 201)
        throw new Error("The server did not confirm this save.");
      confirmDraft(key, draft.revision);
      if (editingId.current === editingLrn && !readDraft(key))
        setEditOpen(false);
      void fetchActiveStudents();
    } catch (err) {
      if (isNetworkError(err))
        setEditError(
          "Saved locally on device. Will automatically sync once reconnected.",
        );
      else {
        if (readDraft(key)?.revision === draft.revision)
          storeDraft(key, { ...draft, is_pending_sync: false });
        setEditError(errorMessage(err));
      }
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  };
  const handleArchiveAll = () => setConfirmArchiveAllOpen(true);
  const executeArchiveAll = async () => {
    if (submissionLock.current) return;
    submissionLock.current = true;
    try {
      // The existing bulk endpoint archives every assigned section.
      await api.put("/api/students/archive-all");
      setConfirmArchiveAllOpen(false);
      void fetchActiveStudents();
      void fetchArchivedStudents();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      submissionLock.current = false;
    }
  };
  const statusChange = async (
    id: number,
    action: "archive" | "unarchive" | "delete",
  ) => {
    if (submissionLock.current) return;
    const prompt =
      action === "archive"
        ? "Are you sure you want to archive this student account?"
        : action === "unarchive"
          ? "Do you want to restore this student account to active status?"
          : "WARNING: Are you sure you want to PERMANENTLY delete this account? This action cannot be undone.";
    if (!window.confirm(prompt)) return;
    submissionLock.current = true;
    try {
      if (action === "delete") await api.delete("/api/students/" + id);
      else await api.put("/api/students/" + id + "/" + action);
      void fetchActiveStudents();
      void fetchArchivedStudents();
    } catch (err) {
      window.alert(errorMessage(err));
    } finally {
      submissionLock.current = false;
    }
  };
  const handleArchiveStudent = (id: number) => statusChange(id, "archive");
  const handleUnarchiveStudent = (id: number) => statusChange(id, "unarchive");
  const handleDeleteStudent = (id: number) => statusChange(id, "delete");
  const handleImportFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setImportError("Please select a valid .xlsx file.");
      return;
    }
    workbook.choose(file);
    setImportError("");
  };
  const handleImportSubmit = async () => {
    if (!importFile || importLock.current) return;
    if (!section) {
      setImportError("An active section assignment is required.");
      return;
    }
    importLock.current = true;
    setImporting(true);
    setImportError("");
    try {
      const result = await workbook.upload<ImportResult>(
        "/api/teachers/import-students",
        { section_id: String(section.section_id) },
      );
      if (result) {
        setImportSummary(result);
        setImportOpen(false);
        void fetchActiveStudents();
      } else
        setImportError("Workbook saved locally and queued for reconnection.");
    } catch (err) {
      setImportError(errorMessage(err));
    } finally {
      importLock.current = false;
      setImporting(false);
    }
  };
  const getInitials = (first?: string | null, last?: string | null) =>
    ((first?.charAt(0) || "") + (last?.charAt(0) || "")).toUpperCase();
  const formatStudentName = (student: Student) =>
    `${student.last_name}, ${student.first_name}${student.middle_name?.trim() ? ` ${student.middle_name.trim().charAt(0).toUpperCase()}.` : ""}`;
  const sectionArchives = archivedStudents.filter(
    (student) => student.section_id === section?.section_id,
  );
  const query = searchQuery.trim().toLocaleLowerCase();
  const filteredStudents = students.filter(
    (student) =>
      student.is_active &&
      student.section_id === section?.section_id &&
      [
        student.full_name,
        [student.first_name, student.middle_name, student.last_name]
          .filter(Boolean)
          .join(" "),
        [student.last_name, student.first_name].filter(Boolean).join(", "),
        student.masked_lrn,
      ].some((value) => value?.toLocaleLowerCase().includes(query)),
  );
  return (
    <Box sx={{ p: 1, minHeight: "100vh", position: "relative" }}>
      {/* Header Section */}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          gap: 2,
          justifyContent: "space-between",
          alignItems: "flex-start",
          mb: 3,
        }}
      >
        <Box>
          <Typography
            variant="h4"
            sx={{ fontWeight: "800", color: "#1e1e2f", mb: 0.5 }}
          >
            Manage Students
          </Typography>
          <Typography variant="body1" color="textSecondary">
            View and manage detailed students profile.
          </Typography>
        </Box>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            width: { xs: "100%", md: "500px" },
            maxWidth: "100%",
          }}
        >
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "repeat(2, minmax(0, 1fr))",
                sm: "repeat(4, minmax(0, 1fr))",
              },
              gap: 2,
              width: "100%",
            }}
          >
            <Button
              variant="outlined"
              sx={{
                flex: 1,
                borderRadius: 2,
                textTransform: "none",
                fontWeight: "bold",
                py: 1,
              }}
              onClick={handleOpenArchive}
            >
              View Archive
            </Button>
            <Button
              variant="contained"
              color="warning"
              startIcon={<ArchiveIcon />}
              onClick={handleArchiveAll}
              sx={{
                flex: 1,
                borderRadius: 2,
                textTransform: "none",
                fontWeight: "bold",
                boxShadow: "none",
                py: 1,
              }}
            >
              Archive All
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setError("");
                setOpen(true);
              }}
              sx={{
                flex: 1,
                borderRadius: 2,
                textTransform: "none",
                fontWeight: "bold",
                boxShadow: "none",
                py: 1,
              }}
            >
              Add Student
            </Button>
            <Button
              variant="contained"
              color="secondary"
              onClick={() => {
                setImportError("");
                setImportOpen(true);
              }}
              sx={{
                flex: 1,
                borderRadius: 2,
                textTransform: "none",
                fontWeight: "bold",
                boxShadow: "none",
                py: 1,
              }}
            >
              Import Info Sheet
            </Button>
          </Box>
          <TextField
            placeholder="Search Students"
            variant="outlined"
            size="small"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ bgcolor: "white", borderRadius: 2, width: "100%" }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
                sx: { borderRadius: 2 },
              },
            }}
          />
        </Box>
      </Box>

      {/* Main Table Card */}
      <Paper
        sx={{
          borderRadius: 4,
          overflow: "hidden",
          boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
          mb: 10,
        }}
      >
        <TableContainer>
          <Table>
            <TableHead sx={{ bgcolor: "#fbfbfb" }}>
              <TableRow>
                <TableCell
                  sx={{ fontWeight: "bold", color: "text.secondary", py: 2 }}
                >
                  STUDENT NAME
                </TableCell>
                <TableCell sx={{ fontWeight: "bold", color: "text.secondary" }}>
                  AGE
                </TableCell>
                <TableCell sx={{ fontWeight: "bold", color: "text.secondary" }}>
                  PARENT GUARDIAN
                </TableCell>
                <TableCell sx={{ fontWeight: "bold", color: "text.secondary" }}>
                  PROGRESS
                </TableCell>
                <TableCell sx={{ fontWeight: "bold", color: "text.secondary" }}>
                  ACTION
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredStudents.map((student) => {
                const studentId = student.student_id;
                return (
                  <TableRow
                    key={studentId}
                    hover
                    sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                  >
                    <TableCell
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                        py: 2,
                      }}
                    >
                      <Avatar
                        sx={{
                          bgcolor: "transparent",
                          border: "1px solid #ccc",
                          color: "#555",
                          width: 40,
                          height: 40,
                        }}
                        src={student.profile_picture_url || ""}
                      >
                        {getInitials(student.first_name, student.last_name)}
                      </Avatar>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: "bold",
                          color: "#333",
                          textTransform: "uppercase",
                        }}
                      >
                        {formatStudentName(student)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {calculateRosterAge(
                        student.date_of_birth,
                        student.school_year || settings?.current_school_year,
                        settings?.school_year_start_month || 8,
                      ) !== "N/A"
                        ? calculateRosterAge(
                            student.date_of_birth,
                            student.school_year ||
                              settings?.current_school_year,
                            settings?.school_year_start_month || 8,
                          )
                        : student.decimal_age
                          ? `${student.decimal_age} yrs`
                          : "N/A"}
                    </TableCell>
                    <TableCell sx={{ textTransform: "uppercase" }}>
                      {student.parent_names || "N/A"}
                    </TableCell>
                    <TableCell>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          width: 120,
                        }}
                      >
                        <LinearProgress
                          variant="determinate"
                          value={student.profile_completeness || 0}
                          color="success"
                          sx={{
                            height: 8,
                            borderRadius: 4,
                            flexGrow: 1,
                            bgcolor: "#e0e0e0",
                          }}
                        />
                        <Typography
                          variant="caption"
                          color="textSecondary"
                          sx={{
                            fontWeight: "bold",
                          }}
                        >
                          {student.profile_completeness || 0}%
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell
                      sx={{ display: "flex", gap: 1, alignItems: "center" }}
                    >
                      <IconButton
                        onClick={() => handleEditClick(student)}
                        color="primary"
                        title="Edit Student"
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        onClick={() => handleArchiveStudent(studentId)}
                        color="warning"
                        title="Archive Student"
                      >
                        <ArchiveIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredStudents.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    align="center"
                    sx={{ py: 6, color: "text.secondary" }}
                  >
                    No active students found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* ----------- EDIT STUDENT MODAL ----------- */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        maxWidth="lg"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              bgcolor: "#f4f5f7",
              borderRadius: 4,
              p: 2,
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
            },
          },
        }}
      >
        <DialogContent sx={{ p: 0, overflowY: "visible" }}>
          {editError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {editError}
            </Alert>
          )}

          <Box
            component="form"
            sx={{
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              gap: 3,
            }}
          >
            {/* === LEFT CARD: Profile Data === */}
            <Paper
              sx={{
                flex: 1,
                borderRadius: 4,
                p: 4,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                boxShadow: "0 4px 15px rgba(0,0,0,0.05)",
              }}
            >
              <Box sx={{ position: "relative", mb: 2 }}>
                <Avatar
                  src={profilePreview || ""}
                  sx={{
                    width: 100,
                    height: 100,
                    boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
                    border: "4px solid white",
                    bgcolor: "primary.light",
                    fontSize: "2.5rem",
                  }}
                >
                  {getInitials(editFormData.first_name, editFormData.last_name)}
                </Avatar>
                <IconButton
                  color="primary"
                  component="label"
                  sx={{
                    position: "absolute",
                    bottom: -5,
                    right: -5,
                    bgcolor: "white",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    "&:hover": { bgcolor: "#f9f9f9" },
                    width: 35,
                    height: 35,
                  }}
                >
                  <input
                    hidden
                    accept="image/*"
                    type="file"
                    onChange={handleProfileChange}
                  />
                  <PhotoCameraOutlinedIcon fontSize="small" />
                </IconButton>
              </Box>

              <Grid container spacing={1.5} sx={{ mb: 3 }}>
                <Grid size={{ xs: 12 }}>
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    sx={{
                      fontWeight: "bold",
                    }}
                  >
                    First Name
                  </Typography>
                  <TextField
                    fullWidth
                    name="first_name"
                    value={editFormData.first_name}
                    onChange={handleEditInputChange}
                    size="small"
                    variant="outlined"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: "#f9fafb",
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    sx={{
                      fontWeight: "bold",
                    }}
                  >
                    Middle Name
                  </Typography>
                  <TextField
                    fullWidth
                    name="middle_name"
                    value={editFormData.middle_name}
                    onChange={handleEditInputChange}
                    size="small"
                    variant="outlined"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: "#f9fafb",
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    sx={{
                      fontWeight: "bold",
                    }}
                  >
                    Last Name
                  </Typography>
                  <TextField
                    fullWidth
                    name="last_name"
                    value={editFormData.last_name}
                    onChange={handleEditInputChange}
                    size="small"
                    variant="outlined"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: "#f9fafb",
                      },
                    }}
                  />
                </Grid>
              </Grid>

              <Typography
                variant="caption"
                color="textSecondary"
                sx={{ mb: 1 }}
              >
                LRN: {editFormData.lrn_number}
              </Typography>

              <Box sx={{ width: "100%", mb: 2 }}>
                <Typography
                  variant="caption"
                  color="textSecondary"
                  sx={{
                    fontWeight: "bold",
                  }}
                >
                  School
                </Typography>
                <TextField
                  fullWidth
                  value={
                    settings?.school_name ||
                    "Apolinario Mabini Elementary School"
                  }
                  size="small"
                  disabled
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: "#f4f5f7",
                    },
                  }}
                />
              </Box>
              <Box sx={{ width: "100%", mb: 2 }}>
                <Typography
                  variant="caption"
                  color="textSecondary"
                  sx={{
                    fontWeight: "bold",
                  }}
                >
                  Section (Auto-Assigned)
                </Typography>
                <TextField
                  fullWidth
                  name="section_name"
                  value={editFormData.section_name}
                  size="small"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: "#f0f0f0",
                    },
                  }}
                  slotProps={{
                    input: { readOnly: true },
                  }}
                />
              </Box>

              <Box sx={{ width: "100%", mb: 2 }}>
                <Typography
                  variant="caption"
                  color="textSecondary"
                  sx={{
                    fontWeight: "bold",
                  }}
                >
                  Teacher
                </Typography>
                <TextField
                  fullWidth
                  value={
                    section
                      ? [section.first_name, section.last_name]
                          .filter(Boolean)
                          .join(" ") || user?.username
                      : user?.username
                  }
                  size="small"
                  disabled
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: "#f4f5f7",
                    },
                  }}
                />
              </Box>

              <Grid container spacing={2} sx={{ mb: 2, width: "100%" }}>
                <Grid size={{ xs: 6 }}>
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    sx={{
                      fontWeight: "bold",
                    }}
                  >
                    Gender
                  </Typography>
                  <Select
                    fullWidth
                    name="gender"
                    value={editFormData.gender}
                    onChange={handleEditInputChange}
                    size="small"
                    sx={{ borderRadius: 2, bgcolor: "#f9fafb" }}
                  >
                    <MenuItem value="Male">Male</MenuItem>
                    <MenuItem value="Female">Female</MenuItem>
                  </Select>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    sx={{
                      fontWeight: "bold",
                    }}
                  >
                    Age
                  </Typography>
                  <TextField
                    fullWidth
                    value={(() => {
                      const currentStudent = students.find(
                        (s) => s.student_id === editingLrn,
                      );
                      const dob =
                        editFormData.date_of_birth ||
                        currentStudent?.date_of_birth;
                      const sy =
                        currentStudent?.school_year ||
                        settings?.current_school_year;
                      const rosterAge = calculateRosterAge(
                        dob,
                        sy,
                        settings?.school_year_start_month || 8,
                      );
                      return rosterAge !== "N/A"
                        ? rosterAge
                        : currentStudent?.decimal_age
                          ? `${currentStudent.decimal_age} yrs`
                          : "";
                    })()}
                    size="small"
                    disabled
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: "#f4f5f7",
                      },
                    }}
                  />
                </Grid>
              </Grid>

              <Box sx={{ width: "100%", mb: 1 }}>
                <Typography
                  variant="caption"
                  color="textSecondary"
                  sx={{
                    fontWeight: "bold",
                  }}
                >
                  Emergency Contact Number
                </Typography>
                <TextField
                  fullWidth
                  name="emergency_contact"
                  type="tel"
                  value={editFormData.emergency_contact}
                  onChange={handleEditInputChange}
                  size="small"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: "#f9fafb",
                    },
                  }}
                />
              </Box>
            </Paper>

            {/* === RIGHT CARD: Family Background & Details === */}
            <Paper
              sx={{
                flex: 1.8,
                borderRadius: 4,
                p: 4,
                boxShadow: "0 4px 15px rgba(0,0,0,0.05)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}
              >
                <PeopleAltOutlinedIcon color="action" />
                <Typography
                  variant="h6"
                  sx={{ fontWeight: "800", color: "#333" }}
                >
                  Family Background & Details
                </Typography>
              </Box>

              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid size={{ xs: 12 }}>
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    sx={{
                      fontWeight: "bold",
                    }}
                  >
                    Home Address
                  </Typography>
                  <TextField
                    fullWidth
                    name="address"
                    value={editFormData.address}
                    onChange={handleEditInputChange}
                    size="small"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: "#f9fafb",
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    sx={{
                      fontWeight: "bold",
                    }}
                  >
                    Handedness
                  </Typography>
                  <Select
                    fullWidth
                    name="handedness"
                    value={editFormData.handedness}
                    onChange={handleEditInputChange}
                    size="small"
                    sx={{ borderRadius: 2, bgcolor: "#f9fafb" }}
                  >
                    <MenuItem value="Right">Right</MenuItem>
                    <MenuItem value="Left">Left</MenuItem>
                  </Select>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    sx={{
                      fontWeight: "bold",
                    }}
                  >
                    Birth Date
                  </Typography>
                  <TextField
                    fullWidth
                    name="date_of_birth"
                    type="date"
                    value={editFormData.date_of_birth}
                    onChange={handleEditInputChange}
                    size="small"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: "#f9fafb",
                      },
                    }}
                    slotProps={{
                      inputLabel: { shrink: true },
                    }}
                  />
                </Grid>
              </Grid>

              <Box
                sx={{
                  border: "1px solid #e0e0e0",
                  borderRadius: 3,
                  p: 2,
                  mb: 2,
                }}
              >
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6 }}>
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      sx={{
                        fontWeight: "bold",
                      }}
                    >
                      Father's Full Name
                    </Typography>
                    <TextField
                      fullWidth
                      name="father_name"
                      value={editFormData.father_name}
                      onChange={handleEditInputChange}
                      size="small"
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          borderRadius: 2,
                          bgcolor: "#f9fafb",
                        },
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      sx={{
                        fontWeight: "bold",
                      }}
                    >
                      Age
                    </Typography>
                    <TextField
                      fullWidth
                      name="father_age"
                      value={editFormData.father_age}
                      onChange={handleEditInputChange}
                      size="small"
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          borderRadius: 2,
                          bgcolor: "#f9fafb",
                        },
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      sx={{
                        fontWeight: "bold",
                      }}
                    >
                      Occupation
                    </Typography>
                    <TextField
                      fullWidth
                      name="father_occ"
                      value={editFormData.father_occ}
                      onChange={handleEditInputChange}
                      size="small"
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          borderRadius: 2,
                          bgcolor: "#f9fafb",
                        },
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      sx={{
                        fontWeight: "bold",
                      }}
                    >
                      Educational Attainment
                    </Typography>
                    <TextField
                      fullWidth
                      name="father_educ"
                      value={editFormData.father_educ}
                      onChange={handleEditInputChange}
                      size="small"
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          borderRadius: 2,
                          bgcolor: "#f9fafb",
                        },
                      }}
                    />
                  </Grid>
                </Grid>
              </Box>

              <Box
                sx={{
                  border: "1px solid #e0e0e0",
                  borderRadius: 3,
                  p: 2,
                  mb: 3,
                }}
              >
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6 }}>
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      sx={{
                        fontWeight: "bold",
                      }}
                    >
                      Mother's Full Name
                    </Typography>
                    <TextField
                      fullWidth
                      name="mother_name"
                      value={editFormData.mother_name}
                      onChange={handleEditInputChange}
                      size="small"
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          borderRadius: 2,
                          bgcolor: "#f9fafb",
                        },
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      sx={{
                        fontWeight: "bold",
                      }}
                    >
                      Age
                    </Typography>
                    <TextField
                      fullWidth
                      name="mother_age"
                      value={editFormData.mother_age}
                      onChange={handleEditInputChange}
                      size="small"
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          borderRadius: 2,
                          bgcolor: "#f9fafb",
                        },
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      sx={{
                        fontWeight: "bold",
                      }}
                    >
                      Occupation
                    </Typography>
                    <TextField
                      fullWidth
                      name="mother_occ"
                      value={editFormData.mother_occ}
                      onChange={handleEditInputChange}
                      size="small"
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          borderRadius: 2,
                          bgcolor: "#f9fafb",
                        },
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      sx={{
                        fontWeight: "bold",
                      }}
                    >
                      Educational Attainment
                    </Typography>
                    <TextField
                      fullWidth
                      name="mother_educ"
                      value={editFormData.mother_educ}
                      onChange={handleEditInputChange}
                      size="small"
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          borderRadius: 2,
                          bgcolor: "#f9fafb",
                        },
                      }}
                    />
                  </Grid>
                </Grid>
              </Box>

              <Box
                sx={{
                  border: "1px solid #e0e0e0",
                  borderRadius: 3,
                  p: 2,
                  mb: 3,
                }}
              >
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12 }}>
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      sx={{
                        fontWeight: "bold",
                      }}
                    >
                      Legal Guardian's Full Name
                    </Typography>
                    <TextField
                      fullWidth
                      name="legal_guardian_name"
                      value={editFormData.legal_guardian_name}
                      onChange={handleEditInputChange}
                      size="small"
                      placeholder="Name of guardian if not parents"
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          borderRadius: 2,
                          bgcolor: "#f9fafb",
                        },
                      }}
                    />
                  </Grid>
                </Grid>
              </Box>

              <Grid container spacing={2} sx={{ mb: 4 }}>
                <Grid size={{ xs: 6 }}>
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    sx={{
                      fontWeight: "bold",
                    }}
                  >
                    No. of siblings
                  </Typography>
                  <TextField
                    fullWidth
                    name="num_of_siblings"
                    type="number"
                    value={editFormData.num_of_siblings}
                    onChange={handleEditInputChange}
                    size="small"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: "#f9fafb",
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    sx={{
                      fontWeight: "bold",
                    }}
                  >
                    Pang-ilan sa mag kakapatid
                  </Typography>
                  <TextField
                    fullWidth
                    name="birth_order"
                    value={editFormData.birth_order}
                    onChange={handleEditInputChange}
                    size="small"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: "#f9fafb",
                      },
                    }}
                  />
                </Grid>
              </Grid>

              <Box
                sx={{
                  display: "flex",
                  gap: 2,
                  mt: "auto",
                  justifyContent: "space-between",
                }}
              >
                <Box sx={{ display: "flex", gap: 2 }}></Box>

                <Box sx={{ display: "flex", gap: 2 }}>
                  <Button
                    onClick={() => setEditOpen(false)}
                    sx={{
                      color: "text.secondary",
                      textTransform: "none",
                      fontWeight: "bold",
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleUpdateStudent}
                    disabled={submitting || detailLoading}
                    variant="contained"
                    color="success"
                    sx={{
                      borderRadius: 2,
                      textTransform: "none",
                      fontWeight: "bold",
                      px: 4,
                      boxShadow: "0 4px 10px rgba(76, 175, 80, 0.3)",
                    }}
                  >
                    Save Changes
                  </Button>
                </Box>
              </Box>
            </Paper>
          </Box>
        </DialogContent>
      </Dialog>

      {/* ----------- ADD STUDENT MODAL ----------- */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="md"
        slotProps={{
          paper: { sx: { borderRadius: 4, p: 2 } },
        }}
      >
        <DialogTitle
          sx={{
            fontWeight: "900",
            textAlign: "center",
            fontSize: "1.5rem",
            pb: 1,
          }}
        >
          New Student
        </DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mt: 1, mb: 2, borderRadius: 2 }}>
              {error}
            </Alert>
          )}
          <Box
            component="form"
            sx={{
              mt: 2,
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" },
              gap: 3,
            }}
          >
            <Box sx={{ gridColumn: { xs: "span 1", sm: "span 2" } }}>
              <Typography
                variant="caption"
                color="textSecondary"
                sx={{
                  fontWeight: "bold",
                }}
              >
                First Name
              </Typography>
              <TextField
                fullWidth
                name="first_name"
                placeholder="First Name"
                value={formData.first_name}
                onChange={handleInputChange}
                variant="outlined"
                size="small"
                sx={{ mt: 1 }}
              />
            </Box>
            <Box>
              <Typography
                variant="caption"
                color="textSecondary"
                sx={{
                  fontWeight: "bold",
                }}
              >
                Middle Name
              </Typography>
              <TextField
                fullWidth
                name="middle_name"
                placeholder="Middle Name"
                value={formData.middle_name}
                onChange={handleInputChange}
                variant="outlined"
                size="small"
                sx={{ mt: 1 }}
              />
            </Box>
            <Box>
              <Typography
                variant="caption"
                color="textSecondary"
                sx={{
                  fontWeight: "bold",
                }}
              >
                Last Name
              </Typography>
              <TextField
                fullWidth
                name="last_name"
                placeholder="Last Name"
                value={formData.last_name}
                onChange={handleInputChange}
                variant="outlined"
                size="small"
                sx={{ mt: 1 }}
              />
            </Box>
            <Box>
              <Typography
                variant="caption"
                color="textSecondary"
                sx={{
                  fontWeight: "bold",
                }}
              >
                Date of Birth
              </Typography>
              <TextField
                fullWidth
                name="date_of_birth"
                type="date"
                value={formData.date_of_birth}
                onChange={handleInputChange}
                variant="outlined"
                size="small"
                sx={{ mt: 1 }}
                slotProps={{
                  inputLabel: { shrink: true },
                }}
              />
            </Box>
            <Box>
              <Typography
                variant="caption"
                color="textSecondary"
                sx={{
                  fontWeight: "bold",
                }}
              >
                LRN
              </Typography>
              <TextField
                fullWidth
                name="lrn_number"
                placeholder="LRN"
                value={formData.lrn_number}
                onChange={handleInputChange}
                variant="outlined"
                size="small"
                sx={{ mt: 1 }}
              />
            </Box>
            <Box>
              <Typography
                variant="caption"
                color="textSecondary"
                sx={{
                  fontWeight: "bold",
                }}
              >
                Section (Auto-Assigned)
              </Typography>
              <TextField
                fullWidth
                name="section_name"
                placeholder="Section"
                value={formData.section_name}
                variant="outlined"
                size="small"
                sx={{ mt: 1, bgcolor: "#f0f0f0" }}
                slotProps={{
                  input: { readOnly: true },
                }}
              />
            </Box>
            <Box>
              <Typography
                variant="caption"
                color="textSecondary"
                sx={{
                  fontWeight: "bold",
                }}
              >
                Gender
              </Typography>
              <Select
                fullWidth
                name="gender"
                value={formData.gender}
                onChange={handleInputChange}
                size="small"
                sx={{ mt: 1 }}
              >
                <MenuItem value="Male">Male</MenuItem>
                <MenuItem value="Female">Female</MenuItem>
              </Select>
            </Box>
            <Box sx={{ gridColumn: { xs: "span 1", sm: "span 2" } }}>
              <Typography
                variant="caption"
                color="textSecondary"
                sx={{
                  fontWeight: "bold",
                }}
              >
                Emergency Contact Number
              </Typography>
              <TextField
                fullWidth
                name="emergency_contact"
                type="tel"
                placeholder="Emergency Contact Number"
                value={formData.emergency_contact}
                onChange={handleInputChange}
                variant="outlined"
                size="small"
                sx={{ mt: 1 }}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, justifyContent: "center" }}>
          <Button
            onClick={() => setOpen(false)}
            sx={{
              color: "text.secondary",
              textTransform: "none",
              fontWeight: "bold",
              mr: 2,
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveStudent}
            disabled={submitting}
            variant="contained"
            sx={{
              px: 5,
              py: 1,
              borderRadius: 2,
              textTransform: "none",
              fontWeight: "bold",
              boxShadow: "0 4px 10px rgba(85, 105, 255, 0.3)",
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* ----------- ARCHIVED STUDENTS MODAL ----------- */}
      <Dialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        maxWidth="md"
        fullWidth
        slotProps={{
          paper: { sx: { borderRadius: 4, p: 0 } },
        }}
      >
        <DialogTitle sx={{ fontWeight: "bold", bgcolor: "#f4f5f7" }}>
          Archived Students
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <TableContainer>
            <Table>
              <TableHead sx={{ backgroundColor: "#f9f9f9" }}>
                <TableRow>
                  <TableCell
                    sx={{ fontWeight: "bold", color: "text.secondary" }}
                  >
                    STUDENT NAME
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: "bold", color: "text.secondary" }}
                  >
                    AGE
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: "bold", color: "text.secondary" }}
                  >
                    PARENT GUARDIAN
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: "bold", color: "text.secondary" }}
                  >
                    SCHOOL YEAR
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: "bold", color: "text.secondary" }}
                  >
                    ACTION
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sectionArchives.map((student) => {
                  const studentId = student.student_id;
                  return (
                    <TableRow key={`archived-${studentId}`}>
                      <TableCell sx={{ textTransform: "uppercase" }}>
                        {formatStudentName(student)}
                      </TableCell>
                      <TableCell>
                        {calculateRosterAge(
                          student.date_of_birth,
                          student.school_year || settings?.current_school_year,
                          settings?.school_year_start_month || 8,
                        ) !== "N/A"
                          ? calculateRosterAge(
                              student.date_of_birth,
                              student.school_year ||
                                settings?.current_school_year,
                              settings?.school_year_start_month || 8,
                            )
                          : student.decimal_age
                            ? `${student.decimal_age} yrs`
                            : "N/A"}
                      </TableCell>
                      <TableCell sx={{ textTransform: "uppercase" }}>
                        {student.parent_names || "N/A"}
                      </TableCell>
                      <TableCell>{student.school_year || "N/A"}</TableCell>
                      <TableCell
                        sx={{ display: "flex", gap: 1, alignItems: "center" }}
                      >
                        <IconButton
                          onClick={() => handleUnarchiveStudent(studentId)}
                          color="success"
                          title="Restore Student"
                        >
                          <RestoreIcon />
                        </IconButton>
                        <IconButton
                          onClick={() => handleDeleteStudent(studentId)}
                          color="error"
                          title="Permanently Delete Student"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {sectionArchives.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      align="center"
                      sx={{ py: 4, color: "text.secondary" }}
                    >
                      No archived students found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setArchiveOpen(false)}
            variant="contained"
            sx={{ textTransform: "none" }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* ----------- CONFIRM ARCHIVE ALL MODAL ----------- */}
      <Dialog
        open={confirmArchiveAllOpen}
        onClose={() => setConfirmArchiveAllOpen(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{
          paper: { sx: { borderRadius: 4, p: 2 } },
        }}
      >
        <DialogTitle
          sx={{
            fontWeight: "bold",
            color: "#ed6c02",
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <ArchiveIcon /> Confirm Mass Archive
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mt: 1 }}>
            {"Are you sure you want to archive "}
            <strong>all active students</strong> for this school year?
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
            This action will move all your current students to the archive. You
            can restore them later from the archive view if needed.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setConfirmArchiveAllOpen(false)}
            sx={{
              color: "text.secondary",
              textTransform: "none",
              fontWeight: "bold",
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={executeArchiveAll}
            variant="contained"
            color="warning"
            sx={{
              textTransform: "none",
              fontWeight: "bold",
              boxShadow: "none",
            }}
          >
            Yes, Archive All
          </Button>
        </DialogActions>
      </Dialog>
      {/* ----------- IMPORT INFO SHEET MODAL ----------- */}
      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{
          paper: { sx: { borderRadius: 4, p: 2 } },
        }}
      >
        <DialogTitle
          sx={{
            fontWeight: "900",
            textAlign: "center",
            fontSize: "1.5rem",
            pb: 1,
          }}
        >
          Import Info Sheet
        </DialogTitle>
        <DialogContent>
          {importError && (
            <Alert severity="error" sx={{ mt: 1, mb: 2, borderRadius: 2 }}>
              {importError}
            </Alert>
          )}
          <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
            Upload an Excel (.xlsx) file containing student records. Ensure it
            follows the official "Info Sheet" format.
          </Typography>
          <Box
            sx={{
              border: "2px dashed #ccc",
              borderRadius: 2,
              p: 4,
              textAlign: "center",
              bgcolor: "#f9f9f9",
              position: "relative",
            }}
          >
            <input
              type="file"
              accept=".xlsx"
              onChange={handleImportFileChange}
              style={{
                position: "absolute",
                width: "100%",
                height: "100%",
                top: 0,
                left: 0,
                opacity: 0,
                cursor: "pointer",
              }}
            />
            <Typography
              variant="body1"
              sx={{
                fontWeight: "bold",
                color: importFile ? "success.main" : "textSecondary",
              }}
            >
              {importFile
                ? importFile.name
                : "Drag and drop or click to upload .xlsx file"}
            </Typography>
          </Box>
          {importing && (
            <Box sx={{ mt: 3, textAlign: "center" }}>
              <LinearProgress />
              <Typography variant="caption" sx={{ mt: 1, display: "block" }}>
                Importing records...
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, justifyContent: "center" }}>
          <Button
            onClick={() => setImportOpen(false)}
            disabled={importing}
            sx={{
              color: "text.secondary",
              textTransform: "none",
              fontWeight: "bold",
              mr: 2,
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImportSubmit}
            disabled={!importFile || importing}
            variant="contained"
            sx={{
              px: 5,
              py: 1,
              borderRadius: 2,
              textTransform: "none",
              fontWeight: "bold",
            }}
          >
            Import
          </Button>
        </DialogActions>
      </Dialog>

      {/* ----------- IMPORT SUMMARY MODAL ----------- */}
      <Dialog
        open={!!importSummary}
        onClose={() => setImportSummary(null)}
        maxWidth="md"
        fullWidth
        slotProps={{
          paper: { sx: { borderRadius: 4, p: 2 } },
        }}
      >
        <DialogTitle sx={{ fontWeight: "900", fontSize: "1.5rem", pb: 1 }}>
          Import Summary
        </DialogTitle>
        <DialogContent>
          {importSummary && (
            <Box>
              <Box sx={{ display: "flex", gap: 2, mb: 3 }}>
                <Paper
                  sx={{
                    p: 2,
                    flex: 1,
                    textAlign: "center",
                    bgcolor: "#e8f5e9",
                  }}
                >
                  <Typography
                    variant="h4"
                    sx={{
                      fontWeight: "bold",
                      color: "success.main",
                    }}
                  >
                    {importSummary.successCount}
                  </Typography>
                  <Typography variant="body2">Successfully Imported</Typography>
                </Paper>
                <Paper
                  sx={{
                    p: 2,
                    flex: 1,
                    textAlign: "center",
                    bgcolor: "#ffebee",
                  }}
                >
                  <Typography
                    variant="h4"
                    sx={{
                      fontWeight: "bold",
                      color: "error.main",
                    }}
                  >
                    {importSummary.failedCount}
                  </Typography>
                  <Typography variant="body2">Failed to Import</Typography>
                </Paper>
              </Box>

              {importSummary.errors && importSummary.errors.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography
                    variant="subtitle1"
                    color="error"
                    sx={{
                      mb: 1,
                      fontWeight: "bold",
                    }}
                  >
                    Errors Log:
                  </Typography>
                  <Paper
                    sx={{
                      maxHeight: 200,
                      overflow: "auto",
                      p: 2,
                      bgcolor: "#f5f5f5",
                    }}
                  >
                    {importSummary.errors.map((err, idx) => (
                      <Typography
                        key={idx}
                        variant="body2"
                        color="error"
                        sx={{ mb: 0.5 }}
                      >
                        <strong>Row {err.row}:</strong> {err.error}
                      </Typography>
                    ))}
                  </Paper>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setImportSummary(null)}
            variant="contained"
            sx={{ textTransform: "none", fontWeight: "bold" }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
export default StudentManagement;
