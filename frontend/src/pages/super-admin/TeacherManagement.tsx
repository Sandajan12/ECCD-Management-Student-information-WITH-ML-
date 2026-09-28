import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, IconButton, Alert, Select, MenuItem, FormControl, Grid,
  Switch, FormControlLabel, Chip, Card, CardContent, CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import ArchiveIcon from '@mui/icons-material/Archive';
import DeleteIcon from '@mui/icons-material/Delete';
import RestoreIcon from '@mui/icons-material/Restore';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import api from '../../services/api';

interface Teacher {
  teacher_id?: number;
  user_id: string | number;
  first_name: string;
  last_name: string;
  username?: string;
  email: string;
  class_name: string;
  employee_id: string;
  section_id?: number | null;
  role?: string;
  status?: string;
  allow_eccd_question_management?: boolean;
}

interface Section {
  section_id: string | number;
  section_name: string;
  adviser_teacher_id?: string | number | null;
}

interface ReassignConfirmationState {
  open: boolean;
  incumbentName: string;
  sectionName: string;
  onConfirm: () => Promise<void> | void;
}

const TeacherManagement: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [teacherToArchive, setTeacherToArchive] = useState<string | number | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [teacherToDelete, setTeacherToDelete] = useState<string | number | null>(null);
  
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [archivedTeachers, setArchivedTeachers] = useState<Teacher[]>([]);
  const [error, setError] = useState('');
  
  const [sectionsList, setSectionsList] = useState<Section[]>([]);
  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [newSectionId, setNewSectionId] = useState('');

  const [formData, setFormData] = useState({
    first_name: '', last_name: '', username: '', email: '', class_name: '', employee_id: '', password: ''
  });

  const [editFormData, setEditFormData] = useState({
    user_id: '' as string | number, first_name: '', last_name: '', username: '', email: '', class_name: '', employee_id: ''
  });

  // Reassignment & Handover confirmation modal state
  const [reassignConfirm, setReassignConfirm] = useState<ReassignConfirmationState>({
    open: false,
    incumbentName: '',
    sectionName: '',
    onConfirm: () => {},
  });

  // Manage Access & RBAC state
  const [manageAccessOpen, setManageAccessOpen] = useState(false);
  const [selectedTeacherForAccess, setSelectedTeacherForAccess] = useState<Teacher | null>(null);
  const [accessSectionId, setAccessSectionId] = useState<number | string>('');
  const [allowEccdQuestionManagement, setAllowEccdQuestionManagement] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessSuccessMsg, setAccessSuccessMsg] = useState('');
  const [accessErrorMsg, setAccessErrorMsg] = useState('');

  // Helper to find an active teacher already occupying a given section
  const findOccupiedTeacher = (
    targetSectionIdOrName: string | number,
    currentTeacherId?: string | number
  ) => {
    if (!targetSectionIdOrName || targetSectionIdOrName === 'ADD_NEW') return null;
    const matchedSec = sectionsList.find(
      (s) =>
        String(s.section_id) === String(targetSectionIdOrName) ||
        s.section_name.toLowerCase() === String(targetSectionIdOrName).toLowerCase()
    );
    const secName = matchedSec?.section_name || String(targetSectionIdOrName);
    const secId = matchedSec?.section_id;

    return teachers.find(
      (t) =>
        (t.class_name?.toLowerCase() === secName.toLowerCase() ||
          (secId && String(t.section_id) === String(secId))) &&
        String(t.teacher_id || t.user_id) !== String(currentTeacherId)
    );
  };

  const handleOpenManageAccess = (teacher: Teacher) => {
    setSelectedTeacherForAccess(teacher);
    setAccessSectionId(teacher.section_id || '');
    setAllowEccdQuestionManagement(Boolean(teacher.allow_eccd_question_management));
    setAccessSuccessMsg('');
    setAccessErrorMsg('');
    setManageAccessOpen(true);
  };

  const executeSaveSectionAssignment = async () => {
    if (!selectedTeacherForAccess || !selectedTeacherForAccess.teacher_id) return;
    setAccessLoading(true);
    setAccessErrorMsg('');
    setAccessSuccessMsg('');
    try {
      const res = await api.post(`/api/chairman/sections/${accessSectionId}/assign-teacher`, {
        teacher_id: selectedTeacherForAccess.teacher_id,
      });
      setAccessSuccessMsg(res.data?.message || "Section assigned successfully! Any previous teacher was archived.");
      await fetchTeachers();
      await fetchSections();
    } catch (err: any) {
      setAccessErrorMsg(err.response?.data?.detail || "Failed to update section assignment.");
    } finally {
      setAccessLoading(false);
    }
  };

  const handleSaveSectionAssignment = async () => {
    if (!selectedTeacherForAccess || !selectedTeacherForAccess.teacher_id) return;
    if (!accessSectionId) {
      setAccessErrorMsg("Please select a target section.");
      return;
    }

    const incumbent = findOccupiedTeacher(accessSectionId, selectedTeacherForAccess.teacher_id);
    if (incumbent) {
      const matchedSec = sectionsList.find((s) => String(s.section_id) === String(accessSectionId));
      const secName = matchedSec?.section_name || String(accessSectionId);
      setReassignConfirm({
        open: true,
        incumbentName: `${incumbent.first_name} ${incumbent.last_name}`,
        sectionName: secName,
        onConfirm: () => executeSaveSectionAssignment(),
      });
      return;
    }

    await executeSaveSectionAssignment();
  };

  const handleToggleEccdPermission = async (newVal: boolean) => {
    if (!selectedTeacherForAccess || !selectedTeacherForAccess.teacher_id) return;
    setAllowEccdQuestionManagement(newVal);
    setAccessErrorMsg('');
    setAccessSuccessMsg('');
    try {
      await api.put(`/api/chairman/teachers/${selectedTeacherForAccess.teacher_id}/permissions`, {
        allow_eccd_question_management: newVal,
      });
      setAccessSuccessMsg(`ECCD Question Management permission ${newVal ? 'granted' : 'revoked'} successfully!`);
      await fetchTeachers();
    } catch (err: any) {
      setAllowEccdQuestionManagement(!newVal);
      setAccessErrorMsg(err.response?.data?.detail || "Failed to update permission.");
    }
  };

  useEffect(() => {
    fetchTeachers();
    fetchSections();
  }, []);

  const fetchSections = async () => {
    try {
      const response = await api.get('/api/sections/');
      setSectionsList(response.data);
    } catch (err) {
      console.error("Server connection error:", err);
    }
  };

  const fetchTeachers = async () => {
    try {
      const response = await api.get('/api/teachers/?active=true');
      setTeachers(response.data);
    } catch (err: any) {
      console.error("Server connection error:", err);
    }
  };

  const handleOpenArchive = async () => {
    try {
      const response = await api.get('/api/teachers/?active=false');
      setArchivedTeachers(response.data);
      setArchiveOpen(true);
    } catch (err) {
      console.error("Failed to fetch archived teachers:", err);
    }
  };

  const handleInputChange = (e: any) => {
    if (e.target.name === 'class_name' && e.target.value === 'ADD_NEW') {
      setSectionModalOpen(true);
      return;
    }
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };
  
  const handleEditInputChange = (e: any) => {
    if (e.target.name === 'class_name' && e.target.value === 'ADD_NEW') {
      setSectionModalOpen(true);
      return;
    }
    setEditFormData({ ...editFormData, [e.target.name]: e.target.value });
  };

  const handleSaveNewSection = async () => {
    if (!newSectionId.trim()) {
      alert("Section Identifier is required.");
      return;
    }
    const section_name = newSectionId.trim();
    try {
      await api.post('/api/sections/', { section_name, adviser_teacher_id: null });
      await fetchSections();
      if (open) setFormData({...formData, class_name: section_name});
      if (editOpen) setEditFormData({...editFormData, class_name: section_name});
      setSectionModalOpen(false);
      setNewSectionId('');
    } catch (err) {
      alert("Failed to create section. It may already exist.");
    }
  };

  const handleDeleteSection = async (e: React.MouseEvent, sectionId: string | number) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this section? Students in this section will be unassigned.")) return;
    try {
      await api.delete(`/api/sections/${sectionId}`);
      fetchSections();
    } catch (err) {
      alert("Failed to delete section.");
    }
  };

  const executeSaveTeacher = async () => {
    try {
      await api.post('/api/teachers/', formData);
      setOpen(false); 
      setFormData({ first_name: '', last_name: '', username: '', email: '', class_name: '', employee_id: '', password: '' }); 
      await fetchTeachers(); 
      await fetchSections();
    } catch (err: any) {
      let errorMsg = "Failed to create teacher.";
      if (err.response?.data?.detail) {
        if (Array.isArray(err.response.data.detail)) {
          errorMsg = err.response.data.detail.map((e: any) => `${e.loc[e.loc.length - 1]}: ${e.msg}`).join(' | ');
        } else {
          errorMsg = err.response.data.detail;
        }
      } else if (err.response?.data?.message) {
        errorMsg = err.response.data.message;
      }
      setError(errorMsg);
    }
  };

  const handleSaveTeacher = async () => {
    setError('');

    if (
      !formData.first_name.trim() || 
      !formData.last_name.trim() || 
      !formData.username.trim() || 
      !formData.email.trim() || 
      !formData.class_name.trim() || 
      !formData.employee_id.trim() || 
      !formData.password.trim()
    ) {
      setError('All fields are required. Please fill in all the blanks.');
      return;
    }

    const incumbent = findOccupiedTeacher(formData.class_name);
    if (incumbent) {
      setReassignConfirm({
        open: true,
        incumbentName: `${incumbent.first_name} ${incumbent.last_name}`,
        sectionName: formData.class_name,
        onConfirm: () => executeSaveTeacher(),
      });
      return;
    }

    await executeSaveTeacher();
  };

  const handleEditTeacher = (teacher: Teacher) => {
    setError('');
    setEditFormData({
      user_id: teacher.user_id,
      first_name: teacher.first_name,
      last_name: teacher.last_name,
      username: teacher.username || '',
      email: teacher.email,
      class_name: teacher.class_name,
      employee_id: teacher.employee_id
    });
    setEditOpen(true);
  };

  const executeUpdateTeacher = async () => {
    try {
      await api.put(`/api/teachers/${editFormData.user_id}`, editFormData);
      setEditOpen(false); 
      await fetchTeachers(); 
      await fetchSections();
    } catch (err: any) {
      let errorMsg = "Failed to update teacher.";
      if (err.response?.data?.detail) {
        if (Array.isArray(err.response.data.detail)) {
          errorMsg = err.response.data.detail.map((e: any) => `${e.loc[e.loc.length - 1]}: ${e.msg}`).join(' | ');
        } else {
          errorMsg = err.response.data.detail;
        }
      } else if (err.response?.data?.message) {
        errorMsg = err.response.data.message;
      }
      setError(errorMsg);
    }
  };

  const handleUpdateTeacher = async () => {
    setError('');

    if (
      !editFormData.first_name.trim() || 
      !editFormData.last_name.trim() || 
      !editFormData.username.trim() || 
      !editFormData.email.trim() || 
      !editFormData.class_name.trim() || 
      !editFormData.employee_id.trim()
    ) {
      setError('All fields are required. Please fill in all the blanks.');
      return;
    }

    const incumbent = findOccupiedTeacher(editFormData.class_name, editFormData.user_id);
    if (incumbent) {
      setReassignConfirm({
        open: true,
        incumbentName: `${incumbent.first_name} ${incumbent.last_name}`,
        sectionName: editFormData.class_name,
        onConfirm: () => executeUpdateTeacher(),
      });
      return;
    }

    await executeUpdateTeacher();
  };

  const handleArchiveTeacher = (userId: string | number) => {
    setTeacherToArchive(userId);
    setConfirmArchiveOpen(true);
  };

  const executeArchiveTeacher = async () => {
    if (!teacherToArchive) return;

    try {
      await api.put(`/api/teachers/${teacherToArchive}/archive`);
      fetchTeachers(); 
      setConfirmArchiveOpen(false);
      setTeacherToArchive(null);
    } catch (err) {
      console.error(err);
      alert("Failed to archive teacher.");
    }
  };

  const handleDeleteTeacher = (userId: string | number) => {
    setTeacherToDelete(userId);
    setConfirmDeleteOpen(true);
  };

  const executeDeleteTeacher = async () => {
    if (!teacherToDelete) return;

    try {
      await api.delete(`/api/teachers/${teacherToDelete}`);
      handleOpenArchive(); 
      setConfirmDeleteOpen(false);
      setTeacherToDelete(null);
    } catch (err: any) {
      console.error(err);
      alert((err.response?.data?.detail || err.response?.data?.error) || "Failed to delete teacher.");
    }
  };

  const handleUnarchiveTeacher = async (userId: string | number) => {
    if (!window.confirm("Do you want to restore this teacher account to active status?")) return;

    try {
      await api.put(`/api/teachers/${userId}/unarchive`);
      handleOpenArchive(); 
      fetchTeachers();     
    } catch (err) {
      console.error(err);
      alert("Failed to restore teacher.");
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h4" sx={{ mb: 4, fontWeight: 'bold' }}>Teacher's Account Management</Typography>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">
          Registered Teachers 
          <Typography component="span" variant="body2" sx={{ bgcolor: 'grey.200', px: 1, borderRadius: 1, ml: 1 }}>
            Total: {teachers.length}
          </Typography>
        </Typography>
        <Box>
            <Button variant="outlined" sx={{ mr: 2, borderRadius: 24 }} onClick={handleOpenArchive}>View Archive</Button>
            <Button variant="contained" sx={{ borderRadius: 24 }} startIcon={<AddIcon />} onClick={() => { setError(''); setOpen(true); }}>
              Add New Teacher
            </Button>
        </Box>
      </Box>

      <TableContainer component={Paper} sx={{ borderRadius: 3, elevation: 1 }}>
        <Table>
          <TableHead sx={{ backgroundColor: '#f9f9f9' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Teacher Name</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Assigned Section</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Permissions</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Email</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }} align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {teachers.map((teacher) => (
              <TableRow key={teacher.teacher_id || teacher.user_id}>
                <TableCell sx={{ fontWeight: '500' }}>{teacher.first_name} {teacher.last_name}</TableCell>
                <TableCell>
                  <Chip 
                    label="Active" 
                    size="small" 
                    color="success" 
                    variant="outlined" 
                    sx={{ borderRadius: 2, fontWeight: 'bold' }} 
                  />
                </TableCell>
                <TableCell>{teacher.class_name || 'Unassigned'}</TableCell>
                <TableCell>
                  {teacher.allow_eccd_question_management ? (
                    <Chip 
                      label="ECCD Questions" 
                      size="small" 
                      color="success" 
                      sx={{ borderRadius: 2, fontWeight: 'bold' }} 
                    />
                  ) : (
                    <Typography variant="caption" color="text.secondary">Default</Typography>
                  )}
                </TableCell>
                <TableCell>{teacher.email}</TableCell>
                <TableCell align="right">
                  <Button 
                    variant="outlined" 
                    size="small" 
                    startIcon={<AdminPanelSettingsIcon />} 
                    onClick={() => handleOpenManageAccess(teacher)}
                    sx={{ 
                      borderRadius: 3, 
                      textTransform: 'none', 
                      fontWeight: 'bold', 
                      mr: 1,
                      borderColor: '#6366f1',
                      color: '#6366f1',
                      '&:hover': { borderColor: '#4f46e5', bgcolor: '#eef2ff' }
                    }}
                  >
                    Manage Access
                  </Button>
                  <IconButton onClick={() => handleEditTeacher(teacher)} color="primary" title="Edit Teacher">
                    <EditIcon />
                  </IconButton>
                  <IconButton onClick={() => handleArchiveTeacher(teacher.user_id)} color="warning" title="Archive Teacher">
                    <ArchiveIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {teachers.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                  No active teachers found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: 4, p: 2 } } }}>
        <DialogTitle sx={{ fontWeight: 'bold', textAlign: 'center' }}>Edit Teacher</DialogTitle>
        <DialogContent>
            {error && <Alert severity="error" sx={{ mt: 2, mb: 2 }}>{error}</Alert>}
            
            <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid size={{ xs: 12, sm: 6 }} >
                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>First Name</Typography>
                    <TextField fullWidth name="first_name" value={editFormData.first_name} onChange={handleEditInputChange} variant="outlined" size="small" sx={{ mt: 1, bgcolor: '#f9f9f9' }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }} >
                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>Last Name</Typography>
                    <TextField fullWidth name="last_name" value={editFormData.last_name} onChange={handleEditInputChange} variant="outlined" size="small" sx={{ mt: 1, bgcolor: '#f9f9f9' }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }} >
                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>Username</Typography>
                    <TextField fullWidth name="username" value={editFormData.username} onChange={handleEditInputChange} variant="outlined" size="small" sx={{ mt: 1, bgcolor: '#f9f9f9' }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }} >
                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>Email</Typography>
                    <TextField fullWidth name="email" value={editFormData.email} onChange={handleEditInputChange} type="email" variant="outlined" size="small" sx={{ mt: 1, bgcolor: '#f9f9f9' }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }} >
                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>Employee ID</Typography>
                    <TextField fullWidth name="employee_id" value={editFormData.employee_id} onChange={handleEditInputChange} variant="outlined" size="small" sx={{ mt: 1, bgcolor: '#f9f9f9' }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }} >
                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>Class Name / Section</Typography>
                    <FormControl fullWidth size="small" sx={{ mt: 1, bgcolor: '#f9f9f9' }}>
                        <Select
                            name="class_name"
                            value={editFormData.class_name}
                            onChange={handleEditInputChange}
                            displayEmpty
                            renderValue={(selected) => selected ? (selected as string) : <span style={{color: '#aaa'}}>Select a Section</span>}
                        >
                            {sectionsList.map(sec => (
                                <MenuItem key={sec.section_id} value={sec.section_name} sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                    {sec.section_name}
                                    <IconButton 
                                        size="small" 
                                        color="error" 
                                        onClick={(e) => handleDeleteSection(e, sec.section_id)}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        sx={{ ml: 2, padding: '2px' }}
                                    >
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </MenuItem>
                            ))}
                            <MenuItem value="ADD_NEW" sx={{ fontWeight: 'bold', color: 'primary.main' }}>+ Add New Section</MenuItem>
                        </Select>
                    </FormControl>
                </Grid>
            </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3, justifyContent: 'center' }}>
          <Button onClick={() => setEditOpen(false)} variant="text" sx={{ color: 'text.secondary', mr: 2, borderRadius: 24 }}>Cancel</Button>
          <Button onClick={handleUpdateTeacher} variant="contained" sx={{ px: 4, borderRadius: 24 }}>Save Changes</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: 4, p: 2 } } }}>
        <DialogTitle sx={{ fontWeight: 'bold', textAlign: 'center' }}>New Teacher</DialogTitle>
        <DialogContent>
            {error && <Alert severity="error" sx={{ mt: 2, mb: 2 }}>{error}</Alert>}
            
            <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid size={{ xs: 12, sm: 6 }} >
                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>First Name</Typography>
                    <TextField fullWidth name="first_name" value={formData.first_name} onChange={handleInputChange} variant="outlined" size="small" sx={{ mt: 1, bgcolor: '#f9f9f9' }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }} >
                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>Last Name</Typography>
                    <TextField fullWidth name="last_name" value={formData.last_name} onChange={handleInputChange} variant="outlined" size="small" sx={{ mt: 1, bgcolor: '#f9f9f9' }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }} >
                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>Username</Typography>
                    <TextField fullWidth name="username" value={formData.username} onChange={handleInputChange} variant="outlined" size="small" sx={{ mt: 1, bgcolor: '#f9f9f9' }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }} >
                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>Email</Typography>
                    <TextField fullWidth name="email" value={formData.email} onChange={handleInputChange} type="email" variant="outlined" size="small" sx={{ mt: 1, bgcolor: '#f9f9f9' }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }} >
                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>Employee ID</Typography>
                    <TextField fullWidth name="employee_id" value={formData.employee_id} onChange={handleInputChange} variant="outlined" size="small" sx={{ mt: 1, bgcolor: '#f9f9f9' }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }} >
                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>Class Name / Section</Typography>
                    <FormControl fullWidth size="small" sx={{ mt: 1, bgcolor: '#f9f9f9' }}>
                        <Select
                            name="class_name"
                            value={formData.class_name}
                            onChange={handleInputChange}
                            displayEmpty
                            renderValue={(selected) => selected ? (selected as string) : <span style={{color: '#aaa'}}>Select a Section</span>}
                        >
                            <MenuItem value="" disabled>Select a Section</MenuItem>
                            {sectionsList.map(sec => (
                                <MenuItem key={sec.section_id} value={sec.section_name} sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                    {sec.section_name}
                                    <IconButton 
                                        size="small" 
                                        color="error" 
                                        onClick={(e) => handleDeleteSection(e, sec.section_id)}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        sx={{ ml: 2, padding: '2px' }}
                                    >
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </MenuItem>
                            ))}
                            <MenuItem value="ADD_NEW" sx={{ fontWeight: 'bold', color: 'primary.main' }}>+ Add New Section</MenuItem>
                        </Select>
                    </FormControl>
                </Grid>
                <Grid size={{ xs: 12 }} >
                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>Password</Typography>
                    <TextField fullWidth name="password" value={formData.password} onChange={handleInputChange} type="password" variant="outlined" size="small" sx={{ mt: 1, bgcolor: '#f9f9f9' }} />
                </Grid>
            </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3, justifyContent: 'center' }}>
          <Button onClick={() => setOpen(false)} variant="text" sx={{ color: 'text.secondary', mr: 2, borderRadius: 24 }}>Cancel</Button>
          <Button onClick={handleSaveTeacher} variant="contained" sx={{ px: 4, borderRadius: 24 }}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={archiveOpen} onClose={() => setArchiveOpen(false)} maxWidth="md" fullWidth slotProps={{ paper: { sx: { borderRadius: 4 } } }}>
        <DialogTitle sx={{ fontWeight: 'bold', bgcolor: '#f4f5f7' }}>Archived Teacher Accounts</DialogTitle>
        <DialogContent sx={{ p: 0 }}>
            <TableContainer>
                <Table>
                    <TableHead sx={{ backgroundColor: '#f9f9f9' }}>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 'bold' }}>Teacher Name</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Class Name</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Email</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }} align="right">Action</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {archivedTeachers.map((teacher) => (
                            <TableRow key={`archived-${teacher.teacher_id || teacher.user_id}`}>
                                <TableCell>{teacher.first_name} {teacher.last_name}</TableCell>
                                <TableCell>{teacher.class_name}</TableCell>
                                <TableCell>{teacher.email}</TableCell>
                                <TableCell align="right">
                                    <IconButton 
                                      onClick={() => handleUnarchiveTeacher(teacher.user_id)} 
                                      color="success" 
                                      title="Restore Teacher"
                                    >
                                      <RestoreIcon />
                                    </IconButton>
                                    <IconButton 
                                      onClick={() => handleDeleteTeacher(teacher.user_id)} 
                                      color="error" 
                                      title="Permanently Delete Teacher"
                                    >
                                      <DeleteIcon />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                        {archivedTeachers.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                    No archived teachers found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setArchiveOpen(false)} variant="contained" sx={{ borderRadius: 24 }}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={sectionModalOpen} onClose={() => setSectionModalOpen(false)} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: 4 } } }}>
        <DialogTitle sx={{ fontWeight: 'bold' }}>Create New Section</DialogTitle>
        <DialogContent dividers>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                <Box>
                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>Section Identifier (e.g. A, B, Mabini)</Typography>
                    <TextField 
                        fullWidth 
                        value={newSectionId} 
                        onChange={(e) => setNewSectionId(e.target.value)} 
                        variant="outlined" 
                        size="small" 
                        sx={{ mt: 1, bgcolor: '#f9f9f9' }} 
                        placeholder="Enter Identifier"
                    />
                </Box>
            </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setSectionModalOpen(false)} sx={{ color: 'text.secondary', fontWeight: 'bold', borderRadius: 24 }}>Cancel</Button>
          <Button onClick={handleSaveNewSection} variant="contained" sx={{ fontWeight: 'bold', borderRadius: 24 }}>Create Section</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmArchiveOpen} onClose={() => setConfirmArchiveOpen(false)} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: 4, p: 1 } } }}>
        <DialogTitle sx={{ fontWeight: 'bold', color: '#ed6c02', display: 'flex', alignItems: 'center', gap: 1 }}>
          <ArchiveIcon /> Confirm Archive
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mt: 1 }}>
            Are you sure you want to archive this teacher account?
          </Typography>
          <Typography variant="body2" sx={{ mt: 2, color: 'textSecondary' }}>
            This action will move the teacher to the archive. You can restore them later from the archive view if needed.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setConfirmArchiveOpen(false)} sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 'bold', borderRadius: 24 }}>Cancel</Button>
          <Button onClick={executeArchiveTeacher} variant="contained" color="warning" sx={{ borderRadius: 24, textTransform: 'none', fontWeight: 'bold' }}>Archive</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: 4, p: 2 } } }}>
        <DialogTitle sx={{ fontWeight: 'bold', color: '#d32f2f', display: 'flex', alignItems: 'center', gap: 1 }}>
          <DeleteIcon /> Confirm Permanent Deletion
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mt: 1 }}>
            Are you sure you want to <strong>PERMANENTLY</strong> delete this teacher account?
          </Typography>
          <Typography variant="body2" sx={{ mt: 2, fontWeight: 'bold', color: 'error' }}>
            WARNING: This action cannot be undone. All data associated with this teacher will be lost forever.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setConfirmDeleteOpen(false)} sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 'bold', borderRadius: 24 }}>Cancel</Button>
          <Button onClick={executeDeleteTeacher} variant="contained" color="error" sx={{ borderRadius: 24, textTransform: 'none', fontWeight: 'bold' }}>Delete Permanently</Button>
        </DialogActions>
      </Dialog>

      {/* Manage Access Modal */}
      <Dialog 
        open={manageAccessOpen} 
        onClose={() => setManageAccessOpen(false)} 
        maxWidth="sm" 
        fullWidth 
        slotProps={{ paper: { sx: { borderRadius: 4, p: 1 } } }}
      >
        <DialogTitle sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
          <AdminPanelSettingsIcon color="primary" />
          Manage Teacher Access & Assignment
        </DialogTitle>
        <DialogContent dividers>
          {selectedTeacherForAccess && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
              <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 3, border: '1px solid #e2e8f0' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                  {selectedTeacherForAccess.first_name} {selectedTeacherForAccess.last_name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Employee ID: {selectedTeacherForAccess.employee_id} | Email: {selectedTeacherForAccess.email}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    Current Section: <strong>{selectedTeacherForAccess.class_name || 'None'}</strong>
                  </Typography>
                </Box>
              </Box>

              {accessSuccessMsg && <Alert severity="success" sx={{ borderRadius: 3 }}>{accessSuccessMsg}</Alert>}
              {accessErrorMsg && <Alert severity="error" sx={{ borderRadius: 3 }}>{accessErrorMsg}</Alert>}

              {/* Section Assignment */}
              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <SwapHorizIcon color="primary" /> Section Assignment
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                    Assign this teacher to a section. If assigned to an already occupied section, the incumbent teacher is automatically archived (status set to Inactive) and all student records remain intact.
                  </Typography>

                  <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                    <Typography variant="caption" sx={{ fontWeight: 'bold', mb: 0.5 }}>Target Section</Typography>
                    <Select
                      value={accessSectionId}
                      onChange={(e) => setAccessSectionId(e.target.value)}
                      sx={{ borderRadius: 2 }}
                    >
                      <MenuItem value=""><em>-- Select a Section --</em></MenuItem>
                      {sectionsList.map((sec) => (
                        <MenuItem key={sec.section_id} value={sec.section_id}>
                          {sec.section_name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button 
                      variant="contained" 
                      onClick={handleSaveSectionAssignment} 
                      disabled={accessLoading || !accessSectionId}
                      sx={{ borderRadius: 24, textTransform: 'none', fontWeight: 'bold' }}
                    >
                      {accessLoading ? <CircularProgress size={20} color="inherit" /> : 'Save Assignment'}
                    </Button>
                  </Box>
                </CardContent>
              </Card>

              {/* RBAC Permissions Section */}
              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AdminPanelSettingsIcon color="primary" /> System Permissions (RBAC)
                  </Typography>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={allowEccdQuestionManagement}
                        onChange={(e) => handleToggleEccdPermission(e.target.checked)}
                        color="primary"
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                          Enable ECCD Question Management
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Delegates question configuration permissions, allowing this teacher to edit ECCD checklists and domains.
                        </Typography>
                      </Box>
                    }
                  />
                </CardContent>
              </Card>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setManageAccessOpen(false)} variant="outlined" sx={{ borderRadius: 24, textTransform: 'none', fontWeight: 'bold' }}>
            Done
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation Dialog: Reassign Occupied Section */}
      <Dialog 
        open={reassignConfirm.open} 
        onClose={() => setReassignConfirm({ ...reassignConfirm, open: false })} 
        maxWidth="sm" 
        fullWidth 
        slotProps={{ paper: { sx: { borderRadius: 4, p: 1 } } }}
      >
        <DialogTitle sx={{ fontWeight: 'bold', color: '#ed6c02', display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberOutlinedIcon /> Confirm Section Reassignment & Archiving
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mt: 1 }}>
            This section (<strong>{reassignConfirm.sectionName}</strong>) is currently assigned to Teacher <strong>{reassignConfirm.incumbentName}</strong>.
          </Typography>
          <Alert severity="warning" sx={{ mt: 2, borderRadius: 2, fontWeight: 500 }}>
            Reassigning will archive the existing teacher and set their status to <strong>Inactive</strong>.
          </Alert>
          <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
            Do you want to proceed?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button 
            onClick={() => setReassignConfirm({ ...reassignConfirm, open: false })} 
            sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 'bold', borderRadius: 24 }}
          >
            Cancel
          </Button>
          <Button 
            onClick={() => {
              const cb = reassignConfirm.onConfirm;
              setReassignConfirm({ ...reassignConfirm, open: false });
              cb();
            }} 
            variant="contained" 
            color="warning" 
            sx={{ borderRadius: 24, textTransform: 'none', fontWeight: 'bold' }}
          >
            Proceed & Archive Teacher
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TeacherManagement;

