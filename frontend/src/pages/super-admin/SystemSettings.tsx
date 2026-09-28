import React, { useState, useEffect, useContext } from 'react';
import { Box, Typography, Button, Paper, TextField, Alert, Avatar, Modal, IconButton, Grid } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import InsertPhotoOutlinedIcon from '@mui/icons-material/InsertPhotoOutlined';
import CheckIcon from '@mui/icons-material/Check';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';

import { SettingsContext } from '../../context/SettingsContext';
import PasswordValidator from '../../components/PasswordValidator';
import api from '../../services/api';

const SystemSettings: React.FC = () => {
  const { settings, setSettings } = useContext(SettingsContext);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [systemTitle, setSystemTitle] = useState(settings.system_title);
  const [primaryColor, setPrimaryColor] = useState(settings.primary_color);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [accountError, setAccountError] = useState('');
  const [accountSuccess, setAccountSuccess] = useState('');
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otp, setOtp] = useState('');
  
  const [isAccountLoading, setIsAccountLoading] = useState(false);
  
  const [backupError, setBackupError] = useState('');
  const [backupSuccess, setBackupSuccess] = useState('');
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const [rolloverModalOpen, setRolloverModalOpen] = useState(false);
  const [undoModalOpen, setUndoModalOpen] = useState(false);
  const [isRollingOver, setIsRollingOver] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [rolloverError, setRolloverError] = useState('');
  const [rolloverSuccess, setRolloverSuccess] = useState('');

  const handleDownloadBackup = async () => {
      setBackupError('');
      setBackupSuccess('');
      try {
          const response = await api.get('/api/backup/export', { responseType: 'blob' });
          const blob = new Blob([response.data]);
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const contentDisposition = response.headers['content-disposition'];
          let fileName = `ames_backup_${Date.now()}.enc`;
          if (contentDisposition) {
              const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
              if (fileNameMatch && fileNameMatch.length === 2) fileName = fileNameMatch[1];
          }
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(url);
          setBackupSuccess('Backup downloaded successfully!');
      } catch (err: any) {
          setBackupError((err.response?.data?.detail || (err.response?.data?.detail || err.response?.data?.message)) || err.message || 'Error downloading backup.');
      }
  };

  const handleRestoreSubmit = async () => {
      if (!restoreFile) return;
      setIsRestoring(true);
      setBackupError('');
      setBackupSuccess('');
        try {
            const formData = new FormData();
            formData.append('file', restoreFile);
            
            await api.post('/api/backup/restore', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
            
            setBackupSuccess('System restored successfully!');
          setRestoreModalOpen(false);
          setRestoreFile(null);
      } catch (err: any) {
          setBackupError((err.response?.data?.detail || (err.response?.data?.detail || err.response?.data?.message)) || 'Failed to restore system.');
          setRestoreModalOpen(false);
      } finally {
          setIsRestoring(false);
      }
  };
  
  const handleRolloverSubmit = async () => {
      setIsRollingOver(true);
      setRolloverError('');
      setRolloverSuccess('');
      try {
          const response = await api.post('/api/settings/rollover');
          setRolloverSuccess('System successfully rolled over to the next school year.');
          setSettings({ 
              ...settings, 
              current_school_year: response.data.next_school_year,
              previous_school_year: settings.current_school_year,
              last_rollover_timestamp: new Date().toISOString()
          });
          setRolloverModalOpen(false);
      } catch (err: any) {
          setRolloverError((err.response?.data?.detail || (err.response?.data?.detail || err.response?.data?.message)) || 'Failed to roll over system.');
          setRolloverModalOpen(false);
      } finally {
          setIsRollingOver(false);
      }
  };

  const handleUndoRollover = async () => {
      setIsUndoing(true);
      setRolloverError('');
      setRolloverSuccess('');
      try {
          const response = await api.post('/api/settings/undo-rollover');
          setRolloverSuccess('Rollover undone successfully. Restored to previous school year.');
          setSettings({ 
              ...settings, 
              current_school_year: response.data.restored_school_year,
              previous_school_year: null,
              last_rollover_timestamp: null
          });
          setUndoModalOpen(false);
      } catch (err: any) {
          setRolloverError((err.response?.data?.detail || (err.response?.data?.detail || err.response?.data?.message)) || 'Failed to undo rollover.');
          setUndoModalOpen(false);
      } finally {
          setIsUndoing(false);
      }
  };
  
  const handleAccountSave = async () => {
    if (isAccountLoading) return;
    setAccountError('');
    setAccountSuccess('');
    
    if (!currentPassword) {
        return setAccountError('Current password is required to make account changes.');
    }
    if (!newEmail && !newPassword) {
        return setAccountError('Please enter a new email or new password to update.');
    }
    
    if (newEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail)) {
            return setAccountError('Please enter a valid email address.');
        }

        setIsAccountLoading(true);

        try {
            await api.post('/api/chairman/verify-password', { currentPassword });
            
            await api.post('/api/auth/send-otp', { email: newEmail });
            setOtpModalOpen(true);
        } catch (err: any) {
            setAccountError((err.response?.data?.detail || (err.response?.data?.detail || err.response?.data?.message)) || 'Cannot connect to the server.');
        } finally {
            setIsAccountLoading(false);
        }
    } else {
        submitAccountUpdate();
    }
  };

  const submitAccountUpdate = async () => {
      if (isAccountLoading) return;
      setIsAccountLoading(true);
      setAccountError('');
      try {
          await api.put('/api/chairman/account', {
              currentPassword,
              newEmail: newEmail || undefined,
              newPassword: newPassword || undefined,
              otp: otp || undefined
          });
          setAccountSuccess('Account updated successfully!');
          setCurrentPassword('');
          setNewEmail('');
          setNewPassword('');
          setConfirmPassword('');
          setOtp('');
          setOtpModalOpen(false);
      } catch (err: any) {
          setAccountError((err.response?.data?.detail || (err.response?.data?.detail || err.response?.data?.message)) || 'Failed to update account.');
          if (err.response?.data?.requireOtp) {
              setOtpModalOpen(true);
          }
      } finally {
          setIsAccountLoading(false);
      }
  };

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState(settings.logo_url);
  const [existingLogoUrl, setExistingLogoUrl] = useState(settings.logo_url);

  useEffect(() => {
    setSystemTitle(settings.system_title); setPrimaryColor(settings.primary_color);
setPrimaryColor(settings.primary_color);
if (!logoFile) return;
    setPrimaryColor(settings.primary_color);
    
    if (!logoFile) {
        setLogoPreview(settings.logo_url);
        setExistingLogoUrl(settings.logo_url);
    }
  }, [settings, logoFile]);

  const colorThemes = [
    { id: 'blue', hex: '#2563EB' },
    { id: 'green', hex: '#059669' },
    { id: 'red', hex: '#E11D48' },
    { id: 'orange', hex: '#EA580C' }
  ];

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file)); 
    }
  };

  const handleSaveChanges = async () => {
    setError('');
    setSuccess('');

    const formData = new FormData();
    formData.append('system_title', systemTitle);
    formData.append('primary_color', primaryColor);
    formData.append('existing_logo_url', existingLogoUrl);
    formData.append('existing_profile_pic_url', '');

    if (logoFile) formData.append('systemLogo', logoFile);

    try {
      const response = await api.put('/api/settings/update', formData);
      
      setSuccess('System personalization saved successfully!');
      setExistingLogoUrl(response.data.settings.logo_url);
      setLogoFile(null); 
      
      setSettings({
          ...settings,
          system_title: systemTitle,
          primary_color: primaryColor,
          logo_url: response.data.settings.logo_url,
          profile_pic_url: ''
      });
    } catch (err: any) {
      setError((err.response?.data?.detail || (err.response?.data?.detail || err.response?.data?.error)) || 'Failed to save settings.');
    }
  };

  const currentYearStr = settings.current_school_year || '2026-2027';
  const parts = currentYearStr.split('-');
  let nextYearStr = '2027-2028'; 
  if (parts.length === 2 && !isNaN(parseInt(parts[0])) && !isNaN(parseInt(parts[1]))) {
      nextYearStr = `${parseInt(parts[0]) + 1}-${parseInt(parts[1]) + 1}`;
  }

  let isUndoAvailable = false;
  let hoursRemaining = '0';
  if (settings.last_rollover_timestamp) {
      const lastRollover = new Date(settings.last_rollover_timestamp);
      const now = new Date();
      const diffInHours = (now.getTime() - lastRollover.getTime()) / (1000 * 60 * 60);
      if (diffInHours <= 24) {
          isUndoAvailable = true;
          hoursRemaining = Math.max(0, 24 - diffInHours).toFixed(1);
      }
  }

  return (
    <Box sx={{ p: 3, minHeight: '85vh' }}>
      
      <Box sx={{ mb: 4, maxWidth: 900, mx: 'auto' }}>
          <Typography variant="h4" sx={{ fontWeight: '800', color: '#111827', mb: 0.5 }}>
            System Settings
          </Typography>
          <Typography variant="body1" sx={{ color: 'textSecondary' }}>
            Manage system appearance and overall data.
          </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3, maxWidth: 900, mx: 'auto', borderRadius: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 3, maxWidth: 900, mx: 'auto', borderRadius: 2 }}>{success}</Alert>}

      <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: 4, maxWidth: 900, mx: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
        <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', flexDirection: 'column', borderRight: { md: '1px solid #E5E7EB' }, pr: { md: 4 } }}>
                <Typography variant="subtitle2" sx={{ color: '#9CA3AF', fontWeight: 'bold', letterSpacing: 1, mb: 3 }}>
                    IDENTITY
                </Typography>

                <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#111827', mb: 1 }}>
                    School/System Name:
                </Typography>
                <TextField 
                    fullWidth 
                    value={systemTitle}
                    onChange={(e) => setSystemTitle(e.target.value)} 
                    variant="outlined" 
                    size="small" 
                    sx={{ mb: 4, '& .MuiOutlinedInput-root': { borderRadius: 4 } }}
                />

                <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#111827', mb: 1 }}>
                    Portal Logo:
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 'auto' }}>
                    <Avatar 
                        src={logoPreview} 
                        sx={{ width: 64, height: 64, bgcolor: '#F3F4F6', border: '1px solid #E5E7EB' }}
                    >
                        {!logoPreview && <InsertPhotoOutlinedIcon sx={{ color: '#9CA3AF' }} />}
                    </Avatar>
                    <Button 
                        component="label" 
                        variant="outlined" 
                        startIcon={<FileUploadOutlinedIcon />}
                        sx={{ 
                            bgcolor: '#EEF2FF', 
                            color: '#4F46E5', 
                            borderColor: '#EEF2FF',
                            textTransform: 'none', 
                            fontWeight: 'bold',
                            borderRadius: 24,
                            '&:hover': { bgcolor: '#E0E7FF', borderColor: '#E0E7FF' }
                        }}
                    >
                        Upload New Logo
                        <input hidden accept="image/*" type="file" onChange={handleLogoChange} />
                    </Button>
                </Box>

                <Button 
                    variant="contained" 
                    onClick={handleSaveChanges}
                    sx={{ 
                        bgcolor: 'var(--primary-color)', 
                        textTransform: 'none', 
                        fontWeight: 'bold', 
                        width: 'fit-content',
                        px: 5, 
                        mt: 6,
                        borderRadius: 24,
                        boxShadow: 'none'
                    }}
                >
                    Save
                </Button>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }} sx={{ pl: { md: 4 } }}>
                <Typography variant="subtitle2" sx={{ color: '#9CA3AF', fontWeight: 'bold', letterSpacing: 1, mb: 3 }}>
                    COLOR THEME
                </Typography>
                
                <Typography variant="body2" sx={{ color: '#111827', mb: 2 }}>
                    Select the color for the system
                </Typography>

                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                    {colorThemes.map((theme) => (
                        <Box 
                            key={theme.id}
                            onClick={() => setPrimaryColor(theme.hex)}
                            sx={{ 
                                width: 48, 
                                height: 48, 
                                borderRadius: '50%', 
                                bgcolor: theme.hex, 
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                transition: 'transform 0.2s',
                                '&:hover': { transform: 'scale(1.1)' }
                            }}
                        >
                            {primaryColor.toLowerCase() === theme.hex.toLowerCase() && <CheckIcon sx={{ color: 'white' }} />}
                        </Box>
                    ))}

                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 1.5, 
                      ml: { xs: 0, sm: 2 }, 
                      mt: { xs: 2, sm: 0 }, 
                      pl: { xs: 0, sm: 3 }, 
                      borderLeft: { xs: 'none', sm: '1px solid #E5E7EB' } 
                  }}>
                      <Typography variant="body2" sx={{ color: '#6B7280', fontWeight: 'bold' }}>
                          Custom:
                      </Typography>
                      
                      <Box sx={{ 
                          width: 48, 
                          height: 48, 
                          borderRadius: '50%', 
                          overflow: 'hidden', 
                          border: '1px solid #E5E7EB', 
                          display: 'flex',
                          position: 'relative'
                      }}>
                          <input 
                              type="color" 
                              value={primaryColor} 
                              onChange={(e) => setPrimaryColor(e.target.value)} 
                              style={{ width: '200%', height: '200%', border: 'none', margin: '-50%', cursor: 'pointer' }}
                          />
                          
                          <EditOutlinedIcon 
                              sx={{
                                  position: 'absolute',
                                  top: '50%',
                                  left: '50%',
                                  transform: 'translate(-50%, -50%)', 
                                  color: 'white',
                                  filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.5))', 
                                  pointerEvents: 'none',
                                  fontSize: '1.2rem'
                              }}
                          />
                      </Box>
                  </Box>
                </Box>
            </Grid>

        </Grid>
      </Paper>

      <Box sx={{ mb: 4, maxWidth: 900, mx: 'auto', mt: 6 }}>
          <Typography variant="h5" sx={{ fontWeight: '800', color: '#111827', mb: 0.5 }}>
            Account Settings
          </Typography>
          <Typography variant="body1" sx={{ mb: 3, color: 'textSecondary' }}>
            Update your email and password
          </Typography>
          
          {accountError && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{accountError}</Alert>}
          {accountSuccess && <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }}>{accountSuccess}</Alert>}
          
          <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
            <Grid container spacing={4}>
                <Grid size={{ xs: 12, md: 6 }} >
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#111827', mb: 1 }}>
                        Current Password (Required):
                    </Typography>
                    <TextField 
                        fullWidth 
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)} 
                        variant="outlined" 
                        size="small" 
                        placeholder="Enter current password to save"
                        sx={{ mb: 1, '& .MuiOutlinedInput-root': { borderRadius: 4 } }}
                    />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }} >
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#111827', mb: 1 }}>
                        New Email (Optional):
                    </Typography>
                    <TextField 
                        fullWidth 
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)} 
                        variant="outlined" 
                        size="small" 
                        placeholder="Enter new email"
                        sx={{ mb: 1, '& .MuiOutlinedInput-root': { borderRadius: 4 } }}
                    />
                </Grid>

                <Grid size={{ xs: 12, md: 6 }} >
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#111827', mb: 1 }}>
                        New Password (Optional):
                    </Typography>
                    <TextField 
                        fullWidth 
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)} 
                        variant="outlined" 
                        size="small"
                        placeholder="Enter new password"
                        sx={{ mb: 1, '& .MuiOutlinedInput-root': { borderRadius: 4 } }}
                    />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }} >
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#111827', mb: 1 }}>
                        Confirm New Password:
                    </Typography>
                    <TextField 
                        fullWidth 
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)} 
                        variant="outlined" 
                        size="small"
                        placeholder="Confirm new password"
                        sx={{ mb: 1, '& .MuiOutlinedInput-root': { borderRadius: 4 } }}
                    />
                </Grid>
                
                <Grid size={{ xs: 12, md: 6 }} >
                    <PasswordValidator password={newPassword} onValidationChange={setIsPasswordValid} />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }} ></Grid>

                <Grid size={{ xs: 12, md: 6 }} >
                    <Button 
                        variant="contained" 
                        onClick={handleAccountSave}
                        disabled={isAccountLoading || !currentPassword || (newPassword.length > 0 && !isPasswordValid) || ((newPassword.length > 0 || confirmPassword.length > 0) && newPassword !== confirmPassword)}
                        sx={{ 
                            bgcolor: isAccountLoading ? 'grey.400' : 'var(--primary-color)', 
                            textTransform: 'none', 
                            fontWeight: 'bold', 
                            width: 'fit-content',
                            px: 5, 
                            mt: 1,
                            borderRadius: 24,
                            boxShadow: 'none',
                            '&.Mui-disabled': { bgcolor: 'action.disabledBackground' }
                        }}
                    >
                        {isAccountLoading ? 'Saving...' : 'Update Account'}
                    </Button>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }} ></Grid>
            </Grid>
          </Paper>
      </Box>

      <Box sx={{ mb: 4, maxWidth: 900, mx: 'auto', mt: 6 }}>
          <Typography variant="h5" sx={{ fontWeight: '800', color: '#111827', mb: 0.5 }}>
            Data Backup & Restore
          </Typography>
          <Typography variant="body1" sx={{ mb: 3, color: 'textSecondary' }}>
            Securely Download or Restore System
          </Typography>
          
          {backupError && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{backupError}</Alert>}
          {backupSuccess && <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }}>{backupSuccess}</Alert>}
          
          <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
            <Grid container spacing={4}>
                <Grid size={{ xs: 12, md: 6 }} >
                    <Typography variant="subtitle2" sx={{ color: '#9CA3AF', fontWeight: 'bold', letterSpacing: 1, mb: 3 }}>
                        ENCRYPTED EXPORT
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#111827', mb: 2 }}>
                        Generate and download an AES-256 encrypted backup of the entire school database
                    </Typography>
                    
                    <Button 
                        variant="contained" 
                        onClick={handleDownloadBackup}
                        sx={{ 
                            bgcolor: 'var(--primary-color)', 
                            textTransform: 'none', 
                            fontWeight: 'bold', 
                            px: 3, 
                            mt: 2,
                            borderRadius: 24,
                            boxShadow: 'none'
                        }}
                    >
                        Download Encrypted Backup
                    </Button>
                </Grid>
                
                <Grid size={{ xs: 12, md: 6 }} >
                    <Typography variant="subtitle2" sx={{ color: '#9CA3AF', fontWeight: 'bold', letterSpacing: 1, mb: 3 }}>
                        SYSTEM RESTORE
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#111827', mb: 2 }}>
                        Upload a previously generated `.enc` backup file to safely restore the system. 
                        <strong>Warning: This action overwrites current data.</strong>
                    </Typography>
                    
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                        <Button 
                            component="label" 
                            variant="outlined" 
                            sx={{ 
                                borderColor: '#E5E7EB',
                                color: '#4B5563',
                                textTransform: 'none', 
                                fontWeight: 'bold',
                                borderRadius: 24
                            }}
                        >
                            {restoreFile ? restoreFile.name : 'Choose Backup File'}
                            <input hidden accept=".enc,.bak" type="file" onChange={(e) => setRestoreFile(e.target.files?.[0] || null)} />
                        </Button>
                        
                        <Button 
                            variant="contained" 
                            color="error"
                            disabled={!restoreFile}
                            onClick={() => setRestoreModalOpen(true)}
                            sx={{ 
                                textTransform: 'none', 
                                fontWeight: 'bold', 
                                px: 4, 
                                borderRadius: 24,
                                boxShadow: 'none'
                            }}
                        >
                            Restore System
                        </Button>
                    </Box>
                </Grid>
            </Grid>
          </Paper>
      </Box>

      <Box sx={{ mb: 4, maxWidth: 900, mx: 'auto', mt: 6 }}>
          <Typography variant="h5" sx={{ fontWeight: '800', color: '#111827', mb: 0.5 }}>
            School Year Management
          </Typography>
          <Typography variant="body1" sx={{ mb: 3, color: 'textSecondary' }}>
            Advance the system to a new school year
          </Typography>
          
          {rolloverError && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{rolloverError}</Alert>}
          {rolloverSuccess && <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }}>{rolloverSuccess}</Alert>}
          
          <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
            <Grid container spacing={4}>
                <Grid size={{ xs: 12, md: 6 }} >
                    <Typography variant="subtitle2" sx={{ color: '#9CA3AF', fontWeight: 'bold', letterSpacing: 1, mb: 3 }}>
                        CURRENT STATUS
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#111827', mb: 1 }}>
                        Active School Year:
                    </Typography>
                    <Typography variant="h6" sx={{ color: 'var(--primary-color)', fontWeight: 'bold', mb: 2 }}>
                        {settings.current_school_year || '2026-2027'}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'textSecondary' }}>
                        Advancing the school year will permanently archive all current students and reset all parent-teacher communications.
                    </Typography>
                </Grid>
                
                <Grid size={{ xs: 12, md: 6 }} >
                    <Typography variant="subtitle2" sx={{ color: '#9CA3AF', fontWeight: 'bold', letterSpacing: 1, mb: 3 }}>
                        SYSTEM ROLLOVER
                    </Typography>
                    
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Button 
                            variant="contained" 
                            color="error"
                            onClick={() => setRolloverModalOpen(true)}
                            sx={{ 
                                textTransform: 'none', 
                                fontWeight: 'bold', 
                                px: 4, 
                                borderRadius: 24,
                                boxShadow: 'none'
                            }}
                        >
                            Advance System to {nextYearStr}
                        </Button>

                        {isUndoAvailable && (
                            <Button
                                variant="outlined"
                                color="warning"
                                onClick={() => setUndoModalOpen(true)}
                                sx={{
                                    textTransform: 'none',
                                    fontWeight: 'bold',
                                    borderRadius: 24
                                }}
                            >
                                Undo Last Rollover ({hoursRemaining}h remaining)
                            </Button>
                        )}
                    </Box>
                </Grid>
            </Grid>
          </Paper>
      </Box>

      <Modal open={rolloverModalOpen} onClose={() => setRolloverModalOpen(false)}>
          <Box sx={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              width: { xs: '90%', sm: 400 }, bgcolor: 'background.paper', borderRadius: 4, p: 4,
              boxShadow: 24, textAlign: 'center'
          }}>
              <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'error.main', mb: 2 }}>
                  WARNING: SYSTEM ROLLOVER
              </Typography>
              <Typography variant="body2" sx={{ mb: 4, color: 'textSecondary' }}>
                  This will archive all current students, reset all parent-teacher communications, and advance the school year to <strong>{nextYearStr}</strong>. Are you sure you want to proceed?
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                  <Button 
                      variant="outlined"
                      onClick={() => setRolloverModalOpen(false)}
                      disabled={isRollingOver}
                      sx={{ textTransform: 'none', fontWeight: 'bold', borderColor: '#E5E7EB', color: '#4B5563', borderRadius: 24 }}
                  >
                      Cancel
                  </Button>
                  <Button 
                      variant="contained" 
                      color="error"
                      onClick={handleRolloverSubmit}
                      disabled={isRollingOver}
                      sx={{ textTransform: 'none', fontWeight: 'bold', borderRadius: 24 }}
                  >
                      {isRollingOver ? 'Processing...' : 'Yes, Advance Year'}
                  </Button>
              </Box>
          </Box>
      </Modal>

      <Modal open={undoModalOpen} onClose={() => setUndoModalOpen(false)}>
          <Box sx={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              width: { xs: '90%', sm: 400 }, bgcolor: 'background.paper', borderRadius: 4, p: 4,
              boxShadow: 24, textAlign: 'center'
          }}>
              <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'warning.main', mb: 2 }}>
                  UNDO SYSTEM ROLLOVER
              </Typography>
              <Typography variant="body2" sx={{ mb: 4, color: 'textSecondary' }}>
                  This will restore the active school year to <strong>{settings.previous_school_year}</strong>, restoring all previously archived students and messages. Do you wish to proceed?
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                  <Button 
                      variant="outlined"
                      onClick={() => setUndoModalOpen(false)}
                      disabled={isUndoing}
                      sx={{ textTransform: 'none', fontWeight: 'bold', borderColor: '#E5E7EB', color: '#4B5563', borderRadius: 24 }}
                  >
                      Cancel
                  </Button>
                  <Button 
                      variant="contained" 
                      color="warning"
                      onClick={handleUndoRollover}
                      disabled={isUndoing}
                      sx={{ textTransform: 'none', fontWeight: 'bold', borderRadius: 24 }}
                  >
                      {isUndoing ? 'Restoring...' : 'Yes, Undo Rollover'}
                  </Button>
              </Box>
          </Box>
      </Modal>

      <Modal open={restoreModalOpen} onClose={() => setRestoreModalOpen(false)}>
          <Box sx={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              width: { xs: '90%', sm: 400 }, bgcolor: 'background.paper', borderRadius: 4, p: 4,
              boxShadow: 24, textAlign: 'center'
          }}>
              <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'error.main', mb: 2 }}>
                  WARNING: SYSTEM RESTORE
              </Typography>
              <Typography variant="body2" sx={{ mb: 4, color: 'textSecondary' }}>
                  Restoring will completely overwrite all current data across the entire school system. Any unbacked-up progress will be permanently lost. Are you absolutely sure you want to proceed?
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                  <Button 
                      variant="outlined"
                      onClick={() => setRestoreModalOpen(false)}
                      disabled={isRestoring}
                      sx={{ textTransform: 'none', fontWeight: 'bold', borderColor: '#E5E7EB', color: '#4B5563', borderRadius: 24 }}
                  >
                      Cancel
                  </Button>
                  <Button 
                      variant="contained" 
                      color="error"
                      onClick={handleRestoreSubmit}
                      disabled={isRestoring}
                      sx={{ textTransform: 'none', fontWeight: 'bold', borderRadius: 24 }}
                  >
                      {isRestoring ? 'Restoring...' : 'Yes, Overwrite Data'}
                  </Button>
              </Box>
          </Box>
      </Modal>

      <Modal open={otpModalOpen} onClose={() => setOtpModalOpen(false)}>
          <Box sx={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              width: { xs: '90%', sm: 400 }, bgcolor: 'background.paper', borderRadius: 4, p: 4,
              boxShadow: 24, textAlign: 'center'
          }}>
              <IconButton 
                  onClick={() => setOtpModalOpen(false)} 
                  sx={{ position: 'absolute', right: 8, top: 8 }}
              >
                  <CloseIcon />
              </IconButton>
              <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2 }}>
                  Email Verification
              </Typography>
              <Typography variant="body2" sx={{ mb: 3, color: 'textSecondary' }}>
                  An OTP has been sent to {newEmail}. Please enter it below to verify your new email address.
              </Typography>
              <TextField 
                  fullWidth 
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)} 
                  variant="outlined" 
                  size="small" 
                  placeholder="Enter 6-digit OTP"
                  sx={{ mb: 3, '& .MuiOutlinedInput-root': { borderRadius: 4 } }}
                  slotProps={{ input: {  style: { textAlign: 'center', letterSpacing: 4, fontSize: 20 } } }}
              />
              <Button 
                  fullWidth
                  variant="contained" 
                  onClick={submitAccountUpdate}
                  disabled={isAccountLoading}
                  sx={{ bgcolor: isAccountLoading ? 'grey.400' : 'var(--primary-color)', textTransform: 'none', fontWeight: 'bold', borderRadius: 24 }}
              >
                  {isAccountLoading ? 'Verifying...' : 'Verify & Save'}
              </Button>
          </Box>
      </Modal>

    </Box>
  );
};

export default SystemSettings;






