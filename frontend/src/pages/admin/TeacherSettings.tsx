import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, Paper, Switch, FormControlLabel, FormGroup, 
  TextField, Button, Alert, Stack, Grid, Dialog, 
  DialogTitle, DialogContent, DialogActions, Snackbar, Divider, Chip 
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditNoteIcon from '@mui/icons-material/EditNote';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import PasswordValidator from '../../components/PasswordValidator';
import api from '../../services/api';

const TeacherSettings: React.FC = () => {
  // Granular Parent Access States
  const [allowParentViewStudentInfo, setAllowParentViewStudentInfo] = useState(true);
  const [allowParentViewEccdPre, setAllowParentViewEccdPre] = useState(false);
  const [allowParentViewEccdMid, setAllowParentViewEccdMid] = useState(false);
  const [allowParentViewEccdPost, setAllowParentViewEccdPost] = useState(false);
  const [allowParentEditStudentInfo, setAllowParentEditStudentInfo] = useState(true);
  const [allowParentEditHomeBasedEccd, setAllowParentEditHomeBasedEccd] = useState(false);
  const [accessSnackbar, setAccessSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isPasswordValid, setIsPasswordValid] = useState(false);

  useEffect(() => {
    fetchAccessSettings();
  }, []);

  const fetchAccessSettings = async () => {
    try {
      const response = await api.get('/api/teachers/me/access');
      if (response.data) {
        const data = response.data;
        setAllowParentViewStudentInfo(
          data.allow_parent_view_student_info ?? data.allow_parent_view ?? true
        );
        setAllowParentViewEccdPre(Boolean(data.allow_parent_view_eccd_pre));
        setAllowParentViewEccdMid(Boolean(data.allow_parent_view_eccd_mid));
        setAllowParentViewEccdPost(Boolean(data.allow_parent_view_eccd_post));
        setAllowParentEditStudentInfo(
          data.allow_parent_edit_student_info ?? data.allow_parent_edit ?? true
        );
        setAllowParentEditHomeBasedEccd(
          Boolean(data.allow_parent_edit_home_based_eccd ?? data.allow_parent_home_based_edit)
        );
      }
    } catch (err) {
      console.error("Failed to fetch access settings.", err);
    }
  };

  const persistSettingChange = async (updates: Record<string, boolean>) => {
    try {
      await api.put('/api/teachers/me/access', updates);
      setAccessSnackbar({
        open: true,
        message: 'Parent access settings updated successfully.',
        severity: 'success',
      });
    } catch (err) {
      console.error("Failed to save settings", err);
      setAccessSnackbar({
        open: true,
        message: 'Failed to update access settings. Please try again.',
        severity: 'error',
      });
    }
  };

  const handleToggleStudentInfoView = (event: React.ChangeEvent<HTMLInputElement>) => {
    const val = event.target.checked;
    setAllowParentViewStudentInfo(val);
    persistSettingChange({ allow_parent_view_student_info: val });
  };

  const handleToggleEccdPre = (event: React.ChangeEvent<HTMLInputElement>) => {
    const val = event.target.checked;
    setAllowParentViewEccdPre(val);
    persistSettingChange({ allow_parent_view_eccd_pre: val });
  };

  const handleToggleEccdMid = (event: React.ChangeEvent<HTMLInputElement>) => {
    const val = event.target.checked;
    setAllowParentViewEccdMid(val);
    persistSettingChange({ allow_parent_view_eccd_mid: val });
  };

  const handleToggleEccdPost = (event: React.ChangeEvent<HTMLInputElement>) => {
    const val = event.target.checked;
    setAllowParentViewEccdPost(val);
    persistSettingChange({ allow_parent_view_eccd_post: val });
  };

  const handleToggleAllEccd = () => {
    const allActive = allowParentViewEccdPre && allowParentViewEccdMid && allowParentViewEccdPost;
    const targetVal = !allActive;
    setAllowParentViewEccdPre(targetVal);
    setAllowParentViewEccdMid(targetVal);
    setAllowParentViewEccdPost(targetVal);
    persistSettingChange({
      allow_parent_view_eccd_pre: targetVal,
      allow_parent_view_eccd_mid: targetVal,
      allow_parent_view_eccd_post: targetVal,
    });
  };

  const handleToggleStudentInfoEdit = (event: React.ChangeEvent<HTMLInputElement>) => {
    const val = event.target.checked;
    setAllowParentEditStudentInfo(val);
    persistSettingChange({ allow_parent_edit_student_info: val });
  };

  const handleToggleHomeBasedEdit = (event: React.ChangeEvent<HTMLInputElement>) => {
    const val = event.target.checked;
    setAllowParentEditHomeBasedEccd(val);
    persistSettingChange({ allow_parent_edit_home_based_eccd: val });
  };

  const handleRequestPasswordChange = async () => {
    setPasswordError('');
    setPasswordSuccess('');
    
    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordError('Please fill in all password fields.');
      return;
    }

    if (newPassword !== confirmPassword) {
        setPasswordError('New passwords do not match.');
        return;
    }

    try {
      const response = await api.post('/api/teachers/change-password-request', { oldPassword });
      const data = response.data;
      
      if (data) {
        setIsOtpSent(true);
        setUserEmail(data.email);
        setPasswordSuccess('Verification code sent to your email.');
      }
    } catch (err: any) {
      setPasswordError((err.response?.data?.detail || err.response?.data?.message) || 'Failed to request password change.');
    }
  };

  const handleVerifyPasswordChange = async () => {
    setPasswordError('');
    setPasswordSuccess('');

    if (!otp) {
      setPasswordError('Please enter the verification code.');
      return;
    }

    try {
      setIsVerifying(true);
      const response = await api.post('/api/teachers/change-password-verify', { email: userEmail, otp, newPassword });
      
      if (response.data) {
        setPasswordSuccess('Password successfully updated!');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setOtp('');
        setIsOtpSent(false);
      }
    } catch (err: any) {
      setPasswordError((err.response?.data?.detail || err.response?.data?.message) || 'Failed to update password.');
    } finally {
        setIsVerifying(false);
    }
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
                              disabled={!oldPassword || !newPassword || !isPasswordValid || newPassword !== confirmPassword}
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

