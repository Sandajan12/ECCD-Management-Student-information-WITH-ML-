import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions, TextField, 
  InputAdornment, IconButton, Alert, Avatar, LinearProgress, Select, MenuItem,
  Stack, Grid
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import ArchiveIcon from '@mui/icons-material/Archive';
import DeleteIcon from '@mui/icons-material/Delete';
import RestoreIcon from '@mui/icons-material/Restore';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import api from '../../services/api';

interface Student {
  lrn_number: string;
  first_name: string;
  last_name: string;
  decimal_age?: number;
  parent_names?: string;
  profile_completeness?: number;
  profile_picture_url?: string;
  school_year?: string;
  date_of_birth?: string;
  section_name?: string;
  gender?: string;
  emergency_contact?: string;
  address?: string;
  handedness?: string;
  num_of_siblings?: string;
  birth_order?: string;
  father_name?: string; 
  father_age?: string; 
  father_occ?: string; 
  father_educ?: string;
  mother_name?: string; 
  mother_age?: string; 
  mother_occ?: string; 
  mother_educ?: string;
  legal_guardian_name?: string;
  legal_guardian_age?: string;
  legal_guardian_occ?: string;
  legal_guardian_educ?: string;
  lrn?: string;
}

const StudentManagement: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false); 
  const [editOpen, setEditOpen] = useState(false); 
  const [confirmArchiveAllOpen, setConfirmArchiveAllOpen] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [archivedStudents, setArchivedStudents] = useState<Student[]>([]); 
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [editError, setEditError] = useState(''); 
  const [editingLrn, setEditingLrn] = useState('');

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<any>(null);
  const [importError, setImportError] = useState('');

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.name.endsWith('.xlsx')) {
        setImportFile(file);
        setImportError('');
      } else {
        setImportFile(null);
        setImportError('Please select a valid .xlsx file.');
      }
    }
  };

  const handleImportSubmit = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportError('');

    const formData = new FormData();
    formData.append('file', importFile);

    try {
      const response = await api.post('/api/teachers/import-students', formData);
      const data = response.data;
      
      setImporting(false);
      setImportOpen(false);
      setImportFile(null);
      
      if (data) {
        setImportSummary(data);
        fetchActiveStudents();
      }
    } catch (err: any) {
      setImporting(false);
      setImportError((err.response?.data?.detail || err.response?.data?.error) || 'Failed to import students.');
      setImportOpen(true);
    }
  };

  const [teacherClass, setTeacherClass] = useState('');

  const [formData, setFormData] = useState<Partial<Student>>({
    first_name: '', last_name: '', date_of_birth: '', lrn_number: '', 
    section_name: '', gender: 'Male', emergency_contact: ''
  });

  const [editFormData, setEditFormData] = useState<Partial<Student>>({
    lrn_number: '', first_name: '', last_name: '', date_of_birth: '', 
    section_name: '', gender: '', emergency_contact: '',
    address: '', handedness: '', num_of_siblings: '', birth_order: '',
    father_name: '', father_age: '', father_occ: '', father_educ: '',
    mother_name: '', mother_age: '', mother_occ: '', mother_educ: '',
    legal_guardian_name: '', legal_guardian_age: '', legal_guardian_occ: '', legal_guardian_educ: ''
  });

  const [profilePreview, setProfilePreview] = useState<string | ArrayBuffer | null>(null); 
  const [, setProfileFile] = useState<File | null>(null);       

  useEffect(() => {
    fetchActiveStudents();
    fetchAccessSettings();
  }, []);

  const fetchAccessSettings = async () => {
    try {
      const response = await api.get('/api/teachers/me/access');
      if (response.data) {
        setTeacherClass(response.data.class_name || '');
        setFormData(prev => ({ ...prev, section_name: response.data.class_name || '' }));
      }
    } catch (err) {
      console.error("Failed to fetch access settings.", err);
    }
  };

  const fetchActiveStudents = async () => {
    try {
      const response = await api.get('/api/students/');
      if (response.data) setStudents(response.data);
    } catch (err) {
      console.error("Failed to fetch active students.", err);
    }
  };

  const fetchArchivedStudents = async () => {
    try {
      const response = await api.get('/api/students/archived');
      if (response.data) setArchivedStudents(response.data);
    } catch (err) {
      console.error("Failed to fetch archived students.", err);
    }
  };

  const handleOpenArchive = () => {
    fetchArchivedStudents();
    setArchiveOpen(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }>) => {
    const { name, value } = e.target;
    if (name) {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }>) => {
    const { name, value } = e.target;
    if (name) {
      setEditFormData({ ...editFormData, [name]: value });
    }
  };

  const handleProfileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setProfileFile(file); 
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePreview(reader.result); 
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveStudent = async () => {
    setError('');
    if (!formData.first_name || !formData.last_name || !formData.date_of_birth || !formData.lrn_number) {
      setError('First Name, Last Name, Date of Birth, and LRN are required.');
      return;
    }

    try {
      await api.post('/api/students/', formData);
      setOpen(false);
      setFormData({ first_name: '', last_name: '', date_of_birth: '', lrn_number: '', section_name: teacherClass, gender: 'Male', emergency_contact: '' });
      fetchActiveStudents();
    } catch (err: any) {
      setError((err.response?.data?.detail || err.response?.data?.error) || 'Failed to add student.');
    }
  };

  const handleEditClick = (student: Student) => {
    setEditError('');
    setEditingLrn(student.lrn_number);
    
    const formatDateForInput = (dateString: string | undefined) => {
      if (!dateString) return '';
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return '';
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    setEditFormData({
        lrn_number: student.lrn_number || '',
        first_name: student.first_name || '',
        last_name: student.last_name || '',
        date_of_birth: formatDateForInput(student.date_of_birth),
        section_name: student.section_name || '',
        gender: student.gender || '',
        emergency_contact: student.emergency_contact || '',
        address: student.address || '',
        handedness: student.handedness || '',
        num_of_siblings: student.num_of_siblings || '',
        birth_order: student.birth_order || '',
        father_name: student.father_name || '', 
        father_age: student.father_age || '', 
        father_occ: student.father_occ || '', 
        father_educ: student.father_educ || '',
        mother_name: student.mother_name || '', 
        mother_age: student.mother_age || '', 
        mother_occ: student.mother_occ || '', 
        mother_educ: student.mother_educ || '',
        legal_guardian_name: student.legal_guardian_name || '',
        legal_guardian_age: student.legal_guardian_age || '',
        legal_guardian_occ: student.legal_guardian_occ || '',
        legal_guardian_educ: student.legal_guardian_educ || ''
    });

    setProfilePreview(student.profile_picture_url || null);
    setProfileFile(null); 
    setEditOpen(true);
  };

  const handleUpdateStudent = async () => {
    setEditError('');
    if (!editFormData.first_name || !editFormData.last_name || !editFormData.date_of_birth) {
      setEditError('First Name, Last Name, and Date of Birth are required.');
      return;
    }

    const payload = { ...editFormData };
    Object.keys(payload).forEach(key => {
        const k = key as keyof Student;
        if (payload[k] === '') {
            payload[k] = null as any;
        }
    });
    
    const numberFields = ['father_age', 'mother_age', 'legal_guardian_age', 'num_of_siblings'];
    numberFields.forEach(field => {
        const k = field as keyof Student;
        if (payload[k] !== null && payload[k] !== undefined) {
            payload[k] = Number(payload[k]) as any;
        }
    });

    try {
      await api.put(`/api/students/${editingLrn}`, payload);
      setEditOpen(false); 
      fetchActiveStudents();
    } catch (err: any) {
      setEditError((err.response?.data?.detail || err.response?.data?.message) || 'Failed to update student details.');
    }
  };

  const handleArchiveAll = () => {
    setConfirmArchiveAllOpen(true);
  };

  const executeArchiveAll = async () => {
    setConfirmArchiveAllOpen(false);
    try {
      await Promise.all(students.map(s => api.put(`/api/students/${s.lrn_number}/archive`)));
      fetchActiveStudents();
    } catch (err) { console.error(err); }
  };

  const handleArchiveStudent = async (lrn: string) => {
    if (!window.confirm("Are you sure you want to archive this student account?")) return;
    try {
      await api.put(`/api/students/${lrn}/archive`);
      fetchActiveStudents(); 
    } catch (err) { console.error(err); }
  };

  const handleUnarchiveStudent = async (lrn: string) => {
    if (!window.confirm("Do you want to restore this student account to active status?")) return;
    try {
      await api.put(`/api/students/${lrn}/unarchive`);
      fetchArchivedStudents(); fetchActiveStudents();
    } catch (err) { console.error(err); }
  };

  const handleDeleteStudent = async (lrn: string) => {
    if (!window.confirm("WARNING: Are you sure you want to PERMANENTLY delete this account? This action cannot be undone.")) return;
    try {
      await api.delete(`/api/students/${lrn}`);
      fetchArchivedStudents(); 
    } catch (err) { console.error(err); }
  };

  const getInitials = (first?: string, last?: string) => {
    return `${first?.charAt(0) || ''}${last?.charAt(0) || ''}`.toUpperCase();
  };

  const filteredStudents = students.filter(student => 
    `${student.first_name} ${student.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.lrn_number.includes(searchQuery)
  );

  return (
    <Box sx={{ p: 3, minHeight: '100vh', position: 'relative' }}>
      
      {/* Header Section */}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 4, alignItems: "flex-start", justifyContent: "space-between" }}>
        <Box>
            <Typography variant="h4" sx={{ fontWeight: '800', color: '#1e1e2f', mb: 0.5 }}>Manage Students</Typography>
            <Typography variant="body1" sx={{ color: 'textSecondary' }}>View and manage detailed students profile.</Typography>
        </Box>
        <Stack spacing={2} sx={{ minWidth: { xs: '100%', md: '500px' } }}>
            <Stack direction="row" spacing={2} sx={{ width: '100%' }}>
                <Button variant="outlined" sx={{ flex: 1, borderRadius: 2, textTransform: 'none', fontWeight: 'bold', py: 1 }} onClick={handleOpenArchive}>View Archive</Button>
                <Button variant="contained" color="warning" startIcon={<ArchiveIcon />} onClick={handleArchiveAll} sx={{ flex: 1, borderRadius: 2, textTransform: 'none', fontWeight: 'bold', boxShadow: 'none', py: 1 }}>Archive All</Button>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setError(''); setOpen(true); }} sx={{ flex: 1, borderRadius: 2, textTransform: 'none', fontWeight: 'bold', boxShadow: 'none', py: 1 }}>Add Student</Button>
                <Button variant="contained" color="secondary" onClick={() => { setImportError(''); setImportOpen(true); }} sx={{ flex: 1, borderRadius: 2, textTransform: 'none', fontWeight: 'bold', boxShadow: 'none', py: 1 }}>Import Info Sheet</Button>
            </Stack>
            <TextField
                placeholder="Search Students" variant="outlined" size="small"
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                sx={{ bgcolor: 'white', borderRadius: 2, width: '100%' }}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>, sx: { borderRadius: 2 } }}}
            />
        </Stack>
      </Stack>


      {/* Main Table Card */}
      <Paper sx={{ borderRadius: 4, overflow: 'hidden', mb: 10 }}>
        <TableContainer>
          <Table>
            <TableHead sx={{ bgcolor: '#fbfbfb' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', color: 'text.secondary', py: 2 }}>STUDENT NAME</TableCell>
                <TableCell sx={{ fontWeight: 'bold', color: 'text.secondary' }}>AGE</TableCell>
                <TableCell sx={{ fontWeight: 'bold', color: 'text.secondary' }}>PARENT GUARDIAN</TableCell>
                <TableCell sx={{ fontWeight: 'bold', color: 'text.secondary' }}>PROGRESS</TableCell>
                <TableCell sx={{ fontWeight: 'bold', color: 'text.secondary' }}>ACTION</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredStudents.map((student) => (
                <TableRow key={student.lrn_number} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                  <TableCell sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2 }}>
                    <Avatar sx={{ bgcolor: 'transparent', border: '1px solid #ccc', color: '#555', width: 40, height: 40 }} src={student.profile_picture_url || ''}>
                        {getInitials(student.first_name, student.last_name)}
                    </Avatar>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#333', textTransform: 'uppercase' }}>
                        {student.last_name}, {student.first_name}
                    </Typography>
                  </TableCell>
                  <TableCell>{student.decimal_age} yrs</TableCell>
                  <TableCell sx={{ textTransform: 'uppercase' }}>{student.parent_names || 'N/A'}</TableCell>
                  <TableCell>
                    <Stack direction="row"  spacing={1} sx={{ width: 120 ,  alignItems: "center" }}>
                        <LinearProgress variant="determinate" value={student.profile_completeness || 0} color="success" sx={{ height: 8, borderRadius: 4, flexGrow: 1, bgcolor: '#e0e0e0' }} />
                        <Typography variant="caption" sx={{ color: 'textSecondary', fontWeight: 'bold' }}>{student.profile_completeness || 0}%</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}  sx={{ alignItems: "center" }}>
                      <IconButton onClick={() => handleEditClick(student)} color="primary" title="Edit Student"><EditIcon /></IconButton>
                      <IconButton onClick={() => handleArchiveStudent(student.lrn_number)} color="warning" title="Archive Student"><ArchiveIcon /></IconButton>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {filteredStudents.length === 0 && (
                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6, color: 'text.secondary' }}>No active students found.</TableCell></TableRow>
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
        slotProps={{ paper: { sx: { bgcolor: '#f4f5f7', borderRadius: 4, p: 2 } } }} 
      >
        <DialogContent sx={{ p: 0, overflowY: 'visible' }}>
            {editError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{editError}</Alert>}
            
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
                
                {/* === LEFT CARD: Profile Data === */}
                <Paper sx={{ flex: 1, borderRadius: 4, p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    
                    <Box sx={{ position: 'relative', mb: 2 }}>
                        <Avatar 
                          src={profilePreview as string || ''} 
                          sx={{ width: 100, height: 100, border: '4px solid white', bgcolor: 'primary.light', fontSize: '2.5rem' }}
                        >
                            {getInitials(editFormData.first_name, editFormData.last_name)}
                        </Avatar>
                        <IconButton
                            color="primary" component="label"
                            sx={{ position: 'absolute', bottom: -5, right: -5, bgcolor: 'white', '&:hover': { bgcolor: '#f9f9f9' }, width: 35, height: 35 }}
                        >
                            <input hidden accept="image/*" type="file" onChange={handleProfileChange} />
                            <PhotoCameraOutlinedIcon fontSize="small" />
                        </IconButton>
                    </Box>

                    <Grid container spacing={1.5} sx={{ mb: 3 }}>
                        <Grid size={{ xs: 6 }} >
                           <Typography variant="caption" sx={{ color: 'textSecondary', fontWeight: 'bold' }}>First Name</Typography>
                           <TextField fullWidth name="first_name" value={editFormData.first_name} onChange={handleEditInputChange} size="small" variant="outlined" sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f9fafb' } }}/>
                        </Grid>
                        <Grid size={{ xs: 6 }} >
                           <Typography variant="caption" sx={{ color: 'textSecondary', fontWeight: 'bold' }}>Last Name</Typography>
                           <TextField fullWidth name="last_name" value={editFormData.last_name} onChange={handleEditInputChange} size="small" variant="outlined" sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f9fafb' } }}/>
                        </Grid>
                    </Grid>

                    <Typography variant="caption" sx={{ mb: 1, color: 'textSecondary' }}>LRN: {editFormData.lrn_number}</Typography>

                    <Box sx={{ width: '100%', mb: 2 }}>
                        <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>School</Typography>
                        <TextField fullWidth value="Apolinario Mabini Elementary School" size="small" disabled sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f4f5f7' } }}/>
                    </Box>
                    <Box sx={{ width: '100%', mb: 2 }}>
                        <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>Section (Auto-Assigned)</Typography>
                        <TextField fullWidth name="section_name" value={editFormData.section_name} size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f0f0f0' } }} slotProps={{ input: { readOnly: true }}}/>
                    </Box>

                    <Grid container spacing={2} sx={{ mb: 2, width: '100%' }}>
                        <Grid size={{ xs: 6 }} >
                            <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>Gender</Typography>
                            <Select fullWidth name="gender" value={editFormData.gender} onChange={handleEditInputChange as any} size="small" sx={{ borderRadius: 2, bgcolor: '#f9fafb' }}>
                                <MenuItem value="Male">Male</MenuItem>
                                <MenuItem value="Female">Female</MenuItem>
                            </Select>
                        </Grid>
                        <Grid size={{ xs: 6 }} >
                            <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>Age</Typography>
                            <TextField fullWidth value={students.find(s => s.lrn_number === editingLrn)?.decimal_age || ''} size="small" disabled sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f4f5f7' } }}/>
                        </Grid>
                    </Grid>

                    <Box sx={{ width: '100%', mb: 1 }}>
                        <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>Emergency Contact Number</Typography>
                        <TextField fullWidth name="emergency_contact" type="number" value={editFormData.emergency_contact} onChange={handleEditInputChange} size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f9fafb' } }}/>
                    </Box>
                </Paper>

                {/* === RIGHT CARD: Family Background & Details === */}
                <Paper sx={{ flex: 1.8, borderRadius: 4, p: 4, display: 'flex', flexDirection: 'column' }}>
                    <Stack direction="row"  spacing={1} sx={{ mb: 3 ,  alignItems: "center" }}>
                        <PeopleAltOutlinedIcon color="action" />
                        <Typography variant="h6" sx={{ fontWeight: '800', color: '#333' }}>Family Background & Details</Typography>
                    </Stack>
                    
                    <Grid container spacing={2} sx={{ mb: 3 }}>
                        <Grid size={{ xs: 12 }} >
                            <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>Home Address</Typography>
                            <TextField fullWidth name="address" value={editFormData.address} onChange={handleEditInputChange} size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f9fafb' } }}/>
                        </Grid>
                        <Grid size={{ xs: 6 }} >
                             <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>Handedness</Typography>
                            <Select fullWidth name="handedness" value={editFormData.handedness} onChange={handleEditInputChange as any} size="small" sx={{ borderRadius: 2, bgcolor: '#f9fafb' }}>
                                <MenuItem value="Right">Right</MenuItem>
                                <MenuItem value="Left">Left</MenuItem>
                            </Select>
                        </Grid>
                        <Grid size={{ xs: 6 }} >
                             <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>Birth Date</Typography>
                            <TextField fullWidth name="date_of_birth" type="date" value={editFormData.date_of_birth} onChange={handleEditInputChange} size="small" slotProps={{ inputLabel: { shrink: true }}} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f9fafb' } }}/>
                        </Grid>
                     </Grid>

                    <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 3, p: 2, mb: 2 }}>
                        <Grid container spacing={2}>
                            <Grid size={{ xs: 6 }} >
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>Father's Full Name</Typography>
                                <TextField fullWidth name="father_name" value={editFormData.father_name} onChange={handleEditInputChange} size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f9fafb' } }}/>
                            </Grid>
                            <Grid size={{ xs: 6 }} >
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>Age</Typography>
                                <TextField fullWidth name="father_age" value={editFormData.father_age} onChange={handleEditInputChange} size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f9fafb' } }}/>
                            </Grid>
                            <Grid size={{ xs: 6 }} >
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>Occupation</Typography>
                                <TextField fullWidth name="father_occ" value={editFormData.father_occ} onChange={handleEditInputChange} size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f9fafb' } }}/>
                            </Grid>
                            <Grid size={{ xs: 6 }} >
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>Educational Attainment</Typography>
                                <TextField fullWidth name="father_educ" value={editFormData.father_educ} onChange={handleEditInputChange} size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f9fafb' } }}/>
                            </Grid>
                        </Grid>
                    </Box>

                    <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 3, p: 2, mb: 3 }}>
                        <Grid container spacing={2}>
                            <Grid size={{ xs: 6 }} >
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>Mother's Full Name</Typography>
                                <TextField fullWidth name="mother_name" value={editFormData.mother_name} onChange={handleEditInputChange} size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f9fafb' } }}/>
                            </Grid>
                            <Grid size={{ xs: 6 }} >
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>Age</Typography>
                                <TextField fullWidth name="mother_age" value={editFormData.mother_age} onChange={handleEditInputChange} size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f9fafb' } }}/>
                            </Grid>
                            <Grid size={{ xs: 6 }} >
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>Occupation</Typography>
                                <TextField fullWidth name="mother_occ" value={editFormData.mother_occ} onChange={handleEditInputChange} size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f9fafb' } }}/>
                            </Grid>
                            <Grid size={{ xs: 6 }} >
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>Educational Attainment</Typography>
                                <TextField fullWidth name="mother_educ" value={editFormData.mother_educ} onChange={handleEditInputChange} size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f9fafb' } }}/>
                            </Grid>
                        </Grid>
                    </Box>

                    <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 3, p: 2, mb: 3 }}>
                        <Grid container spacing={2}>
                            <Grid size={{ xs: 12 }} >
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>Legal Guardian's Full Name</Typography>
                                <TextField fullWidth name="legal_guardian_name" value={editFormData.legal_guardian_name} onChange={handleEditInputChange} size="small" placeholder="Name of guardian if not parents" sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f9fafb' } }}/>
                            </Grid>
                        </Grid>
                    </Box>

                    <Grid container spacing={2} sx={{ mb: 4 }}>
                        <Grid size={{ xs: 6 }} >
                            <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>No. of siblings</Typography>
                            <TextField fullWidth name="num_of_siblings" type="number" value={editFormData.num_of_siblings} onChange={handleEditInputChange} size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f9fafb' } }}/>
                        </Grid>
                        <Grid size={{ xs: 6 }} >
                             <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>Pang-ilan sa mag kakapatid</Typography>
                            <TextField fullWidth name="birth_order" value={editFormData.birth_order} onChange={handleEditInputChange} size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f9fafb' } }}/>
                        </Grid>
                    </Grid>

                    <Stack direction="row" spacing={2} sx={{ mt: 'auto', justifyContent: 'flex-end' }}>
                        <Button onClick={() => setEditOpen(false)} sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 'bold' }}>
                            Cancel
                        </Button>
                        <Button onClick={handleUpdateStudent} variant="contained" color="success" sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 'bold', px: 4 }}>
                            Save Changes
                        </Button>
                    </Stack>
                </Paper>
            </Stack>
        </DialogContent>
      </Dialog>
      
      {/* ----------- ADD STUDENT MODAL ----------- */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" slotProps={{ paper: { sx: { borderRadius: 4, p: 2 } } }}>
        <DialogTitle sx={{ fontWeight: '900', textAlign: 'center', fontSize: '1.5rem', pb: 1 }}>New Student</DialogTitle>
        <DialogContent>
            {error && <Alert severity="error" sx={{ mt: 1, mb: 2, borderRadius: 2 }}>{error}</Alert>}
            <Grid container spacing={3} sx={{ mt: 2 }}>
                <Grid size={{ xs: 12, sm: 6 }} ><Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>First Name</Typography><TextField fullWidth name="first_name" placeholder="First Name" value={formData.first_name} onChange={handleInputChange} variant="outlined" size="small" sx={{ mt: 1 }} /></Grid>
                <Grid size={{ xs: 12, sm: 6 }} ><Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>Last Name</Typography><TextField fullWidth name="last_name" placeholder="Last Name" value={formData.last_name} onChange={handleInputChange} variant="outlined" size="small" sx={{ mt: 1 }} /></Grid>
                <Grid size={{ xs: 12, sm: 6 }} ><Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>Date of Birth</Typography><TextField fullWidth name="date_of_birth" type="date" value={formData.date_of_birth} onChange={handleInputChange} variant="outlined" size="small" sx={{ mt: 1 }} slotProps={{ inputLabel: { shrink: true }}} /></Grid>
                <Grid size={{ xs: 12, sm: 6 }} ><Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>LRN</Typography><TextField fullWidth name="lrn_number" placeholder="LRN" value={formData.lrn_number} onChange={handleInputChange} variant="outlined" size="small" sx={{ mt: 1 }} /></Grid>
                <Grid size={{ xs: 12, sm: 6 }} ><Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>Section (Auto-Assigned)</Typography><TextField fullWidth name="section_name" placeholder="Section" value={formData.section_name} variant="outlined" size="small" sx={{ mt: 1, bgcolor: '#f0f0f0' }} slotProps={{ input: { readOnly: true }}} /></Grid>
                <Grid size={{ xs: 12, sm: 6 }} ><Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>Gender</Typography><Select fullWidth name="gender" value={formData.gender} onChange={handleInputChange as any} size="small" sx={{ mt: 1 }}><MenuItem value="Male">Male</MenuItem><MenuItem value="Female">Female</MenuItem></Select></Grid>
                <Grid size={{ xs: 12, sm: 12 }} ><Typography variant="caption" sx={{ fontWeight: 'bold', color: 'textSecondary' }}>Emergency Contact Number</Typography><TextField fullWidth name="emergency_contact" type="number" placeholder="Emergency Contact Number" value={formData.emergency_contact} onChange={handleInputChange} variant="outlined" size="small" sx={{ mt: 1 }} /></Grid>
            </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3, justifyContent: 'center' }}>
            <Button onClick={() => setOpen(false)} sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 'bold', mr: 2 }}>Cancel</Button>
            <Button onClick={handleSaveStudent} variant="contained" sx={{ px: 5, py: 1, borderRadius: 2, textTransform: 'none', fontWeight: 'bold' }}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* ----------- ARCHIVED STUDENTS MODAL ----------- */}
      <Dialog open={archiveOpen} onClose={() => setArchiveOpen(false)} maxWidth="md" fullWidth slotProps={{ paper: { sx: { borderRadius: 4, p: 0 } } }}>
        <DialogTitle sx={{ fontWeight: 'bold', bgcolor: '#f4f5f7' }}>Archived Students</DialogTitle>
        <DialogContent sx={{ p: 0 }}>
            <TableContainer>
                <Table>
                    <TableHead sx={{ backgroundColor: '#f9f9f9' }}>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 'bold', color: 'text.secondary' }}>STUDENT NAME</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', color: 'text.secondary' }}>AGE</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', color: 'text.secondary' }}>PARENT GUARDIAN</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', color: 'text.secondary' }}>SCHOOL YEAR</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', color: 'text.secondary' }}>ACTION</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {archivedStudents.map((student) => (
                            <TableRow key={`archived-${student.lrn_number}`}>
                                <TableCell sx={{ textTransform: 'uppercase' }}>{student.last_name}, {student.first_name}</TableCell>
                                <TableCell>{student.decimal_age} yrs</TableCell>
                                <TableCell sx={{ textTransform: 'uppercase' }}>{student.parent_names || 'N/A'}</TableCell>
                                <TableCell>{student.school_year || 'N/A'}</TableCell>
                                <TableCell>
                                    <Stack direction="row" spacing={1}  sx={{ alignItems: "center" }}>
                                        <IconButton onClick={() => handleUnarchiveStudent(student.lrn_number)} color="success" title="Restore Student">
                                          <RestoreIcon />
                                        </IconButton>
                                        <IconButton onClick={() => handleDeleteStudent(student.lrn_number)} color="error" title="Permanently Delete Student">
                                          <DeleteIcon />
                                        </IconButton>
                                    </Stack>
                                </TableCell>
                            </TableRow>
                        ))}
                        {archivedStudents.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>No archived students found.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setArchiveOpen(false)} variant="contained" sx={{ textTransform: 'none' }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ----------- CONFIRM ARCHIVE ALL MODAL ----------- */}
      <Dialog open={confirmArchiveAllOpen} onClose={() => setConfirmArchiveAllOpen(false)} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: 4, p: 2 } } }}>
        <DialogTitle sx={{ fontWeight: 'bold', color: '#ed6c02', display: 'flex', alignItems: 'center', gap: 1 }}>
          <ArchiveIcon /> Confirm Mass Archive
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mt: 1 }}>
            Are you sure you want to archive <strong>all active students</strong> for this school year?
          </Typography>
          <Typography variant="body2" sx={{ mt: 2, color: 'textSecondary' }}>
            This action will move all your current students to the archive. You can restore them later from the archive view if needed.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setConfirmArchiveAllOpen(false)} sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 'bold' }}>Cancel</Button>
          <Button onClick={executeArchiveAll} variant="contained" color="warning" sx={{ textTransform: 'none', fontWeight: 'bold', boxShadow: 'none' }}>Yes, Archive All</Button>
        </DialogActions>
      </Dialog>
      {/* ----------- IMPORT INFO SHEET MODAL ----------- */}
      <Dialog open={importOpen} onClose={() => setImportOpen(false)} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: 4, p: 2 } } }}>
        <DialogTitle sx={{ fontWeight: '900', textAlign: 'center', fontSize: '1.5rem', pb: 1 }}>Import Info Sheet</DialogTitle>
        <DialogContent>
            {importError && <Alert severity="error" sx={{ mt: 1, mb: 2, borderRadius: 2 }}>{importError}</Alert>}
            <Typography variant="body2" sx={{ mb: 3, color: 'textSecondary' }}>
                Upload an Excel (.xlsx) file containing student records. Ensure it follows the official "Info Sheet" format.
            </Typography>
            <Box sx={{ border: '2px dashed #ccc', borderRadius: 2, p: 4, textAlign: 'center', bgcolor: '#f9f9f9', position: 'relative' }}>
                <input
                    type="file"
                    accept=".xlsx"
                    onChange={handleImportFileChange}
                    style={{ position: 'absolute', width: '100%', height: '100%', top: 0, left: 0, opacity: 0, cursor: 'pointer' }}
                />
                <Typography variant="body1" sx={{ fontWeight: 'bold', color: importFile ? 'success.main' : 'textSecondary' }}>
                    {importFile ? importFile.name : "Drag and drop or click to upload .xlsx file"}
                </Typography>
            </Box>
            {importing && (
                <Box sx={{ mt: 3, textAlign: 'center' }}>
                    <LinearProgress />
                    <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>Importing records...</Typography>
                </Box>
            )}
        </DialogContent>
        <DialogActions sx={{ p: 3, justifyContent: 'center' }}>
            <Button onClick={() => setImportOpen(false)} disabled={importing} sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 'bold', mr: 2 }}>Cancel</Button>
            <Button onClick={handleImportSubmit} disabled={!importFile || importing} variant="contained" sx={{ px: 5, py: 1, borderRadius: 2, textTransform: 'none', fontWeight: 'bold' }}>Import</Button>
        </DialogActions>
      </Dialog>

      {/* ----------- IMPORT SUMMARY MODAL ----------- */}
      <Dialog open={!!importSummary} onClose={() => setImportSummary(null)} maxWidth="md" fullWidth slotProps={{ paper: { sx: { borderRadius: 4, p: 2 } } }}>
        <DialogTitle sx={{ fontWeight: '900', fontSize: '1.5rem', pb: 1 }}>Import Summary</DialogTitle>
        <DialogContent>
            {importSummary && (
                <Box>
                    <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
                        <Paper sx={{ p: 2, flex: 1, textAlign: 'center', bgcolor: '#e8f5e9' }}>
                            <Typography variant="h4" sx={{ color: 'success.main', fontWeight: 'bold' }}>{importSummary.successCount}</Typography>
                            <Typography variant="body2">Successfully Imported</Typography>
                        </Paper>
                        <Paper sx={{ p: 2, flex: 1, textAlign: 'center', bgcolor: '#ffebee' }}>
                            <Typography variant="h4" sx={{ color: 'error.main', fontWeight: 'bold' }}>{importSummary.errorCount}</Typography>
                            <Typography variant="body2">Failed to Import</Typography>
                        </Paper>
                    </Stack>
                    {importSummary.errors && importSummary.errors.length > 0 && (
                        <Box>
                            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold' }}>Error Details:</Typography>
                            <TableContainer component={Paper} sx={{ maxHeight: 200 }}>
                                <Table size="small" stickyHeader>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Row</TableCell>
                                            <TableCell>Error Message</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {importSummary.errors.map((err: any, idx: number) => (
                                            <TableRow key={idx}>
                                                <TableCell>{err.row}</TableCell>
                                                <TableCell color="error">{err.message}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Box>
                    )}
                </Box>
            )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setImportSummary(null)} variant="contained" sx={{ textTransform: 'none', fontWeight: 'bold' }}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StudentManagement;


