import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Box,
  Typography,
  Paper,
  Switch,
  TextField,
  Button,
  Alert,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
} from "@mui/material";
import PasswordValidator from "../../components/teacher/PasswordValidator";
import api, { errorMessage, isNetworkError } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import {
  confirmDraft,
  readDraft,
  storeDraft,
  syncDrafts,
} from "../../utils/drafts";
import type { Draft } from "../../utils/drafts";
import { useSessionField } from "../../utils/sessionDrafts";
import type { Permissions, SessionResponse } from "../../types";
import { passwordValid } from "../../components/ForceChangePassword";
import { useTeacher } from "../../context/TeacherContext";
import ParentAssessmentAccessSettings from "../../components/teacher/ParentAssessmentAccessSettings";
interface PasswordChallenge {
  email?: string;
  challengeToken?: string;
  message: string;
}
interface PasswordSubmission {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
  email?: string;
  challengeToken?: string;
  otp?: string;
}
interface AccessFeedback {
  open: boolean;
  message: string;
  severity: "success" | "error";
}
const initialPermissions: Permissions = {
  allow_parent_predictions: false,
  allow_parent_view_student_info: true,
  allow_parent_view_eccd_pre: false,
  allow_parent_view_eccd_mid: false,
  allow_parent_view_eccd_post: false,
  allow_parent_view_eccd_marks: false,
  allow_parent_edit_student_info: true,
  allow_parent_edit_home_based_eccd: false,
};
const parentPermissions = (source: Permissions): Permissions => ({
  allow_parent_predictions: source.allow_parent_predictions === true,
  allow_parent_view_student_info: source.allow_parent_view_student_info,
  allow_parent_view_eccd_pre: source.allow_parent_view_eccd_pre,
  allow_parent_view_eccd_mid: source.allow_parent_view_eccd_mid,
  allow_parent_view_eccd_post: source.allow_parent_view_eccd_post,
  allow_parent_view_eccd_marks: source.allow_parent_view_eccd_marks === true,
  allow_parent_edit_student_info: source.allow_parent_edit_student_info,
  allow_parent_edit_home_based_eccd: source.allow_parent_edit_home_based_eccd,
});
const TeacherSettings: React.FC = () => {
  const { section, loading: sectionsLoading } = useTeacher();
  const { user, login } = useAuth();
  const owner = user?.id || 0;
  const accessKey = "ames_draft_" + owner + "_teacher_access";
  const [access, setAccess] = useState<Permissions>(() =>
    parentPermissions(
      readDraft<Permissions>(accessKey)?.values || initialPermissions,
    ),
  );
  const desiredAccess = useRef(access);
  const accessReady = useRef(!!readDraft<Permissions>(accessKey));
  const accessGeneration = useRef(0);
  const accessQueue = useRef<Promise<void>>(Promise.resolve());
  const [accessLoaded, setAccessLoaded] = useState(false);
  const [accessSaving, setAccessSaving] = useState(false);
  const [periodBusy, setPeriodBusy] = useState(false);
  const accessDisabled =
    !accessLoaded || accessSaving || periodBusy || sectionsLoading;
  const [accessSnackbar, setAccessSnackbar] = useState<AccessFeedback>({
    open: false,
    message: "",
    severity: "success",
  });
  const reportAccessFeedback = useCallback(
    (message: string, severity: "success" | "error") => {
      setAccessSnackbar({ open: Boolean(message), message, severity });
    },
    [],
  );
  const credentialKey = "ames_teacher_password_" + owner + "_";
  const [oldPassword, setOldPassword, clearOld] = useSessionField(
    credentialKey + "old",
    "",
  );
  const [newPassword, setNewPassword, clearNew] = useSessionField(
    credentialKey + "new",
    "",
  );
  const [confirmPassword, setConfirmPassword, clearConfirm] = useSessionField(
    credentialKey + "confirm",
    "",
  );
  const [otp, setOtp, clearOtp] = useSessionField(credentialKey + "otp", "");
  const [challengeToken, setChallengeToken, clearChallenge] = useSessionField(
    credentialKey + "challenge",
    "",
  );
  const [isOtpSent, setIsOtpSent, clearSent] = useSessionField(
    credentialKey + "sent",
    false,
  );
  const [userEmail, setUserEmail, clearEmail] = useSessionField(
    credentialKey + "email",
    "",
  );
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isPasswordValid, setIsPasswordValid] = useState(
    passwordValid(newPassword),
  );
  const passwordLock = useRef(false);
  const [pendingPassword, setPendingPassword, clearPendingPassword] =
    useSessionField<PasswordSubmission | null>(
      credentialKey + "submission",
      null,
    );
  useEffect(() => {
    let current = true;
    const load = async () => {
      const generation = accessGeneration.current;
      try {
        const response = await api.get<Permissions>("/api/teachers/me/access");
        if (!current || generation !== accessGeneration.current) return;
        accessReady.current = true;
        const draft = readDraft<Permissions>(accessKey);
        const next = parentPermissions(draft?.values || response.data);
        desiredAccess.current = next;
        setAccess(next);
        setAccessLoaded(true);
      } catch (err) {
        if (current)
          setAccessSnackbar({
            open: true,
            message: errorMessage(err),
            severity: "error",
          });
      }
    };
    void load();
    const online = () => {
      void syncDrafts(owner);
      void load();
    };
    const synced = (event: Event) => {
      if ((event as CustomEvent<string>).detail === accessKey) {
        void load();
        setAccessSnackbar({
          open: true,
          message: "Parent access settings saved successfully!",
          severity: "success",
        });
      }
    };
    window.addEventListener("online", online);
    window.addEventListener("ames-record-synced", synced);
    return () => {
      current = false;
      window.removeEventListener("online", online);
      window.removeEventListener("ames-record-synced", synced);
    };
  }, [accessKey, owner]);
  const persistSettingChange = (updates: Partial<Permissions>) => {
    if (!accessReady.current) {
      setAccessSnackbar({
        open: true,
        message: "Parent access settings are still loading. Please try again.",
        severity: "error",
      });
      return;
    }
    const version = ++accessGeneration.current;
    setAccessSnackbar((previous) => ({ ...previous, open: false }));
    const values = { ...desiredAccess.current, ...updates };
    desiredAccess.current = values;
    setAccess(values);
    const draft: Draft<Permissions> = {
      owner_id: owner,
      values,
      revision: crypto.randomUUID(),
      is_pending_sync: true,
      request: { path: "/api/teachers/me/access", method: "put", data: values },
    };
    storeDraft(accessKey, draft);
    setAccessSaving(true);
    accessQueue.current = accessQueue.current.then(async () => {
      if (readDraft(accessKey)?.revision !== draft.revision) return;
      try {
        if (!navigator.onLine) {
          setAccessSnackbar({
            open: true,
            message:
              "Saved locally on device. Will automatically sync once reconnected.",
            severity: "success",
          });
          return;
        }
        const response = await api.put("/api/teachers/me/access", values);
        if (response.status !== 200 && response.status !== 201)
          throw new Error("The server did not confirm this save.");
        confirmDraft(accessKey, draft.revision);
        setAccessSnackbar({
          open: true,
          message: "Parent access settings saved successfully!",
          severity: "success",
        });
      } catch (err) {
        if (isNetworkError(err))
          setAccessSnackbar({
            open: true,
            message:
              "Saved locally on device. Will automatically sync once reconnected.",
            severity: "success",
          });
        else {
          if (readDraft(accessKey)?.revision === draft.revision)
            storeDraft(accessKey, {
              ...draft,
              is_pending_sync: false,
              error: errorMessage(err),
            });
          setAccessSnackbar({
            open: true,
            message: errorMessage(err),
            severity: "error",
          });
        }
      } finally {
        if (accessGeneration.current === version) setAccessSaving(false);
      }
    });
  };
  const validatePasswords = () => {
    if (!oldPassword || !newPassword || !confirmPassword)
      return "Please fill in all password fields.";
    if (!passwordValid(newPassword))
      return "The new password must meet all password requirements.";
    if (newPassword !== confirmPassword) return "New passwords do not match.";
    if (newPassword === oldPassword) return "Choose a different password.";
    return "";
  };
  const completePasswordChange = async (payload: PasswordSubmission) => {
    const response = await api.post<SessionResponse>(
      "/api/teachers/change-password-verify",
      payload,
    );
    if (response.status !== 200 && response.status !== 201)
      throw new Error("The server did not confirm this save.");
    login(response.data);
    localStorage.removeItem("ames_device_token");
    // A response to an earlier snapshot cannot erase edits made during the request.
    if (
      sessionStorage.getItem(credentialKey + "old") ===
      JSON.stringify(payload.oldPassword)
    ) {
      setOldPassword("");
      clearOld();
    }
    if (
      sessionStorage.getItem(credentialKey + "new") ===
      JSON.stringify(payload.newPassword)
    ) {
      setNewPassword("");
      clearNew();
    }
    if (
      sessionStorage.getItem(credentialKey + "confirm") ===
      JSON.stringify(payload.confirmPassword)
    ) {
      setConfirmPassword("");
      clearConfirm();
    }
    setOtp("");
    clearOtp();
    setChallengeToken("");
    clearChallenge();
    setIsOtpSent(false);
    clearSent();
    clearEmail();
    setPendingPassword(null);
    clearPendingPassword();
    setPasswordSuccess("Password successfully updated!");
  };
  const handleRequestPasswordChange = async () => {
    if (passwordLock.current) return;
    setPasswordError("");
    setPasswordSuccess("");
    const validation = validatePasswords();
    if (validation) {
      setPasswordError(validation);
      return;
    }
    const snapshot: PasswordSubmission = {
      oldPassword,
      newPassword,
      confirmPassword,
    };
    passwordLock.current = true;
    setIsVerifying(true);
    try {
      const response = await api.post<PasswordChallenge>(
        "/api/teachers/change-password-request",
        { oldPassword },
      );
      const data = response.data;
      if (data.challengeToken) {
        setPendingPassword(snapshot);
        setChallengeToken(data.challengeToken);
        setUserEmail(data.email || "");
        setIsOtpSent(true);
        setPasswordSuccess(data.message);
      } else await completePasswordChange(snapshot);
    } catch (err) {
      setPasswordError(errorMessage(err));
    } finally {
      passwordLock.current = false;
      setIsVerifying(false);
    }
  };
  const handleVerifyPasswordChange = async () => {
    if (passwordLock.current) return;
    setPasswordError("");
    setPasswordSuccess("");
    if (!/^\d{6}$/.test(otp) || !challengeToken) {
      setPasswordError("Please enter the six-digit verification code.");
      return;
    }
    const snapshot = pendingPassword || {
      oldPassword,
      newPassword,
      confirmPassword,
    };
    if (
      !passwordValid(snapshot.newPassword) ||
      snapshot.newPassword !== snapshot.confirmPassword
    ) {
      setPasswordError(
        "New passwords do not match or do not meet the password requirements.",
      );
      return;
    }
    passwordLock.current = true;
    setIsVerifying(true);
    try {
      await completePasswordChange({
        ...snapshot,
        email: userEmail,
        otp,
        challengeToken,
      });
    } catch (err) {
      setPasswordError(errorMessage(err));
    } finally {
      passwordLock.current = false;
      setIsVerifying(false);
    }
  };
  return (
    <Box sx={{ p: 3, minHeight: "85vh" }}>
      <Box sx={{ mb: 4, maxWidth: 900, mx: "auto" }}>
        <Typography
          variant="h4"
          sx={{ fontWeight: "800", color: "#111827", mb: 0.5 }}
        >
          Settings
        </Typography>
        <Typography variant="body1" color="textSecondary">
          Manage teacher and parent access settings.
        </Typography>
      </Box>

      {/* === GLOBAL PARENT ACCESS SETTINGS PANEL === */}
      <Box sx={{ mb: 4, maxWidth: 900, mx: "auto", mt: 6 }}>
        <Typography
          variant="h5"
          sx={{ fontWeight: "800", color: "#111827", mb: 0.5 }}
        >
          Global Parent Access
        </Typography>
        <Typography variant="body1" color="textSecondary" sx={{ mb: 3 }}>
          Control what information parents can see or change across all your
          students.
        </Typography>

        {accessSnackbar.open && (
          <Alert severity={accessSnackbar.severity} sx={{ mb: 3 }}>
            {accessSnackbar.message}
          </Alert>
        )}

        <Paper
          sx={{
            p: { xs: 3, md: 4 },
            borderRadius: 4,
            boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
          }}
        >
          <Typography
            variant="subtitle1"
            sx={{
              mb: 2,
              color: "#374151",
              fontWeight: "bold",
            }}
          >
            Student Record Permissions
          </Typography>
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                      Student Prediction
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: "text.secondary" }}
                    >
                      Allow parents to view early developmental predictions and intervention guides for their child.
                    </Typography>
                  </Box>
                  <Switch
                    disabled={accessDisabled}
                    slotProps={{
                      input: { "aria-label": "Student Prediction" },
                    }}
                    checked={access.allow_parent_predictions === true}
                    onChange={(e) =>
                      persistSettingChange({
                        allow_parent_predictions: e.target.checked,
                      })
                    }
                    color="primary"
                  />
                </Box>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Box>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: "bold",
                      }}
                    >
                      Student Profile Viewing
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                      }}
                    >
                      Allow parents to view student information
                    </Typography>
                  </Box>
                  <Switch
                    disabled={accessDisabled}
                    slotProps={{
                      input: { "aria-label": "Student Profile Viewing" },
                    }}
                    checked={access.allow_parent_view_student_info}
                    onChange={(e) =>
                      persistSettingChange({
                        allow_parent_view_student_info: e.target.checked,
                      })
                    }
                    color="primary"
                  />
                </Box>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Box>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: "bold",
                      }}
                    >
                      Student Profile Editing
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                      }}
                    >
                      Allow parents to update child information
                    </Typography>
                  </Box>
                  <Switch
                    disabled={accessDisabled}
                    slotProps={{
                      input: { "aria-label": "Student Profile Editing" },
                    }}
                    checked={access.allow_parent_edit_student_info}
                    onChange={(e) =>
                      persistSettingChange({
                        allow_parent_edit_student_info: e.target.checked,
                      })
                    }
                    color="secondary"
                  />
                </Box>
              </Paper>
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          <Typography
            variant="subtitle1"
            sx={{
              mb: 2,
              color: "#374151",
              fontWeight: "bold",
            }}
          >
            ECCD Assessment Visibility
          </Typography>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Box>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: "bold",
                      }}
                    >
                      Pre-Test Scores Visibility
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                      }}
                    >
                      Make Pre-test evaluation results visible
                    </Typography>
                  </Box>
                  <Switch
                    disabled={accessDisabled}
                    slotProps={{
                      input: { "aria-label": "Pre-Test Scores Visibility" },
                    }}
                    checked={access.allow_parent_view_eccd_pre}
                    onChange={(e) =>
                      persistSettingChange({
                        allow_parent_view_eccd_pre: e.target.checked,
                      })
                    }
                    color="info"
                  />
                </Box>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Box>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: "bold",
                      }}
                    >
                      Mid-Test Scores Visibility
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                      }}
                    >
                      Make Mid-test evaluation results visible
                    </Typography>
                  </Box>
                  <Switch
                    disabled={accessDisabled}
                    slotProps={{
                      input: { "aria-label": "Mid-Test Scores Visibility" },
                    }}
                    checked={access.allow_parent_view_eccd_mid}
                    onChange={(e) =>
                      persistSettingChange({
                        allow_parent_view_eccd_mid: e.target.checked,
                      })
                    }
                    color="warning"
                  />
                </Box>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Box>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: "bold",
                      }}
                    >
                      Post-Test Scores Visibility
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                      }}
                    >
                      Make Post-test evaluation results visible
                    </Typography>
                  </Box>
                  <Switch
                    disabled={accessDisabled}
                    slotProps={{
                      input: { "aria-label": "Post-Test Scores Visibility" },
                    }}
                    checked={access.allow_parent_view_eccd_post}
                    onChange={(e) =>
                      persistSettingChange({
                        allow_parent_view_eccd_post: e.target.checked,
                      })
                    }
                    color="success"
                  />
                </Box>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                      Viewing of ECCD Marks
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: "text.secondary" }}
                    >
                      Allow parents to view all recorded Kaya and Di-Kaya marks
                      across all developmental domains
                    </Typography>
                  </Box>
                  <Switch
                    disabled={accessDisabled}
                    slotProps={{
                      input: { "aria-label": "Viewing of ECCD Marks" },
                    }}
                    checked={access.allow_parent_view_eccd_marks === true}
                    onChange={(e) =>
                      persistSettingChange({
                        allow_parent_view_eccd_marks: e.target.checked,
                      })
                    }
                    color="info"
                  />
                </Box>
              </Paper>
            </Grid>
          </Grid>
          <Divider sx={{ my: 2 }} />
          <ParentAssessmentAccessSettings
            key={`${owner}_${section?.section_id ?? "unassigned"}`}
            sectionId={section?.section_id ?? null}
            homeBasedEnabled={access.allow_parent_edit_home_based_eccd}
            disabled={accessDisabled}
            onHomeBasedChange={(checked) =>
              persistSettingChange({
                allow_parent_edit_home_based_eccd: checked,
              })
            }
            onBusyChange={setPeriodBusy}
            onFeedback={reportAccessFeedback}
          />
        </Paper>
      </Box>

      {/* === ACCOUNT SETTINGS PANEL === */}
      <Box sx={{ mb: 4, maxWidth: 900, mx: "auto", mt: 6 }}>
        <Typography
          variant="h5"
          sx={{ fontWeight: "800", color: "#111827", mb: 0.5 }}
        >
          Account Settings
        </Typography>
        <Typography variant="body1" color="textSecondary" sx={{ mb: 3 }}>
          Change or update your account password.
        </Typography>

        {passwordError && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {passwordError}
          </Alert>
        )}
        {passwordSuccess && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {passwordSuccess}
          </Alert>
        )}

        <Paper
          sx={{
            p: { xs: 3, md: 5 },
            borderRadius: 4,
            boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
          }}
        >
          <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 7 }}>
              <Typography
                variant="body2"
                sx={{ fontWeight: "bold", color: "#111827", mb: 1 }}
              >
                Current Password (Required):
              </Typography>
              <TextField
                fullWidth
                type="password"
                size="small"
                placeholder="Enter current password to save"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                sx={{ mb: 4, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />

              <Typography
                variant="body2"
                sx={{ fontWeight: "bold", color: "#111827", mb: 1 }}
              >
                New Password:
              </Typography>
              <TextField
                fullWidth
                type="password"
                size="small"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                sx={{ mb: 2, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />

              <Typography
                variant="body2"
                sx={{ fontWeight: "bold", color: "#111827", mb: 1 }}
              >
                Confirm New Password:
              </Typography>
              <TextField
                fullWidth
                type="password"
                size="small"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                sx={{ mb: 3, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />

              <Button
                variant="contained"
                color="primary"
                onClick={handleRequestPasswordChange}
                disabled={
                  isVerifying ||
                  !isPasswordValid ||
                  !oldPassword ||
                  newPassword !== confirmPassword
                }
                sx={{
                  bgcolor: "var(--primary-color)",
                  textTransform: "none",
                  fontWeight: "bold",
                  width: "fit-content",
                  px: 5,
                  mt: 1,
                  borderRadius: 2,
                  boxShadow: "none",
                  "&.Mui-disabled": { bgcolor: "action.disabledBackground" },
                }}
              >
                Change Password
              </Button>
            </Grid>

            <Grid size={{ xs: 12, md: 5 }}>
              <Box sx={{ mt: { xs: 0, md: 9.5 } }}>
                <PasswordValidator
                  password={newPassword}
                  onValidationChange={setIsPasswordValid}
                />
              </Box>
            </Grid>
          </Grid>
        </Paper>
      </Box>

      {/* === OTP VERIFICATION MODAL === */}
      <Dialog
        open={isOtpSent}
        onClose={() => setIsOtpSent(false)}
        slotProps={{
          paper: { sx: { borderRadius: 3, p: 1 } },
        }}
      >
        <DialogTitle sx={{ fontWeight: "900", color: "#111827" }}>
          Verification Required
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
            A verification code has been sent to your email. Please enter it
            below to confirm your password change.
          </Typography>

          {passwordError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {passwordError}
            </Alert>
          )}

          <Typography
            variant="body2"
            sx={{
              mb: 1,
              fontWeight: "bold",
            }}
          >
            Verification Code (OTP)
          </Typography>
          <TextField
            fullWidth
            size="small"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            sx={{ mb: 1, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="outlined"
            onClick={() => {
              setIsOtpSent(false);
              setPasswordError("");
              setPasswordSuccess("");
            }}
            sx={{ textTransform: "none", fontWeight: "bold", borderRadius: 2 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleVerifyPasswordChange}
            disabled={isVerifying}
            sx={{
              textTransform: "none",
              fontWeight: "bold",
              borderRadius: 2,
              boxShadow: "none",
            }}
          >
            {isVerifying ? "Verifying..." : "Verify & Update"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
export default TeacherSettings;
