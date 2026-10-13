import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Paper, Button, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, MenuItem,
  Select, FormControl, InputLabel, CircularProgress, Alert,
  Menu, Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, Grid, Tooltip, Snackbar, Chip
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import api, { downloadFile, errorMessage, isNetworkError } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useTeacher } from '../../context/TeacherContext';
import { useTeacherAssessment } from '../../hooks/useTeacherAssessment';
import { domainCompletion, sectionAssessments } from '../../utils/teacherMetrics';
import type { Domain as AssessmentDomain, DomainProgress, Period, Student } from '../../types';

interface Domain extends AssessmentDomain, DomainProgress {}

const EccdAssessment: React.FC = () => {
  const { user } = useAuth();
  const { section, sections } = useTeacher();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedLrn, setSelectedLrn] = useState('');
  const [domains, setDomains] = useState<Domain[]>([]);
  const [activeDomain, setActiveDomain] = useState<Domain | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadMenuAnchor, setDownloadMenuAnchor] = useState<HTMLElement | null>(null);
  const [singleDownloadModalOpen, setSingleDownloadModalOpen] = useState(false);
  const [downloadTargetLrn, setDownloadTargetLrn] = useState('');
  const [activePeriod, setActivePeriod] = useState<Period>('PRE');
  const requestVersion = useRef(0);
  const progressVersion = useRef(0);
  const [pageError, setPageError] = useState('');
  const fetchDomainsProgress = useCallback(async () => {
    const version = ++progressVersion.current;
    try {
      const res = await api.get<Domain[]>('/api/eccd/domains-progress');
      let progress = res.data;
      if (section && sections.length > 1) {
        const roster = await api.get<Student[]>('/api/students/section/' + section.section_id);
        const assessments = await sectionAssessments(roster.data.filter(student => student.is_active));
        progress = progress.map(domain => ({ ...domain, ...domainCompletion(domain, assessments) }));
      } else if (!section) progress = progress.map(domain => ({ ...domain, pre_progress: 0, mid_progress: 0, post_progress: 0 }));
      if (version !== progressVersion.current) return;
      setDomains(progress);
      localStorage.setItem('ames_teacher_domains_' + user?.id + '_' + section?.section_id, JSON.stringify(progress));
    } catch (err) {
      if (version !== progressVersion.current) return;
      if (isNetworkError(err)) {
        try { setDomains(JSON.parse(localStorage.getItem('ames_teacher_domains_' + user?.id + '_' + section?.section_id) || '[]') as Domain[]); } catch { /* Keep existing questions. */ }
      }
      setPageError(errorMessage(err));
    }
  }, [user?.id, section?.section_id, sections.length]);
  const {
    assessmentDate, evalAges, evalLoading, saving, isOnline, isSyncing, pendingDraftsCount,
    error: assessmentError, snackbar, setSnackbar, handleAnswerChange, handleDateChange,
    handleSave, triggerBackgroundSync, getAnswer,
  } = useTeacherAssessment(Number(selectedLrn), activeDomain, activePeriod, fetchDomainsProgress);
  const error = pageError || assessmentError;
  useEffect(() => {
    setSelectedLrn('');
    setDownloadTargetLrn('');
    const version = ++requestVersion.current;
    setStudents([]);
    setLoading(true);
    setPageError('');
    const cacheKey = 'ames_teacher_roster_' + user?.id + '_' + section?.section_id;
    const load = async () => {
      try {
        const res = await api.get<Student[]>('/api/eccd/students');
        if (version !== requestVersion.current) return;
        const roster = res.data.filter(s => s.is_active && s.section_id === section?.section_id);
        setStudents(roster);
        localStorage.setItem(cacheKey, JSON.stringify(roster));
      } catch (err) {
        if (version !== requestVersion.current) return;
        if (isNetworkError(err)) {
          try { setStudents(JSON.parse(localStorage.getItem(cacheKey) || '[]') as Student[]); } catch { /* Preserve cached drafts. */ }
        }
        setPageError(errorMessage(err));
      } finally { if (version === requestVersion.current) setLoading(false); }
    };
    void load();
    void fetchDomainsProgress();
    const reload = () => { void load(); void fetchDomainsProgress(); };
    window.addEventListener('online', reload);
    window.addEventListener('ames-record-synced', reload);
    return () => {
      ++requestVersion.current;
      ++progressVersion.current;
      window.removeEventListener('online', reload);
      window.removeEventListener('ames-record-synced', reload);
    };
  }, [section?.section_id, user?.id, fetchDomainsProgress]);
  const handleDomainClick = (domain: Domain) => {
    setActiveDomain(domain);
    setSelectedLrn('');
  };
  const handleDownloadSpecific = async (id: string) => {
    if (!id || downloading) return;
    setDownloading(true);
    try {
      await downloadFile('/api/teachers/download/' + id, 'ECCD_Assessment.xlsx');
      setSnackbar({ open: true, message: 'Assessment checklist downloaded successfully!', severity: 'success' });
    } catch (err) { setSnackbar({ open: true, message: errorMessage(err), severity: 'error' }); }
    finally { setDownloading(false); }
  };
  const handleDownloadAll = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadFile('/api/teachers/download-all', 'Class_ECCD_Assessments.zip');
      setSnackbar({ open: true, message: 'All section assessments downloaded successfully!', severity: 'success' });
    } catch (err) { setSnackbar({ open: true, message: errorMessage(err), severity: 'error' }); }
    finally { setDownloading(false); }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, minHeight: '100vh', position: 'relative', pb: 12 }}>
      {/* Header section */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 4, alignItems: "flex-start", justifyContent: "space-between" }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: '800', color: '#1e1e2f', mb: 0.5 }}>
            ECCD Assessment
          </Typography>
          <Typography variant="body1" sx={{ color: 'textSecondary' }}>
            Evaluate and monitor student progress across ECCD domains.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          {isSyncing ? (
            <Chip
              icon={<CircularProgress size={16} color="inherit" />}
              label="Syncing offline drafts..."
              color="info"
              variant="outlined"
              sx={{ borderRadius: 3, fontWeight: 'bold', px: 1 }}
            />
          ) : isOnline ? (
            <Chip
              icon={<WifiIcon fontSize="small" />}
              label="Online"
              color="success"
              variant="outlined"
              sx={{ borderRadius: 3, fontWeight: 'bold', px: 1, bgcolor: '#f0fdf4' }}
            />
          ) : (
            <Chip
              icon={<WifiOffIcon fontSize="small" />}
              label="Offline - Working Locally"
              color="warning"
              variant="filled"
              sx={{ borderRadius: 3, fontWeight: 'bold', px: 1 }}
            />
          )}

          {pendingDraftsCount > 0 && (
            <Tooltip title="Assessments saved locally awaiting internet reconnection. Click to sync now.">
              <Chip
                icon={<CloudSyncIcon fontSize="small" />}
                label={`${pendingDraftsCount} pending sync`}
                color="warning"
                variant="outlined"
                sx={{ borderRadius: 3, fontWeight: 'bold', cursor: isOnline ? 'pointer' : 'default' }}
                onClick={isOnline ? triggerBackgroundSync : undefined}
              />
            </Tooltip>
          )}

          <Button 
              variant="contained" 
              color="primary" 
              startIcon={<DownloadIcon />} 
              onClick={(e) => setDownloadMenuAnchor(e.currentTarget)}
              sx={{ borderRadius: 2, fontWeight: 'bold' }}
          >
              Download Records
          </Button>
        </Stack>
      </Stack>

      <Menu
        anchorEl={downloadMenuAnchor}
        open={Boolean(downloadMenuAnchor)}
        onClose={() => setDownloadMenuAnchor(null)}
      >
        <MenuItem onClick={() => { setDownloadMenuAnchor(null); setSingleDownloadModalOpen(true); }}>
          Download Single Student
        </MenuItem>
        <MenuItem onClick={() => { setDownloadMenuAnchor(null); handleDownloadAll(); }}>
          Download All Students (ZIP)
        </MenuItem>
      </Menu>

      <Dialog open={singleDownloadModalOpen} onClose={() => setSingleDownloadModalOpen(false)}>
        <DialogTitle>Select Student to Download</DialogTitle>
        <DialogContent sx={{ minWidth: 400, pt: 2 }}>
          <FormControl fullWidth size="small" sx={{ mt: 1 }}>
            <InputLabel>Select Student</InputLabel>
            <Select
              value={downloadTargetLrn}
              label="Select Student"
              onChange={(e) => setDownloadTargetLrn(e.target.value as string)}
            >
              {students.map(s => (
                <MenuItem key={s.student_id} value={String(s.student_id)}>
                  {s.first_name} {s.last_name} ({s.masked_lrn})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setSingleDownloadModalOpen(false)} color="inherit">Cancel</Button>
          <Button 
            variant="contained" 
            onClick={() => {
                handleDownloadSpecific(downloadTargetLrn);
                setSingleDownloadModalOpen(false);
            }} 
            disabled={!downloadTargetLrn || downloading}
          >
            {downloading ? 'Downloading...' : 'Download'}
          </Button>
        </DialogActions>
      </Dialog>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 5 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Main View: Domain Cards Grid */}
      {!loading && !activeDomain && domains.length > 0 && (
        <Grid container spacing={5}>
          {domains.map(domain => {
            const preProgress = domain.pre_progress || 0;
            const midProgress = domain.mid_progress || 0;
            const postProgress = domain.post_progress || 0;

            return (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={domain.domain_id}>
                <Paper 
                  sx={{ 
                    width: '100%',
                    maxWidth: 300,
                    margin: '0 auto',
                    minWidth: 300,
                    height: 380,
                    p: 3, 
                    borderRadius: 4, 
                    display: 'flex', 
                    flexDirection: 'column', 
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: '0 12px 25px rgba(0,0,0,0.1)'
                    }
                  }}
                  onClick={() => handleDomainClick(domain)}
                >
                  <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 3, color: '#1e1e2f', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'normal', overflowWrap: 'break-word', height: 65, }}>
                    {domain.domain_name}
                  </Typography>
                  
                  <Stack spacing={2} sx={{ mb: 5}}>
                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>Pre-Test</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'primary.main' }}>{preProgress}%</Typography>
                      </Box>
                      <Box sx={{ width: '100%', height: 6, bgcolor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
                        <Box sx={{ width: `${preProgress}%`, height: '100%', bgcolor: '#3B82F6', transition: 'width 0.5s ease-out' }} />
                      </Box>
                    </Box>
                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>Mid-Test</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'warning.main' }}>{midProgress}%</Typography>
                      </Box>
                      <Box sx={{ width: '100%', height: 6, bgcolor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
                        <Box sx={{ width: `${midProgress}%`, height: '100%', bgcolor: '#F59E0B', transition: 'width 0.5s ease-out' }} />
                      </Box>
                    </Box>
                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>Post-Test</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'success.main' }}>{postProgress}%</Typography>
                      </Box>
                      <Box sx={{ width: '100%', height: 6, bgcolor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
                        <Box sx={{ width: `${postProgress}%`, height: '100%', bgcolor: '#10B981', transition: 'width 0.5s ease-out' }} />
                      </Box>
                    </Box>
                  </Stack>

                  <Button 
                    fullWidth 
                    variant="contained" 
                    onClick={(e) => { e.stopPropagation(); handleDomainClick(domain); }} 
                    sx={{ 
                      mt: 'auto',
                      borderRadius: 2, 
                      py: 1, 
                      textTransform: 'none', 
                      fontWeight: 'bold', 
                      boxShadow: 'none' 
                    }}
                  >
                    Assess Domain
                  </Button>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Detail View: Single Domain Checklist */}
      {!loading && activeDomain && (
        <Box>
          <Button 
            startIcon={<ArrowBackIcon />} 
            onClick={() => setActiveDomain(null)} 
            sx={{ mb: 3, fontWeight: 'bold', color: 'text.secondary', fontSize: '1.1rem', textTransform: 'none' }}
          >
            Back to Domains
          </Button>

          <Paper sx={{ mb: 4, overflow: 'hidden', borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
            <Box sx={{ p: 3, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, bgcolor: '#fbfbfb' }}>
              <Typography variant="h5" sx={{ fontWeight: '800', color: '#1e1e2f' }}>
                {activeDomain.domain_name}
              </Typography>
              
              
                <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', alignItems: "center" }}>
                  <FormControl sx={{ minWidth: { xs: '100%', sm: 300 } }} size="small">
                    <InputLabel id="student-select-label">Select Student to Assess</InputLabel>
                    <Select
                      labelId="student-select-label"
                      value={selectedLrn}
                      label="Select Student to Assess"
                      onChange={(e) => setSelectedLrn(e.target.value as string)}
                      sx={{ bgcolor: 'white', borderRadius: 2 }}
                    >
                      {students.length === 0 && <MenuItem disabled>No students found</MenuItem>}
                      {students.map(s => (
                        <MenuItem key={s.student_id} value={String(s.student_id)}>
                          {s.first_name} {s.last_name} ({s.masked_lrn})
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {selectedLrn && (
                    <>
                      <FormControl sx={{ minWidth: 150 }} size="small">
                        <InputLabel>Testing Period</InputLabel>
                        <Select
                          value={activePeriod}
                          label="Testing Period"
                          onChange={(e) => setActivePeriod(e.target.value as Period)}
                          sx={{ bgcolor: 'white', borderRadius: 2 }}
                        >
                          <MenuItem value="PRE">Pre-Test</MenuItem>
                          <MenuItem value="MID">Mid-Test</MenuItem>
                          <MenuItem value="POST">Post-Test</MenuItem>
                        </Select>
                      </FormControl>
                      
                      <FormControl size="small">
                        <input 
                          type="date"
                          value={assessmentDate}
                          onChange={(e) => handleDateChange(e.target.value)}
                          style={{
                            padding: '9.5px 14px',
                            borderRadius: '4px',
                            border: '1px solid #c4c4c4',
                            outline: 'none',
                            fontFamily: 'inherit',
                            fontSize: '1rem',
                            backgroundColor: 'white'
                          }}
                        />
                      </FormControl>
                    </>
                  )}
                </Stack>

            </Box>
            
            {!selectedLrn ? (
                <Box sx={{ p: 6, textAlign: 'center' }}>
                    <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                      Please select a student from the dropdown above to begin assessment.
                    </Typography>
                </Box>
            ) : evalLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', my: 5 }}>
                  <CircularProgress />
                </Box>
            ) : (
                <TableContainer>
                  <Table sx={{ minWidth: 700 }}>
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#fbfbfb' }}>
                        <TableCell sx={{ fontWeight: 'bold', color: 'text.secondary', width: '40%', py: 2 }}>QUESTION / INDICATOR</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 'bold', color: 'text.secondary', width: '20%', borderLeft: '1px solid #E2E8F0', py: 2 }}>
                            PRE-TEST
                            {(evalAges[activeDomain.domain_id]?.PRE !== null && evalAges[activeDomain.domain_id]?.PRE !== undefined) && <Typography variant="caption" sx={{ display: 'block', color: 'primary' }}>Age: {evalAges[activeDomain.domain_id].PRE}</Typography>}
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 'bold', color: 'text.secondary', width: '20%', borderLeft: '1px solid #E2E8F0', py: 2 }}>
                            MID
                            {(evalAges[activeDomain.domain_id]?.MID !== null && evalAges[activeDomain.domain_id]?.MID !== undefined) && <Typography variant="caption" sx={{ display: 'block', color: 'warning.main' }}>Age: {evalAges[activeDomain.domain_id].MID}</Typography>}
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 'bold', color: 'text.secondary', width: '20%', borderLeft: '1px solid #E2E8F0', py: 2 }}>
                            POST-TEST
                            {(evalAges[activeDomain.domain_id]?.POST !== null && evalAges[activeDomain.domain_id]?.POST !== undefined) && <Typography variant="caption" sx={{ display: 'block', color: 'success.main' }}>Age: {evalAges[activeDomain.domain_id].POST}</Typography>}
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {activeDomain.questions?.map((q, index) => (
                        <TableRow key={q.question_id} sx={{ '&:last-child td, &:last-child th': { borderBottom: 0 }, '&:hover': { bgcolor: '#F8FAFC' } }}>
                          <TableCell sx={{ fontSize: '1.05rem', color: '#334155', fontWeight: '500', py: 3 }}>
                            {index + 1}. {q.question_text}
                          </TableCell>
                          {['PRE', 'MID', 'POST'].map(period => (
                            <TableCell key={period} align="center" sx={{ borderLeft: '1px solid #E2E8F0' }}>
                              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                                <Button
                                  variant={getAnswer(q.question_id, period) === 'KAYA' ? 'contained' : 'outlined'}
                                  color="success"
                                  onClick={() => handleAnswerChange(q.question_id, period, 'KAYA')}
                                  disabled={period !== activePeriod}
                                  sx={{ 
                                    minWidth: { xs: '70px', md: '90px' }, 
                                    fontWeight: 'bold',
                                    borderRadius: 2,
                                    py: 1,
                                    borderWidth: getAnswer(q.question_id, period) === 'KAYA' ? 1 : 2,
                                    '&:hover': { borderWidth: getAnswer(q.question_id, period) === 'KAYA' ? 1 : 2 }
                                  }}
                                  disableElevation
                                >
                                  KAYA
                                </Button>
                                <Button
                                  variant={getAnswer(q.question_id, period) === 'DI-KAYA' ? 'contained' : 'outlined'}
                                  color="error"
                                  onClick={() => handleAnswerChange(q.question_id, period, 'DI-KAYA')}
                                  disabled={period !== activePeriod}
                                  sx={{ 
                                    minWidth: { xs: '70px', md: '90px' }, 
                                    fontWeight: 'bold',
                                    borderRadius: 2,
                                    py: 1,
                                    borderWidth: getAnswer(q.question_id, period) === 'DI-KAYA' ? 1 : 2,
                                    '&:hover': { borderWidth: getAnswer(q.question_id, period) === 'DI-KAYA' ? 1 : 2 }
                                  }}
                                  disableElevation
                                >
                                  DI-KAYA
                                </Button>
                              </Box>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
            )}
          </Paper>

          {/* Sticky Save Button (Only show if a student is selected) */}
          {selectedLrn && !evalLoading && (
            <Box sx={{ 
              position: 'fixed', 
              bottom: 0, 
              left: 0, 
              right: 0, 
              p: 3, 
              bgcolor: 'rgba(255, 255, 255, 0.9)', 
              backdropFilter: 'blur(10px)',
              borderTop: '1px solid #E2E8F0',
              zIndex: 1000,
              display: 'flex',
              justifyContent: 'center',
              boxShadow: '0 -4px 10px rgba(0,0,0,0.05)'
            }}>
              <Button
                variant="contained"
                size="large"
                color={!isOnline ? 'warning' : 'success'}
                onClick={handleSave}
                disabled={saving}
                startIcon={!isOnline ? <WifiOffIcon /> : undefined}
                sx={{
                  py: 2,
                  px: 8,
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  textTransform: 'none',
                  borderRadius: 2,
                  boxShadow: !isOnline ? '0 4px 10px rgba(245, 158, 11, 0.3)' : '0 4px 10px rgba(76, 175, 80, 0.3)',
                  minWidth: { xs: '100%', sm: '400px' },
                }}
              >
                {saving ? (
                  <CircularProgress size={28} color="inherit" />
                ) : !isOnline ? (
                  'Save Assessment (Offline)'
                ) : (
                  'Save Assessment'
                )}
              </Button>
            </Box>
          )}
        </Box>
      )}

      {!loading && domains.length === 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>No assessment domains found.</Alert>
      )}

      {/* Snackbar feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%', borderRadius: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default EccdAssessment;

