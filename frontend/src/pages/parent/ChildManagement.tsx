import React, { useState, useEffect, useRef } from "react";
import type { ChangeEvent } from "react";
import type { SelectChangeEvent } from "@mui/material";
import {
  Box,
  Typography,
  Paper,
  TextField,
  Avatar,
  CircularProgress,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Snackbar,
  Alert,
  Grid,
} from "@mui/material";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import SaveIcon from "@mui/icons-material/Save";
import { useSettings } from "../../context/SettingsContext";
import { errorMessage } from "../../services/api";
import { useChildren } from "../../hooks/useChildren";
import { useParentProfile } from "../../hooks/useParentProfile";
import {
  PROFILE_FIELDS,
  validateProfile,
  type ProfileField,
} from "../../utils/parentProfile";
import { calculateRosterAge, formatDisplayDate } from "../../utils/dateUtils";

const ChildManagement: React.FC = () => {
  const { settings } = useSettings();
  const roster = useChildren();
  const childrenList = roster.children;
  const selectedChildIndex = Math.max(
    0,
    childrenList.findIndex((child) => child.student_id === roster.selected),
  );
  const profile = useParentProfile(roster.child?.student_id || 0);
  const childData = profile.child;
  const loading = roster.loading || (Boolean(roster.child) && profile.loading);
  const canView = childData?.allow_parent_view_student_info === true;
  const canEdit = canView && childData?.allow_parent_edit_student_info === true;
  const formData = profile.form.values;
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const savingLock = useRef(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info";
  }>({ open: false, message: "", severity: "success" });
  useEffect(() => {
    const error = roster.error || profile.error;
    if (error) setSnackbar({ open: true, message: error, severity: "error" });
  }, [roster.error, profile.error]);
  const handleChildSwitch = (event: SelectChangeEvent<number>) => {
    const child = childrenList[Number(event.target.value)];
    if (child) roster.select(child.student_id);
  };
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!canEdit || !PROFILE_FIELDS.includes(e.target.name as ProfileField))
      return;
    profile.form.change({ ...formData, [e.target.name]: e.target.value });
  };
  const handleSave = async () => {
    if (!childData || !canEdit || savingLock.current) return;
    const error = validateProfile(formData, profile.form.baseline);
    if (error) {
      setSnackbar({ open: true, message: error, severity: "error" });
      return;
    }
    savingLock.current = true;
    setIsSaving(true);
    try {
      const result = await profile.form.save();
      setSnackbar({
        open: true,
        message:
          result === "saved"
            ? "Child details successfully updated!"
            : result === "unchanged"
              ? "No changes to save."
              : "Your draft is saved on this device. Reconnect and submit again.",
        severity: result === "saved" ? "success" : "info",
      });
      if (result === "saved") {
        void profile.refresh();
        void roster.refresh();
      }
    } catch (err) {
      setSnackbar({
        open: true,
        message: errorMessage(err),
        severity: "error",
      });
    } finally {
      savingLock.current = false;
      setIsSaving(false);
    }
  };
  const getInitials = (first?: string | null, last?: string | null) =>
    `${first?.charAt(0) || ""}${last?.charAt(0) || ""}`.toUpperCase();

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!childData) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography sx={{ color: "text.secondary", fontWeight: 500 }}>
          {roster.error ||
            profile.error ||
            "No child linked to your account yet. Please connect your child's LRN on the Dashboard."}
        </Typography>
      </Box>
    );
  }

  const inputBgColor = canEdit ? "#ffffff" : "#f4f5f7";

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: "1280px",
        mx: "auto",
        px: { xs: 1, sm: 2, md: 3 },
        py: { xs: 1, sm: 2 },
        pb: { xs: 8, md: 4 },
        minHeight: "100vh",
        position: "relative",
      }}
    >
      {profile.form.error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>
          {profile.form.error} Your changes are kept on this device.
        </Alert>
      )}
      {profile.form.pending && (
        <Alert severity="info" sx={{ mb: 2, borderRadius: 3 }}>
          Your draft is saved on this device. Reconnect and submit again.
        </Alert>
      )}
      {/* Top Header & Persistent Child Selector Bar */}
      <Box
        sx={{
          mb: { xs: 2.5, md: 4 },
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Box>
          <Typography
            variant="h4"
            sx={{
              fontWeight: "800",
              color: "#1e1e2f",
              mb: 0.5,
              fontSize: { xs: "1.25rem", sm: "1.75rem" },
            }}
          >
            Child Information
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: "text.secondary",
              fontSize: { xs: "0.85rem", sm: "1rem" },
            }}
          >
            View official school records and family background details.
          </Typography>
        </Box>

        <Box
          sx={{
            display: "flex",
            gap: 2,
            alignItems: "center",
            width: { xs: "100%", sm: "auto" },
            justifyContent: { xs: "space-between", sm: "flex-end" },
          }}
        >
          {childrenList.length > 1 && (
            <FormControl
              size="small"
              sx={{
                minWidth: { xs: 160, sm: 200 },
                bgcolor: "white",
                borderRadius: 2,
              }}
            >
              <InputLabel id="child-select-label">Select Child</InputLabel>
              <Select
                labelId="child-select-label"
                value={selectedChildIndex}
                label="Select Child"
                onChange={handleChildSwitch}
                sx={{ borderRadius: 2 }}
              >
                {childrenList.map((child, index) => (
                  <MenuItem key={child.student_id} value={index}>
                    {child.first_name} {child.last_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* If the teacher allowed edits, just show the Save button directly! */}
          {canView && canEdit && (
            <Button
              variant="contained"
              color="success"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={isSaving}
              sx={{
                borderRadius: 2,
                textTransform: "none",
                fontWeight: "bold",
                boxShadow: "none",
                display: { xs: "none", md: "flex" },
              }}
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          )}
        </Box>
      </Box>

      {/* Conditional Content Area */}
      {!canView ? (
        <Box
          sx={{
            p: { xs: 2, sm: 4 },
            minHeight: "50vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Paper
            sx={{
              p: { xs: 3, sm: 6 },
              borderRadius: 4,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              maxWidth: 460,
              width: "100%",
              textAlign: "center",
              boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
            }}
          >
            <Box
              sx={{
                p: 2.5,
                borderRadius: "50%",
                bgcolor: "#FEE2E2",
                color: "#EF4444",
                mb: 3,
              }}
            >
              <LockOutlinedIcon sx={{ fontSize: 60 }} />
            </Box>
            <Typography
              variant="h5"
              sx={{
                fontWeight: "900",
                color: "#111827",
                mb: 1.5,
                fontSize: { xs: "1.25rem", sm: "1.5rem" },
              }}
            >
              Access Restricted
            </Typography>
            <Typography
              variant="body1"
              sx={{
                color: "text.secondary",
                mb: 3,
                lineHeight: 1.6,
                fontSize: { xs: "0.875rem", sm: "1rem" },
              }}
            >
              Student information viewing is disabled by your teacher.
            </Typography>
            {childData.teacher_fname ? (
              <Typography
                variant="body2"
                sx={{ fontWeight: "bold", color: "primary.main" }}
              >
                Please contact {childData.teacher_fname}{" "}
                {childData.teacher_lname} via the Messages tab if you have any
                questions.
              </Typography>
            ) : (
              <Typography
                variant="body2"
                sx={{ fontWeight: "bold", color: "primary.main" }}
              >
                Please contact your child's adviser via the Messages tab if you
                have any questions.
              </Typography>
            )}
          </Paper>
        </Box>
      ) : (
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            gap: { xs: 2, md: 3 },
          }}
        >
          <Paper
            sx={{
              flex: 1,
              borderRadius: 4,
              p: { xs: 2.5, sm: 3, md: 4 },
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              boxShadow: "0 4px 15px rgba(0,0,0,0.05)",
            }}
          >
            <Avatar
              src={""}
              sx={{
                width: { xs: 72, sm: 100 },
                height: { xs: 72, sm: 100 },
                mb: 2.5,
                boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
                border: "4px solid white",
                bgcolor: "primary.light",
                fontSize: { xs: "1.8rem", sm: "2.5rem" },
                color: "primary.main",
                fontWeight: "bold",
              }}
            >
              {getInitials(childData.first_name, childData.last_name)}
            </Avatar>

            <Grid container spacing={1.5} sx={{ mb: 2.5, width: "100%" }}>
              <Grid size={{ xs: 12 }}>
                <Typography
                  variant="caption"
                  sx={{ color: "text.secondary", fontWeight: "bold" }}
                >
                  First Name
                </Typography>
                <TextField
                  fullWidth
                  name="first_name"
                  value={childData.first_name || ""}
                  size="small"
                  slotProps={{
                    input: { readOnly: true },
                    htmlInput: { "aria-label": "First Name" },
                  }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: "#f4f5f7",
                    },
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography
                  variant="caption"
                  sx={{ color: "text.secondary", fontWeight: "bold" }}
                >
                  Middle Name
                </Typography>
                <TextField
                  fullWidth
                  name="middle_name"
                  value={childData.middle_name || ""}
                  size="small"
                  slotProps={{
                    input: { readOnly: true },
                    htmlInput: { "aria-label": "Middle Name" },
                  }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: "#f4f5f7",
                    },
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography
                  variant="caption"
                  sx={{ color: "text.secondary", fontWeight: "bold" }}
                >
                  Last Name
                </Typography>
                <TextField
                  fullWidth
                  name="last_name"
                  value={childData.last_name || ""}
                  size="small"
                  slotProps={{
                    input: { readOnly: true },
                    htmlInput: { "aria-label": "Last Name" },
                  }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: "#f4f5f7",
                    },
                  }}
                />
              </Grid>
            </Grid>

            <Typography
              variant="caption"
              sx={{ color: "text.secondary", mb: 1 }}
            >
              LRN: {childData.masked_lrn}
            </Typography>

            <Box sx={{ width: "100%", mb: 2 }}>
              <Typography
                variant="caption"
                sx={{ color: "text.secondary", fontWeight: "bold" }}
              >
                School
              </Typography>
              <TextField
                fullWidth
                value={
                  settings?.school_name || "Apolinario Mabini Elementary School"
                }
                size="small"
                slotProps={{ input: { readOnly: true } }}
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
                sx={{ color: "text.secondary", fontWeight: "bold" }}
              >
                Section
              </Typography>
              <TextField
                fullWidth
                value={childData.section_name || ""}
                size="small"
                slotProps={{ input: { readOnly: true } }}
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
                sx={{ color: "text.secondary", fontWeight: "bold" }}
              >
                Adviser
              </Typography>
              <TextField
                fullWidth
                value={`${childData.teacher_fname || ""} ${childData.teacher_lname || ""}`}
                size="small"
                slotProps={{ input: { readOnly: true } }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    bgcolor: "#f4f5f7",
                  },
                }}
              />
            </Box>

            <Grid container spacing={1.5} sx={{ mb: 2, width: "100%" }}>
              <Grid size={{ xs: 6 }}>
                <Typography
                  variant="caption"
                  sx={{ color: "text.secondary", fontWeight: "bold" }}
                >
                  Gender
                </Typography>
                <TextField
                  fullWidth
                  value={childData.gender || ""}
                  size="small"
                  slotProps={{ input: { readOnly: true } }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: "#f4f5f7",
                    },
                  }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography
                  variant="caption"
                  sx={{ color: "text.secondary", fontWeight: "bold" }}
                >
                  Age
                </Typography>
                <TextField
                  fullWidth
                  value={
                    calculateRosterAge(
                      childData.date_of_birth,
                      childData.school_year || settings?.current_school_year,
                      settings?.school_year_start_month || 8,
                    ) !== "N/A"
                      ? calculateRosterAge(
                          childData.date_of_birth,
                          childData.school_year ||
                            settings?.current_school_year,
                          settings?.school_year_start_month || 8,
                        )
                      : childData.decimal_age
                        ? `${childData.decimal_age} yrs`
                        : ""
                  }
                  size="small"
                  slotProps={{ input: { readOnly: true } }}
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
                sx={{
                  color: canEdit ? "primary.main" : "text.secondary",
                  fontWeight: "bold",
                }}
              >
                Emergency Contact
              </Typography>
              <TextField
                fullWidth
                name="emergency_contact"
                type="tel"
                value={formData.emergency_contact || ""}
                onChange={handleChange}
                size="small"
                slotProps={{ input: { readOnly: !canEdit } }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    bgcolor: inputBgColor,
                  },
                }}
              />
            </Box>
          </Paper>

          <Paper
            sx={{
              flex: 1.8,
              borderRadius: 4,
              p: { xs: 2.5, sm: 3, md: 4 },
              boxShadow: "0 4px 15px rgba(0,0,0,0.05)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}
            >
              <PeopleAltOutlinedIcon color="action" />
              <Typography
                variant="h6"
                sx={{
                  fontWeight: "800",
                  color: "#333",
                  fontSize: { xs: "1rem", sm: "1.2rem" },
                }}
              >
                Family Background & Details
              </Typography>
            </Box>

            <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
              <Grid size={{ xs: 12 }}>
                <Typography
                  variant="caption"
                  sx={{
                    color: canEdit ? "primary.main" : "text.secondary",
                    fontWeight: "bold",
                  }}
                >
                  Home Address
                </Typography>
                <TextField
                  fullWidth
                  name="address"
                  value={formData.address || ""}
                  onChange={handleChange}
                  size="small"
                  slotProps={{ input: { readOnly: !canEdit } }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: inputBgColor,
                    },
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography
                  variant="caption"
                  sx={{
                    color: canEdit ? "primary.main" : "text.secondary",
                    fontWeight: "bold",
                  }}
                >
                  Handedness
                </Typography>
                <TextField
                  fullWidth
                  name="handedness"
                  value={formData.handedness || ""}
                  onChange={handleChange}
                  size="small"
                  slotProps={{ input: { readOnly: !canEdit } }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: inputBgColor,
                    },
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography
                  variant="caption"
                  sx={{ color: "text.secondary", fontWeight: "bold" }}
                >
                  Birth Date
                </Typography>
                <TextField
                  fullWidth
                  value={formatDisplayDate(childData.date_of_birth)}
                  size="small"
                  slotProps={{ input: { readOnly: true } }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: "#f4f5f7",
                    },
                  }}
                />
              </Grid>
            </Grid>

            <Box
              sx={{
                border: "1px solid",
                borderColor: canEdit ? "primary.light" : "#e0e0e0",
                borderRadius: 3,
                p: { xs: 1.5, sm: 2 },
                mb: 2,
                bgcolor: canEdit ? "rgba(37, 99, 235, 0.02)" : "transparent",
              }}
            >
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: canEdit ? "primary.main" : "text.secondary",
                      fontWeight: "bold",
                    }}
                  >
                    Father's Full Name
                  </Typography>
                  <TextField
                    fullWidth
                    name="father_name"
                    value={formData.father_name || ""}
                    onChange={handleChange}
                    size="small"
                    slotProps={{ input: { readOnly: !canEdit } }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: inputBgColor,
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: canEdit ? "primary.main" : "text.secondary",
                      fontWeight: "bold",
                    }}
                  >
                    Age
                  </Typography>
                  <TextField
                    fullWidth
                    name="father_age"
                    value={formData.father_age || ""}
                    onChange={handleChange}
                    size="small"
                    slotProps={{ input: { readOnly: !canEdit } }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: inputBgColor,
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: canEdit ? "primary.main" : "text.secondary",
                      fontWeight: "bold",
                    }}
                  >
                    Occupation
                  </Typography>
                  <TextField
                    fullWidth
                    name="father_occ"
                    value={formData.father_occ || ""}
                    onChange={handleChange}
                    size="small"
                    slotProps={{ input: { readOnly: !canEdit } }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: inputBgColor,
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: canEdit ? "primary.main" : "text.secondary",
                      fontWeight: "bold",
                    }}
                  >
                    Educational Attainment
                  </Typography>
                  <TextField
                    fullWidth
                    name="father_educ"
                    value={formData.father_educ || ""}
                    onChange={handleChange}
                    size="small"
                    slotProps={{ input: { readOnly: !canEdit } }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: inputBgColor,
                      },
                    }}
                  />
                </Grid>
              </Grid>
            </Box>

            <Box
              sx={{
                border: "1px solid",
                borderColor: canEdit ? "primary.light" : "#e0e0e0",
                borderRadius: 3,
                p: { xs: 1.5, sm: 2 },
                mb: 2.5,
                bgcolor: canEdit ? "rgba(37, 99, 235, 0.02)" : "transparent",
              }}
            >
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: canEdit ? "primary.main" : "text.secondary",
                      fontWeight: "bold",
                    }}
                  >
                    Mother's Full Name
                  </Typography>
                  <TextField
                    fullWidth
                    name="mother_name"
                    value={formData.mother_name || ""}
                    onChange={handleChange}
                    size="small"
                    slotProps={{ input: { readOnly: !canEdit } }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: inputBgColor,
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: canEdit ? "primary.main" : "text.secondary",
                      fontWeight: "bold",
                    }}
                  >
                    Age
                  </Typography>
                  <TextField
                    fullWidth
                    name="mother_age"
                    value={formData.mother_age || ""}
                    onChange={handleChange}
                    size="small"
                    slotProps={{ input: { readOnly: !canEdit } }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: inputBgColor,
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: canEdit ? "primary.main" : "text.secondary",
                      fontWeight: "bold",
                    }}
                  >
                    Occupation
                  </Typography>
                  <TextField
                    fullWidth
                    name="mother_occ"
                    value={formData.mother_occ || ""}
                    onChange={handleChange}
                    size="small"
                    slotProps={{ input: { readOnly: !canEdit } }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: inputBgColor,
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: canEdit ? "primary.main" : "text.secondary",
                      fontWeight: "bold",
                    }}
                  >
                    Educational Attainment
                  </Typography>
                  <TextField
                    fullWidth
                    name="mother_educ"
                    value={formData.mother_educ || ""}
                    onChange={handleChange}
                    size="small"
                    slotProps={{ input: { readOnly: !canEdit } }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: inputBgColor,
                      },
                    }}
                  />
                </Grid>
              </Grid>
            </Box>

            <Grid container spacing={1.5} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography
                  variant="caption"
                  sx={{
                    color: canEdit ? "primary.main" : "text.secondary",
                    fontWeight: "bold",
                  }}
                >
                  No. of siblings
                </Typography>
                <TextField
                  fullWidth
                  name="num_of_siblings"
                  value={formData.num_of_siblings || ""}
                  onChange={handleChange}
                  size="small"
                  slotProps={{ input: { readOnly: !canEdit } }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: inputBgColor,
                    },
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography
                  variant="caption"
                  sx={{
                    color: canEdit ? "primary.main" : "text.secondary",
                    fontWeight: "bold",
                  }}
                >
                  Pang-ilan sa mag kakapatid
                </Typography>
                <TextField
                  fullWidth
                  name="birth_order"
                  value={formData.birth_order || ""}
                  onChange={handleChange}
                  size="small"
                  slotProps={{ input: { readOnly: !canEdit } }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      bgcolor: inputBgColor,
                    },
                  }}
                />
              </Grid>
            </Grid>

            {canView && canEdit && (
              <Button
                fullWidth
                variant="contained"
                color="success"
                startIcon={<SaveIcon />}
                onClick={handleSave}
                disabled={isSaving}
                sx={{
                  borderRadius: 2,
                  textTransform: "none",
                  fontWeight: "bold",
                  boxShadow: "none",
                  display: { xs: "flex", md: "none" },
                  mt: 2,
                  py: 1.5,
                  minHeight: 44,
                }}
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </Paper>
        </Box>
      )}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={snackbar.severity} sx={{ borderRadius: 2 }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ChildManagement;
