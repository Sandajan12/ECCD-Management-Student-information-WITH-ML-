import React, { useState, useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import type { SelectChangeEvent } from '@mui/material';
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
  Stack,
  Grid,
} from '@mui/material';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import SaveIcon from '@mui/icons-material/Save';
import { errorMessage } from '../../services/api';
import { useChildren } from '../../hooks/useChildren';
import { useParentProfile } from '../../hooks/useParentProfile';
import { PROFILE_FIELDS, profilePayload, validateProfile, type ProfileField } from '../../utils/parentProfile';
import { calculateDecimalAge } from '../../utils/dateUtils';

const ChildManagement: React.FC = () => {
  const roster = useChildren();
  const childrenList = roster.children;
  const selectedChildIndex = Math.max(0, childrenList.findIndex(child => child.student_id === roster.selected));
  const profile = useParentProfile(roster.child?.student_id || 0);
  const childData = profile.child;
  const loading = roster.loading || (Boolean(roster.child) && profile.loading);
  const canView = childData?.allow_parent_view_student_info === true;
  const canEdit = canView && childData?.allow_parent_edit_student_info === true;
  const formData = profile.form.values;
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const savingLock = useRef(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  useEffect(() => {
    const error = roster.error || profile.error;
    if (error) setSnackbar({ open: true, message: error, severity: 'error' });
  }, [roster.error, profile.error]);
  const handleChildSwitch = (event: SelectChangeEvent<number>) => {
    const child = childrenList[Number(event.target.value)];
    if (child) roster.select(child.student_id);
  };
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!canEdit || !PROFILE_FIELDS.includes(e.target.name as ProfileField)) return;
    profile.form.change({ ...formData, [e.target.name]: e.target.value });
  };
  const handleSave = async () => {
    if (!childData || !canEdit || savingLock.current) return;
    const error = validateProfile(formData);
    if (error) { setSnackbar({ open: true, message: error, severity: 'error' }); return; }
    savingLock.current = true;
    setIsSaving(true);
    try {
      const result = await profile.form.save(`/api/parents/children/${childData.student_id}`, 'put', profilePayload(formData));
      setSnackbar({ open: true, message: result === 'saved' ? 'Child details successfully updated!' : 'Saved on this device. Changes will sync when your connection returns.', severity: 'success' });
      if (result === 'saved') { void profile.refresh(); void roster.refresh(); }
    } catch (err) {
      setSnackbar({ open: true, message: errorMessage(err), severity: 'error' });
    } finally { savingLock.current = false; setIsSaving(false); }
  };
  const getInitials = (first?: string | null, last?: string | null) => `${first?.charAt(0) || ''}${last?.charAt(0) || ''}`.toUpperCase();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!childData) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography sx={{ color: 'text.secondary', fontWeight: 500 }}>
          {roster.error || profile.error || "No child linked to your account yet. Please connect your child's LRN on the Dashboard."}
        </Typography>
      </Box>
    );
  }

  if (!canView) {
    return (
      <Box
        sx={{
          p: 3,
          minHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Paper
          sx={{
            p: 5,
            borderRadius: 3,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            maxWidth: 460,
            textAlign: 'center',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.08)',
          }}
        >
          <Box sx={{ p: 2.5, borderRadius: '50%', bgcolor: '#fee2e2', color: '#ef4444', mb: 3 }}>
            <LockOutlinedIcon sx={{ fontSize: 56 }} />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#111827', mb: 1.5 }}>
            Access Restricted
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3, lineHeight: 1.6 }}>
            The class adviser has temporarily restricted viewing access for student records during official updates.
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
            Please contact Tr. {childData.teacher_fname} {childData.teacher_lname} via the Messages tab if you have questions.
          </Typography>
        </Paper>
      </Box>
    );
  }

  const inputBgColor = canEdit ? '#ffffff' : '#f8fafc';

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, minHeight: '100vh', pb: 10 }}>
      {/* Header section */}
      <Box
        sx={{
          mb: 4,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#1e1e2f', mb: 0.5 }}>
            Child Information
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            View official school records and update family background details.
          </Typography>
        </Box>

        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          {childrenList.length > 1 && (
            <FormControl size="small" sx={{ minWidth: 200, bgcolor: 'white', borderRadius: 2 }}>
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
                    {[child.first_name, child.last_name].filter(Boolean).join(' ') || child.masked_lrn}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {canEdit && (
            <Button
              variant="contained"
              color="success"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={isSaving}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 'bold',
                boxShadow: 'none',
                px: 3,
                display: { xs: 'none', md: 'flex' },
              }}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
        </Stack>
      </Box>

      {/* Main Form Layout */}
      <Grid container spacing={3}>
        {/* Left Card: School Identity & Demographics (Read-Only) */}
        <Grid size={{ xs: 12, md: 4.5 }}>
          <Paper
            sx={{
              borderRadius: 3,
              p: { xs: 2.5, md: 3.5 },
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
              border: '1px solid #f1f5f9',
            }}
          >
            <Avatar
              src={''}
              sx={{
                width: 96,
                height: 96,
                mb: 2.5,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                border: '4px solid white',
                bgcolor: 'primary.light',
                fontSize: '2.4rem',
                color: 'primary.main',
                fontWeight: 'bold',
              }}
            >
              {getInitials(childData.first_name, childData.last_name)}
            </Avatar>

            <Grid container spacing={1.5} sx={{ mb: 2, width: '100%' }}>
              <Grid size={{ xs: 6 }}>
                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                  First Name
                </Typography>
                <TextField
                  fullWidth
                  value={childData.first_name || ''}
                  size="small"
                  slotProps={{ input: { readOnly: true } }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f8fafc' } }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                  Last Name
                </Typography>
                <TextField
                  fullWidth
                  value={childData.last_name || ''}
                  size="small"
                  slotProps={{ input: { readOnly: true } }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f8fafc' } }}
                />
              </Grid>
            </Grid>

            <Typography variant="caption" sx={{ mb: 2, color: 'text.secondary', fontWeight: 'bold' }}>
              LRN: {childData.masked_lrn}
            </Typography>

            <Box sx={{ width: '100%', mb: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                School
              </Typography>
              <TextField
                fullWidth
                value="Apolinario Mabini Elementary School"
                size="small"
                slotProps={{ input: { readOnly: true } }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f8fafc' } }}
              />
            </Box>

            <Box sx={{ width: '100%', mb: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                Section
              </Typography>
              <TextField
                fullWidth
                value={childData.section_name || ''}
                size="small"
                slotProps={{ input: { readOnly: true } }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f8fafc' } }}
              />
            </Box>

            <Box sx={{ width: '100%', mb: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                Class Adviser
              </Typography>
              <TextField
                fullWidth
                value={
                  childData.teacher_fname
                    ? `Tr. ${childData.teacher_fname} ${childData.teacher_lname || ''}`
                    : 'Not Assigned'
                }
                size="small"
                slotProps={{ input: { readOnly: true } }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f8fafc' } }}
              />
            </Box>

            <Grid container spacing={2} sx={{ mb: 2, width: '100%' }}>
              <Grid size={{ xs: 6 }}>
                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                  Gender
                </Typography>
                <TextField
                  fullWidth
                  value={childData.gender || ''}
                  size="small"
                  slotProps={{ input: { readOnly: true } }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f8fafc' } }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                  Age
                </Typography>
                <TextField
                  fullWidth
                  value={childData.date_of_birth ? String(childData.decimal_age ?? calculateDecimalAge(childData.date_of_birth)) : ''}
                  size="small"
                  slotProps={{ input: { readOnly: true } }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f8fafc' } }}
                />
              </Grid>
            </Grid>

            <Box sx={{ width: '100%' }}>
              <Typography
                variant="caption"
                sx={{ fontWeight: 'bold', color: canEdit ? 'primary.main' : 'text.secondary' }}
              >
                Emergency Contact
              </Typography>
              <TextField
                fullWidth
                name="emergency_contact"
                placeholder="Active mobile or phone number"
                value={formData.emergency_contact || ''}
                onChange={handleChange}
                size="small"
                slotProps={{ input: { readOnly: !canEdit } }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: inputBgColor } }}
              />
            </Box>
          </Paper>
        </Grid>

        {/* Right Card: Family Background & Details (Editable when permitted) */}
        <Grid size={{ xs: 12, md: 7.5 }}>
          <Paper
            sx={{
              borderRadius: 3,
              p: { xs: 2.5, md: 3.5 },
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
              border: '1px solid #f1f5f9',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
              <PeopleAltOutlinedIcon color="primary" />
              <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1e1e2f' }}>
                Family Background & Details
              </Typography>
            </Box>

            {!canEdit && (
              <Alert
                severity="info"
                icon={<LockOutlinedIcon />}
                sx={{ mb: 3, borderRadius: 2, fontWeight: 500 }}
              >
                Student information editing has been locked by the class adviser. Form fields are read-only.
              </Alert>
            )}

            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12 }}>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 'bold', color: canEdit ? 'primary.main' : 'text.secondary' }}
                >
                  Home Address
                </Typography>
                <TextField
                  fullWidth
                  name="address"
                  placeholder="House No., Street, Barangay, City"
                  value={formData.address || ''}
                  onChange={handleChange}
                  size="small"
                  slotProps={{ input: { readOnly: !canEdit } }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: inputBgColor } }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 'bold', color: canEdit ? 'primary.main' : 'text.secondary' }}
                >
                  Handedness
                </Typography>
                <TextField
                  fullWidth
                  name="handedness"
                  placeholder="Right / Left"
                  value={formData.handedness || ''}
                  onChange={handleChange}
                  size="small"
                  slotProps={{ input: { readOnly: !canEdit } }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: inputBgColor } }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                  Birth Date
                </Typography>
                <TextField
                  fullWidth
                  type="date"
                  value={childData.date_of_birth || ''}
                  size="small"
                  slotProps={{ input: { readOnly: true } }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f8fafc' } }}
                />
              </Grid>
            </Grid>

            {/* Father's Info Box */}
            <Box
              sx={{
                border: '1px solid',
                borderColor: canEdit ? 'primary.light' : '#e2e8f0',
                borderRadius: 2.5,
                p: 2.5,
                mb: 2.5,
                bgcolor: canEdit ? 'rgba(37, 99, 235, 0.02)' : 'transparent',
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1.5, color: '#334155' }}>
                Father's Information
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 'bold', color: canEdit ? 'primary.main' : 'text.secondary' }}
                  >
                    Full Name
                  </Typography>
                  <TextField
                    fullWidth
                    name="father_name"
                    value={formData.father_name || ''}
                    onChange={handleChange}
                    size="small"
                    slotProps={{ input: { readOnly: !canEdit } }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: inputBgColor } }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 'bold', color: canEdit ? 'primary.main' : 'text.secondary' }}
                  >
                    Age
                  </Typography>
                  <TextField
                    fullWidth
                    name="father_age"
                    type="number"
                    value={formData.father_age != null ? String(formData.father_age) : ''}
                    onChange={handleChange}
                    size="small"
                    slotProps={{ input: { readOnly: !canEdit } }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: inputBgColor } }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 'bold', color: canEdit ? 'primary.main' : 'text.secondary' }}
                  >
                    Occupation
                  </Typography>
                  <TextField
                    fullWidth
                    name="father_occ"
                    value={formData.father_occ || ''}
                    onChange={handleChange}
                    size="small"
                    slotProps={{ input: { readOnly: !canEdit } }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: inputBgColor } }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 'bold', color: canEdit ? 'primary.main' : 'text.secondary' }}
                  >
                    Educational Attainment
                  </Typography>
                  <TextField
                    fullWidth
                    name="father_educ"
                    value={formData.father_educ || ''}
                    onChange={handleChange}
                    size="small"
                    slotProps={{ input: { readOnly: !canEdit } }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: inputBgColor } }}
                  />
                </Grid>
              </Grid>
            </Box>

            {/* Mother's Info Box */}
            <Box
              sx={{
                border: '1px solid',
                borderColor: canEdit ? 'primary.light' : '#e2e8f0',
                borderRadius: 2.5,
                p: 2.5,
                mb: 2.5,
                bgcolor: canEdit ? 'rgba(37, 99, 235, 0.02)' : 'transparent',
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1.5, color: '#334155' }}>
                Mother's Information
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 'bold', color: canEdit ? 'primary.main' : 'text.secondary' }}
                  >
                    Full Name
                  </Typography>
                  <TextField
                    fullWidth
                    name="mother_name"
                    value={formData.mother_name || ''}
                    onChange={handleChange}
                    size="small"
                    slotProps={{ input: { readOnly: !canEdit } }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: inputBgColor } }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 'bold', color: canEdit ? 'primary.main' : 'text.secondary' }}
                  >
                    Age
                  </Typography>
                  <TextField
                    fullWidth
                    name="mother_age"
                    type="number"
                    value={formData.mother_age != null ? String(formData.mother_age) : ''}
                    onChange={handleChange}
                    size="small"
                    slotProps={{ input: { readOnly: !canEdit } }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: inputBgColor } }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 'bold', color: canEdit ? 'primary.main' : 'text.secondary' }}
                  >
                    Occupation
                  </Typography>
                  <TextField
                    fullWidth
                    name="mother_occ"
                    value={formData.mother_occ || ''}
                    onChange={handleChange}
                    size="small"
                    slotProps={{ input: { readOnly: !canEdit } }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: inputBgColor } }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 'bold', color: canEdit ? 'primary.main' : 'text.secondary' }}
                  >
                    Educational Attainment
                  </Typography>
                  <TextField
                    fullWidth
                    name="mother_educ"
                    value={formData.mother_educ || ''}
                    onChange={handleChange}
                    size="small"
                    slotProps={{ input: { readOnly: !canEdit } }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: inputBgColor } }}
                  />
                </Grid>
              </Grid>
            </Box>

            {/* Siblings & Birth Order */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 6 }}>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 'bold', color: canEdit ? 'primary.main' : 'text.secondary' }}
                >
                  Number of Siblings
                </Typography>
                <TextField
                  fullWidth
                  name="num_of_siblings"
                  type="number"
                  value={formData.num_of_siblings != null ? String(formData.num_of_siblings) : ''}
                  onChange={handleChange}
                  size="small"
                  slotProps={{ input: { readOnly: !canEdit } }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: inputBgColor } }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 'bold', color: canEdit ? 'primary.main' : 'text.secondary' }}
                >
                  Birth Order (Pang-ilan)
                </Typography>
                <TextField
                  fullWidth
                  name="birth_order"
                  placeholder="e.g. 1st, 2nd, Panganay"
                  value={formData.birth_order || ''}
                  onChange={handleChange}
                  size="small"
                  slotProps={{ input: { readOnly: !canEdit } }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: inputBgColor } }}
                />
              </Grid>
            </Grid>

            {/* Mobile Save Button */}
            {canEdit && (
              <Button
                fullWidth
                variant="contained"
                color="success"
                startIcon={<SaveIcon />}
                onClick={handleSave}
                disabled={isSaving}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 'bold',
                  boxShadow: 'none',
                  display: { xs: 'flex', md: 'none' },
                  mt: 2,
                  py: 1.5,
                }}
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Snackbar feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          sx={{ width: '100%', borderRadius: 2, fontWeight: 'bold' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ChildManagement;
