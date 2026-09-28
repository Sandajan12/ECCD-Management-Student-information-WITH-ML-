import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, Button, Paper, TextField, InputAdornment, MenuItem, Select,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Grid,
  Checkbox, Alert, CircularProgress, FormControl
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import api from '../../services/api';

interface Parent {
  relationship: string;
  fullname: string;
  age: number | string;
  occupation: string;
  educational_attainment: string;
}

interface Student {
  lrn: string;
  full_name: string;
  class_name: string;
  school_year: string;
  gender: string;
  date_of_birth: string;
  decimal_age: number | string;
  handedness: string;
  birth_order: string;
  num_of_siblings: number | string;
  address: string;
  emergency_contact: string;
  parents: Parent[];
}

const StudentRecords: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sectionFilter, setSectionFilter] = useState('All Sections');
  const [sections, setSections] = useState<string[]>([]);
  const [schoolYearFilter, setSchoolYearFilter] = useState('All School Years');
  const [schoolYears, setSchoolYears] = useState<string[]>([]);
  
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [selectedDownloadSection, setSelectedDownloadSection] = useState('All Sections');

  // Multi-select & Bulk Transfer state
  const [selectedLrns, setSelectedLrns] = useState<string[]>([]);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [availableSections, setAvailableSections] = useState<Array<{ section_id: number; section_name: string; current_teacher?: any }>>([]);
  const [targetSectionId, setTargetSectionId] = useState<number | string>('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState('');
  const [transferError, setTransferError] = useState('');

  const fetchAvailableSections = async () => {
    try {
      const res = await api.get('/api/chairman/sections');
      setAvailableSections(res.data);
    } catch {
      try {
        const fallbackRes = await api.get('/api/sections/');
        setAvailableSections(fallbackRes.data);
      } catch (err) {
        console.error("Failed to load sections", err);
      }
    }
  };

  const handleOpenTransferModal = () => {
    setTransferSuccess('');
    setTransferError('');
    setTargetSectionId('');
    fetchAvailableSections();
    setTransferModalOpen(true);
  };

  const handleExecuteTransfer = async () => {
    if (!targetSectionId) {
      setTransferError("Please select a target section.");
      return;
    }
    setTransferLoading(true);
    setTransferError('');
    setTransferSuccess('');
    try {
      await api.put('/api/chairman/students/transfer', {
        lrn_numbers: selectedLrns,
        new_section_id: Number(targetSectionId)
      });
      setTransferSuccess(`Successfully transferred ${selectedLrns.length} student(s)!`);
      setSelectedLrns([]);
      await fetchStudents();
      setTimeout(() => {
        setTransferModalOpen(false);
        setTransferSuccess('');
      }, 1500);
    } catch (err: any) {
      setTransferError(err.response?.data?.detail || "Failed to transfer students.");
    } finally {
      setTransferLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      const response = await api.get('/api/students/all');
      const data: Student[] = response.data;
      setStudents(data);
        
      const uniqueSections = Array.from(new Set(data.map(s => s.class_name).filter(Boolean)));
      setSections(uniqueSections);

      const uniqueSchoolYears = Array.from(new Set(data.map(s => s.school_year).filter(Boolean)));
      setSchoolYears(uniqueSchoolYears);
    } catch (error) {
      console.error("Failed to fetch students", error);
    }
  };

  const filteredStudents = students.filter((student) => {
    const matchesSearch = 
      (student.lrn && student.lrn.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (student.full_name && student.full_name.toLowerCase().includes(searchQuery.toLowerCase()));
      
    const matchesSection = sectionFilter === 'All Sections' || student.class_name === sectionFilter;
    const matchesSchoolYear = schoolYearFilter === 'All School Years' || student.school_year === schoolYearFilter;

    return matchesSearch && matchesSection && matchesSchoolYear;
  });

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedLrns(filteredStudents.map((s) => s.lrn));
    } else {
      setSelectedLrns([]);
    }
  };

  const handleToggleSelect = (lrn: string) => {
    setSelectedLrns((prev) =>
      prev.includes(lrn) ? prev.filter((id) => id !== lrn) : [...prev, lrn]
    );
  };

  const isAllSelected = filteredStudents.length > 0 && selectedLrns.length === filteredStudents.length;
  const isIndeterminate = selectedLrns.length > 0 && selectedLrns.length < filteredStudents.length;

  const handleRowClick = (student: Student) => {
    setSelectedStudent(student);
  };

  const handleClose = () => {
    setSelectedStudent(null);
  };

  const handleDownloadEccd = async () => {
    try {
      const query = new URLSearchParams({ section: selectedDownloadSection }).toString();
      const response = await api.get(`/api/eccd/export-all?${query}`, {
        responseType: 'blob'
      });
      
      const currentYear = new Date().getFullYear();
      const schoolYear = `${currentYear}-${currentYear + 1}`;
      
      const contentDisposition = response.headers['content-disposition'];
      let filename = selectedDownloadSection === 'All Sections' 
        ? `ECCD_EXPORT_ALL_SECTIONS_${schoolYear}.zip` 
        : `ECCD_EXPORT_${selectedDownloadSection.replace(/\s+/g, '_')}_${schoolYear}.xlsx`;
        
      if (contentDisposition && contentDisposition.includes('filename=')) {
        filename = contentDisposition.split('filename=')[1].replace(/"/g, '');
      }

      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setDownloadModalOpen(false);
    } catch (error) {
      console.error('Error downloading ECCD export:', error);
      alert('An error occurred while exporting the records.');
    }
  };

  const InfoRow = ({ label, value }: { label: string, value: string | number }) => (
    <Box sx={{ display: 'flex', mb: 1.5 }}>
      <Typography sx={{ fontWeight: 'bold', width: '140px', color: '#4B5563', fontSize: '0.9rem' }}>{label}:</Typography>
      <Typography sx={{ flex: 1, color: '#111827', fontSize: '0.9rem' }}>{value || 'N/A'}</Typography>
    </Box>
  );

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h5" sx={{ fontWeight: '800', color: '#111827' }}>
          Enrolled Students
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button 
            variant="contained" 
            onClick={() => setDownloadModalOpen(true)}
            sx={{ 
              backgroundColor: 'var(--primary-color)', 
              fontWeight: 'bold', 
              textTransform: 'none',
              borderRadius: 24
            }}
          >
            Download ECCD Records
          </Button>
        </Box>
      </Box>

      <Paper sx={{ p: 2, mb: 4, display: 'flex', gap: 2, alignItems: 'center', borderRadius: 4, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <TextField
          placeholder="Enter search Records by (LRN or Name)"
          size="small"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ flex: 1, backgroundColor: '#F9FAFB', '& .MuiOutlinedInput-root': { borderRadius: 4 } }}
          slotProps={{ input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: '#9CA3AF' }} />
              </InputAdornment>
            ),
          }}}
        />
        
        <Select
          size="small"
          value={sectionFilter}
          onChange={(e) => setSectionFilter(e.target.value)}
          sx={{ minWidth: 200, backgroundColor: '#F9FAFB', borderRadius: 4 }}
        >
          <MenuItem value="All Sections">All Sections</MenuItem>
          {sections.map((section, idx) => (
            <MenuItem key={idx} value={section}>{section}</MenuItem>
          ))}
        </Select>

        <Select
          size="small"
          value={schoolYearFilter}
          onChange={(e) => setSchoolYearFilter(e.target.value)}
          sx={{ minWidth: 200, backgroundColor: '#F9FAFB', borderRadius: 4 }}
        >
          <MenuItem value="All School Years">All School Years</MenuItem>
          {schoolYears.map((sy, idx) => (
            <MenuItem key={idx} value={sy}>{sy}</MenuItem>
          ))}
        </Select>
      </Paper>

      {selectedLrns.length > 0 && (
        <Paper 
          sx={{ 
            p: 2, 
            mb: 3, 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            bgcolor: '#f0fdf4', 
            border: '1px solid #bbf7d0', 
            borderRadius: 3, 
            flexWrap: 'wrap', 
            gap: 2 
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="body1" sx={{ fontWeight: 'bold', color: '#166534' }}>
              {selectedLrns.length} student(s) selected
            </Typography>
            <Button 
              size="small" 
              onClick={() => setSelectedLrns([])} 
              sx={{ color: '#15803d', textTransform: 'none', fontWeight: 'bold' }}
            >
              Clear Selection
            </Button>
          </Box>
          <Button 
            variant="contained" 
            startIcon={<SwapHorizIcon />}
            onClick={handleOpenTransferModal}
            sx={{ 
              borderRadius: 24, 
              bgcolor: '#16a34a', 
              '&:hover': { bgcolor: '#15803d' }, 
              textTransform: 'none', 
              fontWeight: 'bold' 
            }}
          >
            Transfer Students
          </Button>
        </Paper>
      )}

      <TableContainer component={Paper} sx={{ borderRadius: 4, boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
        <Table>
          <TableHead sx={{ backgroundColor: '#F3F4F6' }}>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  checked={isAllSelected}
                  indeterminate={isIndeterminate}
                  onChange={handleSelectAll}
                  size="small"
                />
              </TableCell>
              <TableCell sx={{ fontWeight: 'bold', color: '#4B5563' }}>LRN ID</TableCell>
              <TableCell sx={{ fontWeight: 'bold', color: '#4B5563' }}>Full Name</TableCell>
              <TableCell sx={{ fontWeight: 'bold', color: '#4B5563' }}>Class Name</TableCell>
              <TableCell sx={{ fontWeight: 'bold', color: '#4B5563' }}>School Year</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredStudents.length > 0 ? (
              filteredStudents.map((student, idx) => (
                <TableRow 
                  key={idx} 
                  onClick={() => handleRowClick(student)}
                  selected={selectedLrns.includes(student.lrn)}
                  sx={{ 
                    cursor: 'pointer',
                    '&:last-child td, &:last-child th': { border: 0 }, 
                    '&:hover': { backgroundColor: '#F3F4F6' } 
                  }}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedLrns.includes(student.lrn)}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSelect(student.lrn);
                      }}
                      size="small"
                    />
                  </TableCell>
                  <TableCell sx={{ color: '#111827', fontWeight: '500' }}>{student.lrn}</TableCell>
                  <TableCell sx={{ color: '#374151' }}>{student.full_name}</TableCell>
                  <TableCell sx={{ color: '#374151' }}>{student.class_name || 'Unassigned'}</TableCell>
                  <TableCell sx={{ color: '#374151' }}>{student.school_year || 'N/A'}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 3, color: '#6B7280' }}>
                  No student records found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={Boolean(selectedStudent)} onClose={handleClose} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: 4 } } }}>
        {selectedStudent && (
          <>
            <DialogTitle sx={{ backgroundColor: 'var(--primary-color)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Student Record Details</Typography>
              <IconButton onClick={handleClose} sx={{ color: 'white' }}>
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            
            <DialogContent sx={{ p: 4, pt: 4 }}>
              <Grid container spacing={3}>
                <Grid size={{ xs: 12 }} >
                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: 'var(--primary-color)', mb: 2, borderBottom: '1px solid #E5E7EB', pb: 1 }}>
                    Academic Information
                  </Typography>
                  <InfoRow label="LRN Number" value={selectedStudent.lrn} />
                  <InfoRow label="Class Section" value={selectedStudent.class_name} />
                  <InfoRow label="School Year" value={selectedStudent.school_year} />
                </Grid>

                <Grid size={{ xs: 12 }} >
                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: 'var(--primary-color)', mb: 2, borderBottom: '1px solid #E5E7EB', pb: 1 }}>
                    Personal Details
                  </Typography>
                  <InfoRow label="Full Name" value={selectedStudent.full_name} />
                  <InfoRow label="Gender" value={selectedStudent.gender} />
                  <InfoRow label="Date of Birth" value={selectedStudent.date_of_birth ? new Date(selectedStudent.date_of_birth).toLocaleDateString() : ''} />
                  <InfoRow label="Age" value={selectedStudent.decimal_age} />
                  <InfoRow label="Handedness" value={selectedStudent.handedness} />
                  <InfoRow label="Birth Order" value={selectedStudent.birth_order} />
                  <InfoRow label="Siblings Count" value={selectedStudent.num_of_siblings} />
                  <InfoRow label="Address" value={selectedStudent.address} />
                </Grid>

                <Grid size={{ xs: 12 }} >
                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: 'var(--primary-color)', mb: 2, borderBottom: '1px solid #E5E7EB', pb: 1 }}>
                    Family Background
                  </Typography>
                  
                  {selectedStudent.parents && selectedStudent.parents.length > 0 ? (
                    selectedStudent.parents.map((parent, index) => (
                      <Box key={index} sx={{ mb: 3, p: 2, backgroundColor: '#F9FAFB', borderRadius: 4, border: '1px solid #E5E7EB' }}>
                        <Typography sx={{ fontWeight: 'bold', color: '#111827', mb: 1, textTransform: 'uppercase', fontSize: '0.85rem' }}>
                          {parent.relationship || 'Guardian'} Information
                        </Typography>
                        <InfoRow label="Full Name" value={parent.fullname} />
                        <InfoRow label="Age" value={parent.age} />
                        <InfoRow label="Occupation" value={parent.occupation} />
                        <InfoRow label="Highest Education" value={parent.educational_attainment} />
                      </Box>
                    ))
                  ) : (
                    <Typography sx={{ color: '#6B7280', fontStyle: 'italic', mb: 2 }}>No family records linked yet.</Typography>
                  )}

                  <Box sx={{ mt: 2 }}>
                    <InfoRow label="Emergency Contact" value={selectedStudent.emergency_contact} />
                  </Box>
                </Grid>
              </Grid>
            </DialogContent>
            
            <DialogActions sx={{ p: 3, pt: 0 }}>
              <Button onClick={handleClose} variant="contained" sx={{ backgroundColor: 'var(--primary-color)', borderRadius: 24 }}>
                Close
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Dialog open={downloadModalOpen} onClose={() => setDownloadModalOpen(false)} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: 4 } } }}>
        <DialogTitle sx={{ backgroundColor: 'var(--primary-color)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Download ECCD Records</Typography>
          <IconButton onClick={() => setDownloadModalOpen(false)} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 4, pt: 4 }}>
          <Typography sx={{ mb: 2, color: '#374151' }}>
            Select a section to download its ECCD records as an Excel file. Select "All Sections" to download a ZIP archive containing all sections.
          </Typography>
          <Select
            fullWidth
            value={selectedDownloadSection}
            onChange={(e) => setSelectedDownloadSection(e.target.value)}
            sx={{ backgroundColor: '#F9FAFB', borderRadius: 4 }}
          >
            <MenuItem value="All Sections">All Sections</MenuItem>
            {sections.map((section, idx) => (
              <MenuItem key={idx} value={section}>{section}</MenuItem>
            ))}
          </Select>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0 }}>
          <Button onClick={() => setDownloadModalOpen(false)} sx={{ color: '#6B7280', borderRadius: 24 }}>
            Cancel
          </Button>
          <Button onClick={handleDownloadEccd} variant="contained" sx={{ backgroundColor: 'var(--primary-color)', borderRadius: 24 }}>
            Download
          </Button>
        </DialogActions>
      </Dialog>

      {/* Transfer Students Modal */}
      <Dialog 
        open={transferModalOpen} 
        onClose={() => !transferLoading && setTransferModalOpen(false)} 
        maxWidth="sm" 
        fullWidth 
        slotProps={{ paper: { sx: { borderRadius: 4, p: 1 } } }}
      >
        <DialogTitle sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
          <SwapHorizIcon color="primary" />
          Transfer Selected Students
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
            {transferSuccess && <Alert severity="success" sx={{ borderRadius: 3 }}>{transferSuccess}</Alert>}
            {transferError && <Alert severity="error" sx={{ borderRadius: 3 }}>{transferError}</Alert>}

            <Box sx={{ p: 2, bgcolor: '#f0fdf4', borderRadius: 3, border: '1px solid #bbf7d0', display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <InfoOutlinedIcon sx={{ color: '#16a34a', mt: 0.3 }} />
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: '#166534' }}>
                  Evaluation History 100% Preserved
                </Typography>
                <Typography variant="caption" sx={{ color: '#15803d' }}>
                  All historical PRE, MID, and POST evaluation entries, timestamps, and ECCD standard scores are tied to the student's unique LRN and are fully preserved when reassigned to a new section.
                </Typography>
              </Box>
            </Box>

            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
              Transferring {selectedLrns.length} selected student(s) to:
            </Typography>

            <FormControl fullWidth size="small">
              <Typography variant="caption" sx={{ fontWeight: 'bold', mb: 0.5 }}>Destination Section</Typography>
              <Select
                value={targetSectionId}
                onChange={(e) => setTargetSectionId(e.target.value)}
                sx={{ borderRadius: 2 }}
                displayEmpty
              >
                <MenuItem value="" disabled><em>-- Select Destination Section --</em></MenuItem>
                {availableSections.map((sec) => (
                  <MenuItem key={sec.section_id} value={sec.section_id}>
                    {sec.section_name} {sec.current_teacher ? `(Adviser: Tr. ${sec.current_teacher.name})` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button 
            onClick={() => setTransferModalOpen(false)} 
            disabled={transferLoading}
            sx={{ color: 'text.secondary', borderRadius: 24, fontWeight: 'bold', textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleExecuteTransfer} 
            variant="contained" 
            disabled={transferLoading || !targetSectionId}
            sx={{ borderRadius: 24, fontWeight: 'bold', textTransform: 'none' }}
          >
            {transferLoading ? <CircularProgress size={20} color="inherit" /> : `Confirm Transfer (${selectedLrns.length})`}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
};

export default StudentRecords;
