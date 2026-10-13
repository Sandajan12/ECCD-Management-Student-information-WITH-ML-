import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Paper, Switch, FormControlLabel, FormGroup,
  TextField, Button, Alert, Stack, Grid, Dialog,
  DialogTitle, DialogContent, DialogActions, Snackbar, Divider, Chip
} from '@mui/material';
import PasswordValidator from '../../components/PasswordValidator';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditNoteIcon from '@mui/icons-material/EditNote';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import api, { errorMessage, isNetworkError } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { confirmDraft, readDraft, storeDraft, syncDrafts } from '../../utils/drafts';
import type { Draft } from '../../utils/drafts';
import { useSessionField } from '../../utils/sessionDrafts';
import type { Permissions, SessionResponse } from '../../types';
import { passwordValid } from '../../components/ForceChangePassword';

interface PasswordChallenge { email?: string; challengeToken?: string; message: string; }
interface PasswordSubmission { oldPassword: string; newPassword: string; confirmPassword: string; email?: string; challengeToken?: string; otp?: string; }
interface AccessFeedback { open: boolean; message: string; severity: 'success' | 'error'; }
const initialPermissions: Permissions = {
  allow_parent_view_student_info: true, allow_parent_view_eccd_pre: false,
  allow_parent_view_eccd_mid: false, allow_parent_view_eccd_post: false,
  allow_parent_edit_student_info: true, allow_parent_edit_home_based_eccd: false,
};

const TeacherSettings: React.FC = () => {
  const { user, login } = useAuth();
  const owner = user?.id || 0;
  const accessKey = 'ames_draft_' + owner + '_teacher_access';
  const [access, setAccess] = useState<Permissions>(() => readDraft<Permissions>(accessKey)?.values || initialPermissions);
  const desiredAccess = useRef(access);
  const accessReady = useRef(!!readDraft<Permissions>(accessKey));
  const accessGeneration = useRef(0);
  const accessQueue = useRef<Promise<void>>(Promise.resolve());
  const [accessSnackbar, setAccessSnackbar] = useState<AccessFeedback>({ open: false, message: '', severity: 'success' });
  const allowParentViewStudentInfo = access.allow_parent_view_student_info;
  const allowParentViewEccdPre = access.allow_parent_view_eccd_pre;
  const allowParentViewEccdMid = access.allow_parent_view_eccd_mid;
  const allowParentViewEccdPost = access.allow_parent_view_eccd_post;
  const allowParentEditStudentInfo = access.allow_parent_edit_student_info;
  const allowParentEditHomeBasedEccd = access.allow_parent_edit_home_based_eccd;
  const credentialKey = 'ames_teacher_password_' + owner + '_';
  const [oldPassword, setOldPassword, clearOld] = useSessionField(credentialKey + 'old', '');
  const [newPassword, setNewPassword, clearNew] = useSessionField(credentialKey + 'new', '');
  const [confirmPassword, setConfirmPassword, clearConfirm] = useSessionField(credentialKey + 'confirm', '');
  const [otp, setOtp, clearOtp] = useSessionField(credentialKey + 'otp', '');
  const [challengeToken, setChallengeToken, clearChallenge] = useSessionField(credentialKey + 'challenge', '');
  const [isOtpSent, setIsOtpSent, clearSent] = useSessionField(credentialKey + 'sent', false);
  const [userEmail, setUserEmail, clearEmail] = useSessionField(credentialKey + 'email', '');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isPasswordValid, setIsPasswordValid] = useState(passwordValid(newPassword));
  const passwordLock = useRef(false);
  const [pendingPassword, setPendingPassword, clearPendingPassword] = useSessionField<PasswordSubmission | null>(credentialKey + 'submission', null);

  useEffect(() => {
    let current = true;
    const load = async () => {
      const generation = accessGeneration.current;
      try {
        const response = await api.get<Permissions>('/api/teachers/me/access');
        if (!current || generation !== accessGeneration.current) return;
        accessReady.current = true;
        const draft = readDraft<Permissions>(accessKey);
        const next = draft?.values || response.data;
        desiredAccess.current = next;
        setAccess(next);
      } catch (err) {
        if (current) setAccessSnackbar({ open: true, message: errorMessage(err), severity: 'error' });
      }
    };
    void load();
    const online = () => { void syncDrafts(owner); void load(); };
    const synced = (event: Event) => {
      if ((event as CustomEvent<string>).detail === accessKey) {
        void load();
        setAccessSnackbar({ open: true, message: 'Parent access settings updated successfully.', severity: 'success' });
      }
    };
    window.addEventListener('online', online);
    window.addEventListener('ames-record-synced', synced);
    return () => { current = false; window.removeEventListener('online', online); window.removeEventListener('ames-record-synced', synced); };
  }, [accessKey, owner]);

  const persistSettingChange = (updates: Partial<Permissions>) => {
    if (!accessReady.current) { setAccessSnackbar({ open: true, message: 'Parent access settings are still loading. Please try again.', severity: 'error' }); return; }
    ++accessGeneration.current;
    const values = { ...desiredAccess.current, ...updates };
    desiredAccess.current = values;
    setAccess(values);
    const draft: Draft<Permissions> = { owner_id: owner, values, revision: crypto.randomUUID(), is_pending_sync: true, request: { path: '/api/teachers/me/access', method: 'put', data: values } };
    storeDraft(accessKey, draft);
    accessQueue.current = accessQueue.current.then(async () => {
      if (readDraft(accessKey)?.revision !== draft.revision) return;
      if (!navigator.onLine) {
        setAccessSnackbar({ open: true, message: 'Saved locally on device. Will automatically sync once reconnected.', severity: 'success' });
        return;
      }
      try {
        const response = await api.put('/api/teachers/me/access', values);
        if (response.status !== 200 && response.status !== 201) throw new Error('The server did not confirm this save.');
        confirmDraft(accessKey, draft.revision);
        setAccessSnackbar({ open: true, message: 'Parent access settings updated successfully.', severity: 'success' });
      } catch (err) {
        if (isNetworkError(err)) setAccessSnackbar({ open: true, message: 'Saved locally on device. Will automatically sync once reconnected.', severity: 'success' });
        else {
          if (readDraft(accessKey)?.revision === draft.revision) storeDraft(accessKey, { ...draft, is_pending_sync: false, error: errorMessage(err) });
          setAccessSnackbar({ open: true, message: errorMessage(err), severity: 'error' });
        }
      }
    });
  };
  const handleToggleStudentInfoView = (event: React.ChangeEvent<HTMLInputElement>) => persistSettingChange({ allow_parent_view_student_info: event.target.checked });
  const handleToggleEccdPre = (event: React.ChangeEvent<HTMLInputElement>) => persistSettingChange({ allow_parent_view_eccd_pre: event.target.checked });
  const handleToggleEccdMid = (event: React.ChangeEvent<HTMLInputElement>) => persistSettingChange({ allow_parent_view_eccd_mid: event.target.checked });
  const handleToggleEccdPost = (event: React.ChangeEvent<HTMLInputElement>) => persistSettingChange({ allow_parent_view_eccd_post: event.target.checked });
  const handleToggleStudentInfoEdit = (event: React.ChangeEvent<HTMLInputElement>) => persistSettingChange({ allow_parent_edit_student_info: event.target.checked });
  const handleToggleHomeBasedEdit = (event: React.ChangeEvent<HTMLInputElement>) => persistSettingChange({ allow_parent_edit_home_based_eccd: event.target.checked });
  const handleToggleAllEccd = () => {
    const next = !(allowParentViewEccdPre && allowParentViewEccdMid && allowParentViewEccdPost);
    persistSettingChange({ allow_parent_view_eccd_pre: next, allow_parent_view_eccd_mid: next, allow_parent_view_eccd_post: next });
  };
  const validatePasswords = () => {
    if (!oldPassword || !newPassword || !confirmPassword) return 'Please fill in all password fields.';
    if (!passwordValid(newPassword)) return 'The new password must meet all password requirements.';
    if (newPassword !== confirmPassword) return 'New passwords do not match.';
    if (newPassword === oldPassword) return 'Choose a different password.';
    return '';
  };
  const completePasswordChange = async (payload: PasswordSubmission) => {
    const response = await api.post<SessionResponse>('/api/teachers/change-password-verify', payload);
    if (response.status !== 200 && response.status !== 201) throw new Error('The server did not confirm this save.');
    login(response.data);
    localStorage.removeItem('ames_device_token');
    // A response to an earlier snapshot cannot erase edits made during the request.
    if (sessionStorage.getItem(credentialKey + 'old') === JSON.stringify(payload.oldPassword)) { setOldPassword(''); clearOld(); }
    if (sessionStorage.getItem(credentialKey + 'new') === JSON.stringify(payload.newPassword)) { setNewPassword(''); clearNew(); }
    if (sessionStorage.getItem(credentialKey + 'confirm') === JSON.stringify(payload.confirmPassword)) { setConfirmPassword(''); clearConfirm(); }
    setOtp(''); clearOtp();
    setChallengeToken(''); clearChallenge();
    setIsOtpSent(false); clearSent();
    clearEmail();
    setPendingPassword(null); clearPendingPassword();
    setPasswordSuccess('Password successfully updated!');
  };
  const handleRequestPasswordChange = async () => {
    if (passwordLock.current) return;
    setPasswordError(''); setPasswordSuccess('');
    const validation = validatePasswords();
    if (validation) { setPasswordError(validation); return; }
    const snapshot: PasswordSubmission = { oldPassword, newPassword, confirmPassword };
    passwordLock.current = true;
    setIsVerifying(true);
    try {
      const response = await api.post<PasswordChallenge>('/api/teachers/change-password-request', { oldPassword });
      const data = response.data;
      if (data.challengeToken) {
        setPendingPassword(snapshot);
        setChallengeToken(data.challengeToken);
        setUserEmail(data.email || '');
        setIsOtpSent(true);
        setPasswordSuccess(data.message);
      } else await completePasswordChange(snapshot);
    } catch (err) { setPasswordError(errorMessage(err)); }
    finally { passwordLock.current = false; setIsVerifying(false); }
  };
  const handleVerifyPasswordChange = async () => {
    if (passwordLock.current) return;
    setPasswordError(''); setPasswordSuccess('');
    if (!/^\d{6}$/.test(otp) || !challengeToken) { setPasswordError('Please enter the six-digit verification code.'); return; }
    const snapshot = pendingPassword || { oldPassword, newPassword, confirmPassword };
    if (!passwordValid(snapshot.newPassword) || snapshot.newPassword !== snapshot.confirmPassword) { setPasswordError('New passwords do not match or do not meet the password requirements.'); return; }
    passwordLock.current = true;
    setIsVerifying(true);
    try { await completePasswordChange({ ...snapshot, email: userEmail, otp, challengeToken }); }
    catch (err) { setPasswordError(errorMessage(err)); }
    finally { passwordLock.current = false; setIsVerifying(false); }
  };

  return (
    <Stack spacing={6} sx={{ p: { xs: 2, md: 4 }, minHeight: '85vh' }}>
      <Box sx={{ maxWidth: 900, mx: 'auto', width: '100%' }}>
        <Typography variant="h4" sx={{ fontWeight: '800', color: '#111827', mb: 0.5 }}>Settings</Typography>
        <Typography variant="body1" sx={{ color: 'textSecondary' }}>Manage teacher and parent access settings.</Typography>
      </Box>

      {/* === GLOBAL PARENT ACCESS SETTINGS PANEL === */}
      <Box sx={{ maxWidth: 900, mx: 'auto', width: '100%' }}>
        <Typography variant="h5" sx={{ fontWeight: '800', color: '#111827', mb: 0.5 }}>
          Global Parent Access
        </Typography>
        <Typography variant="body1" sx={{ mb: 3, color: 'text.secondary' }}>
          Control what records parents can see or update across all students in your advisory section.
        </Typography>
        
        <Stack spacing={3}>
          {/* Card 1: View Access Control */}
          <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <VisibilityIcon color="primary" />
              <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1e1e2f' }}>
                View Access Control
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
              Determine what information and assessment results parents are permitted to view.
            </Typography>

            <FormGroup sx={{ mb: 3 }}>
              <FormControlLabel 
                control={
                  <Switch 
                    checked={allowParentViewStudentInfo} 
                    onChange={handleToggleStudentInfoView} 
                    color="primary" 
                  />
                } 
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: allowParentViewStudentInfo ? 'primary.main' : 'text.secondary' }}>
                      Student / Child Information View
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                      Allows parents to view child profile data, section details, and teacher info.
                    </Typography>
                  </Box>
                } 
              />
            </FormGroup>

            <Divider sx={{ my: 2 }} />

            {/* Sub-Card: ECCD Assessment Results Release */}
            <Box sx={{ bgcolor: '#f8fafc', p: 3, borderRadius: 3, border: '1px solid #e2e8f0' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AssessmentOutlinedIcon color="primary" fontSize="small" />
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: '#1e1e2f' }}>
                    ECCD Assessment Results Release
                  </Typography>
                </Box>
                <Button 
                  size="small" 
                  variant="outlined" 
                  onClick={handleToggleAllEccd}
                  sx={{ textTransform: 'none', borderRadius: 2, fontSize: '0.75rem', fontWeight: 'bold' }}
                >
                  {allowParentViewEccdPre && allowParentViewEccdMid && allowParentViewEccdPost ? 'Lock All Periods' : 'Release All Periods'}
                </Button>
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
                Selectively publish official test results to parents as each testing window concludes. Unreleased periods remain hidden from parents.
              </Typography>

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: allowParentViewEccdPre ? 'primary.light' : '#e2e8f0', bgcolor: 'white' }}>
                    <FormControlLabel 
                      control={
                        <Switch 
                          checked={allowParentViewEccdPre} 
                          onChange={handleToggleEccdPre} 
                          color="primary" 
                          size="small"
                        />
                      } 
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 'bold', color: allowParentViewEccdPre ? 'primary.main' : 'text.secondary' }}>
                            Pre-Test Results
                          </Typography>
                          <Chip 
                            label={allowParentViewEccdPre ? 'Released' : 'Locked'} 
                            size="small" 
                            color={allowParentViewEccdPre ? 'success' : 'default'}
                            variant={allowParentViewEccdPre ? 'filled' : 'outlined'}
                            sx={{ mt: 0.5, fontSize: '0.65rem', height: 20 }}
                          />
                        </Box>
                      } 
                    />
                  </Paper>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: allowParentViewEccdMid ? 'warning.light' : '#e2e8f0', bgcolor: 'white' }}>
                    <FormControlLabel 
                      control={
                        <Switch 
                          checked={allowParentViewEccdMid} 
                          onChange={handleToggleEccdMid} 
                          color="warning" 
                          size="small"
                        />
                      } 
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 'bold', color: allowParentViewEccdMid ? 'warning.main' : 'text.secondary' }}>
                            Mid-Test Results
                          </Typography>
                          <Chip 
                            label={allowParentViewEccdMid ? 'Released' : 'Locked'} 
                            size="small" 
                            color={allowParentViewEccdMid ? 'warning' : 'default'}
                            variant={allowParentViewEccdMid ? 'filled' : 'outlined'}
                            sx={{ mt: 0.5, fontSize: '0.65rem', height: 20 }}
                          />
                        </Box>
                      } 
                    />
                  </Paper>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: allowParentViewEccdPost ? 'success.light' : '#e2e8f0', bgcolor: 'white' }}>
                    <FormControlLabel 
                      control={
                        <Switch 
                          checked={allowParentViewEccdPost} 
                          onChange={handleToggleEccdPost} 
                          color="success" 
                          size="small"
                        />
                      } 
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 'bold', color: allowParentViewEccdPost ? 'success.main' : 'text.secondary' }}>
                            Post-Test Results
                          </Typography>
                          <Chip 
                            label={allowParentViewEccdPost ? 'Released' : 'Locked'} 
                            size="small" 
                            color={allowParentViewEccdPost ? 'success' : 'default'}
                            variant={allowParentViewEccdPost ? 'filled' : 'outlined'}
                            sx={{ mt: 0.5, fontSize: '0.65rem', height: 20 }}
                          />
                        </Box>
                      } 
                    />
                  </Paper>
                </Grid>
              </Grid>
            </Box>
          </Paper>

          {/* Card 2: Edit Access Control */}
          <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <EditNoteIcon color="secondary" />
              <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1e1e2f' }}>
                Edit Access Control
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
              Control whether parents can submit modifications or complete home-based evaluation checklists.
            </Typography>

            <Stack spacing={2.5}>
              <Box sx={{ p: 2, borderRadius: 3, border: '1px solid #e2e8f0', bgcolor: allowParentEditStudentInfo ? '#fdf2f8' : '#fafafa' }}>
                <FormControlLabel 
                  control={
                    <Switch 
                      checked={allowParentEditStudentInfo} 
                      onChange={handleToggleStudentInfoEdit} 
                      color="secondary" 
                    />
                  } 
                  label={
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 'bold', color: allowParentEditStudentInfo ? 'secondary.main' : 'text.secondary' }}>
                        Student / Family Information Editing
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                        Permits parents to edit emergency contact, address, handedness, and parent profile info.
                      </Typography>
                    </Box>
                  } 
                />
              </Box>

              <Box sx={{ p: 2, borderRadius: 3, border: '1px solid #e2e8f0', bgcolor: allowParentEditHomeBasedEccd ? '#f0fdf4' : '#fafafa' }}>
                <FormControlLabel 
                  control={
                    <Switch 
                      checked={allowParentEditHomeBasedEccd} 
                      onChange={handleToggleHomeBasedEdit} 
                      color="success" 
                    />
                  } 
                  label={
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 'bold', color: allowParentEditHomeBasedEccd ? 'success.main' : 'text.secondary' }}>
                        Home-Based ECCD Checklist Editing
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                        Permits parents to complete and submit home-based observation indicators for their child.
                      </Typography>
                    </Box>
                  } 
                />
              </Box>
            </Stack>
          </Paper>
        </Stack>
      </Box>

      {/* === ACCOUNT SETTINGS PANEL === */}
      <Box sx={{ maxWidth: 900, mx: 'auto', width: '100%' }}>
          <Typography variant="h5" sx={{ fontWeight: '800', color: '#111827', mb: 0.5 }}>
            Account Settings
          </Typography>
          <Typography variant="body1" sx={{ mb: 3, color: 'textSecondary' }}>
            Change or update your account password.
          </Typography>

          {passwordError && <Alert severity="error" sx={{ mb: 3 }}>{passwordError}</Alert>}
          {passwordSuccess && <Alert severity="success" sx={{ mb: 3 }}>{passwordSuccess}</Alert>}

          <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                  <Grid container spacing={4}>
                      <Grid size={{ xs: 12, md: 7 }} >
                          <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#111827', mb: 1 }}>Current Password (Required):</Typography>
                          <TextField 
                              fullWidth 
                              type="password" 
                              size="small" 
                              placeholder="Enter current password to save"
                              value={oldPassword} 
                              onChange={(e) => setOldPassword(e.target.value)} 
                              sx={{ mb: 4, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                          />

                          <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#111827', mb: 1 }}>New Password:</Typography>
                          <TextField 
                              fullWidth 
                              type="password" 
                              size="small" 
                              placeholder="Enter new password"
                              value={newPassword} 
                              onChange={(e) => setNewPassword(e.target.value)} 
                              sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                          />

                          <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#111827', mb: 1 }}>Confirm New Password:</Typography>
                          <TextField 
                              fullWidth 
                              type="password" 
                              size="small" 
                              placeholder="Confirm new password"
                              value={confirmPassword} 
                              onChange={(e) => setConfirmPassword(e.target.value)} 
                              sx={{ mb: 3, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                          />

                          <Button 
                              variant="contained" 
                              color="primary" 
                              onClick={handleRequestPasswordChange}
                              disabled={isVerifying || !oldPassword || !newPassword || !isPasswordValid || newPassword !== confirmPassword}
                              sx={{ 
                                  bgcolor: 'var(--primary-color)', 
                                  textTransform: 'none', 
                                  fontWeight: 'bold', 
                                  width: 'fit-content',
                                  px: 5, 
                                  mt: 1,
                                  borderRadius: 2,
                                  boxShadow: 'none',
                                  '&.Mui-disabled': { bgcolor: 'action.disabledBackground' }
                              }}
                          >
                              Change Password
                          </Button>
                      </Grid>

                      <Grid size={{ xs: 12, md: 5 }} >
                          <Box sx={{ mt: { xs: 0, md: 9.5 } }}>
                              <PasswordValidator password={newPassword} onValidationChange={setIsPasswordValid} />
                          </Box>
                      </Grid>
                  </Grid>
          </Paper>
      </Box>

      {/* === OTP VERIFICATION MODAL === */}
      <Dialog 
          open={isOtpSent} 
          onClose={() => setIsOtpSent(false)}
          slotProps={{ paper: { sx: { borderRadius: 3, p: 1 } } }}
      >
          <DialogTitle sx={{ fontWeight: '900', color: '#111827' }}>Verification Required</DialogTitle>
          <DialogContent>
              <Typography variant="body2" sx={{ mb: 3, color: 'textSecondary' }}>
                  A verification code has been sent to your email. Please enter it below to confirm your password change.
              </Typography>

              {passwordError && <Alert severity="error" sx={{ mb: 2 }}>{passwordError}</Alert>}

              <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Verification Code (OTP)</Typography>
              <TextField 
                  fullWidth 
                  size="small" 
                  value={otp} 
                  onChange={(e) => setOtp(e.target.value)} 
                  sx={{ mb: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }} 
              />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button 
                  variant="outlined" 
                  onClick={() => { setIsOtpSent(false); setPasswordError(''); setPasswordSuccess(''); }}
                  sx={{ textTransform: 'none', fontWeight: 'bold', borderRadius: 2 }}
              >
                  Cancel
              </Button>
              <Button 
                  variant="contained" 
                  color="success" 
                  onClick={handleVerifyPasswordChange}
                  disabled={isVerifying}
                  sx={{ textTransform: 'none', fontWeight: 'bold', borderRadius: 2, boxShadow: 'none' }}
              >
                  {isVerifying ? 'Verifying...' : 'Verify & Update'}
              </Button>
          </DialogActions>
      </Dialog>

      {/* Access Settings Snackbar */}
      <Snackbar
        open={accessSnackbar.open}
        autoHideDuration={4000}
        onClose={() => setAccessSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setAccessSnackbar((prev) => ({ ...prev, open: false }))}
          severity={accessSnackbar.severity}
          variant="filled"
          sx={{ borderRadius: 2 }}
        >
          {accessSnackbar.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
};

export default TeacherSettings;

