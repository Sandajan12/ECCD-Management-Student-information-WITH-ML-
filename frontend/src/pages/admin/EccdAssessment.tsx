import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, Paper, Button, Table, TableBody, 
  TableCell, TableContainer, TableHead, TableRow, MenuItem, 
  Select, FormControl, InputLabel, CircularProgress, Alert,
  Menu, Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, Grid, Chip, Tooltip, Snackbar
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import api from '../../services/api';
import {
  getDraft,
  saveDraft,
  removeDraft,
  getPendingCount,
  syncPendingDrafts
} from '../../utils/eccdOfflineSync';

interface Student {
  lrn_number?: string;
  lrn?: string;
  first_name: string;
  last_name: string;
}

interface Domain {
  domain_id: string | number;
  domain_name: string;
  pre_progress?: number;
  mid_progress?: number;
  post_progress?: number;
  questions?: Question[];
}

interface Question {
  question_id: string | number;
  question_text: string;
  answers?: Record<string, string>;
  pre_answer?: string;
  mid_answer?: string;
  post_answer?: string;
  evaluations?: { testing_period: string; answer: string; }[];
  PRE?: string;
  MID?: string;
  POST?: string;
}

const EccdAssessment: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedLrn, setSelectedLrn] = useState('');
  const [domains, setDomains] = useState<Domain[]>([]);
  const [activeDomain, setActiveDomain] = useState<Domain | null>(null);
  const [evaluations, setEvaluations] = useState<Record<string, string>>({});
  const [evalAges, setEvalAges] = useState<Record<string, Record<string, number | null>>>({});
  const [loading, setLoading] = useState(false);
  const [evalLoading, setEvalLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadMenuAnchor, setDownloadMenuAnchor] = useState<HTMLElement | null>(null);
  const [singleDownloadModalOpen, setSingleDownloadModalOpen] = useState(false);
  const [downloadTargetLrn, setDownloadTargetLrn] = useState('');
  const [assessmentDate, setAssessmentDate] = useState(new Date().toISOString().split('T')[0]);
  const [activePeriod, setActivePeriod] = useState('PRE');
  const [evaluationDates, setEvaluationDates] = useState<Record<string, string | null>>({});
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingDraftsCount, setPendingDraftsCount] = useState(0);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'info' | 'warning' | 'error';
  }>({
    open: false,
    message: '',
    severity: 'info',
  });

  const triggerBackgroundSync = async () => {
    const count = getPendingCount();
    if (count === 0) {
      setPendingDraftsCount(0);
      return;
    }
    setIsSyncing(true);
    try {
      const result = await syncPendingDrafts(api);
      setPendingDraftsCount(getPendingCount());
      if (result.successCount > 0) {
        setSnackbar({
          open: true,
          message: `Connection restored. ${result.successCount} offline assessment${result.successCount > 1 ? 's' : ''} synced successfully.`,
          severity: 'success',
        });
        fetchDomainsProgress();
        if (selectedLrn) {
          fetchStudentAssessment(selectedLrn);
        }
      }
    } catch (err) {
      console.error('Auto-sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerBackgroundSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSnackbar({
        open: true,
        message: 'You are currently offline. Evaluations will be saved locally on this device.',
        severity: 'warning',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    setPendingDraftsCount(getPendingCount());
    if (navigator.onLine) {
      triggerBackgroundSync();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [selectedLrn]);

  useEffect(() => {
    if (selectedLrn && activeDomain) {
      const draft = getDraft(selectedLrn, activePeriod, activeDomain.domain_id);
      if (draft) {
        if (draft.evaluation_date) {
          setAssessmentDate(draft.evaluation_date);
        }
        if (draft.answers) {
          setEvaluations(prev => {
            const updated = { ...prev };
            Object.entries(draft.answers).forEach(([qid, ans]) => {
              updated[`${qid}-${activePeriod}`] = ans;
            });
            return updated;
          });
        }
        return;
      }
    }

    if (evaluationDates[activePeriod]) {
      setAssessmentDate(evaluationDates[activePeriod] as string);
    } else {
      setAssessmentDate(new Date().toISOString().split('T')[0]);
    }
  }, [activePeriod, selectedLrn, activeDomain, evaluationDates]);

  useEffect(() => {
    fetchStudents();
    fetchDomainsProgress();
  }, []);

  useEffect(() => {
    if (selectedLrn && activeDomain) {
      fetchStudentAssessment(selectedLrn);
    } else {
      setEvaluations({});
      setEvalAges({});
    }
  }, [selectedLrn, activeDomain]);

  const fetchStudents = async () => {
    try {
      const res = await api.get('/api/eccd/students');
      if (res.data) setStudents(res.data);
    } catch (err) {
      console.error(err);
      setError('Could not load students. Please check your connection.');
    }
  };

  const fetchDomainsProgress = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/eccd/domains-progress');
      if (res.data) setDomains(res.data);
    } catch (err) {
      console.error(err);
      setError('Could not load domains progress.');
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentAssessment = async (lrn: string) => {
    setEvalLoading(true);
    try {
      const res = await api.get(`/api/eccd/assessment/${lrn}`);
      const rawData = res.data;
      
      const domainData: Domain[] = rawData.domains || rawData;
      setEvalAges(rawData.evalAges || {});
      setEvaluationDates(rawData.evaluationDates || { PRE: null, MID: null, POST: null });

      const initialEvals: Record<string, string> = {};
      domainData.forEach(domain => {
        domain.questions?.forEach(q => {
          let preAns = null;
          let midAns = null;
          let postAns = null;

          ['PRE', 'MID', 'POST'].forEach(period => {
            let ans: string | null = null;
            if (q.answers && q.answers[period]) ans = q.answers[period];
            else if ((q as any)[`${period.toLowerCase()}_answer`]) ans = (q as any)[`${period.toLowerCase()}_answer`];
            else if (Array.isArray(q.evaluations)) {
              const ev = q.evaluations.find(e => e.testing_period === period);
              if (ev) ans = ev.answer;
            } else if ((q as any)[period]) ans = (q as any)[period];

            if (period === 'PRE') preAns = ans;
            if (period === 'MID') midAns = ans;
            if (period === 'POST') postAns = ans;
          });

          if (!midAns && preAns === 'KAYA') midAns = 'KAYA';
          if (!postAns && midAns === 'KAYA') postAns = 'KAYA';

          if (preAns) initialEvals[`${q.question_id}-PRE`] = preAns;
          if (midAns) initialEvals[`${q.question_id}-MID`] = midAns;
          if (postAns) initialEvals[`${q.question_id}-POST`] = postAns;
        });
      });

      // Hydrate from local draft if one exists for the current student, period, and domain
      if (activeDomain) {
        const draft = getDraft(lrn, activePeriod, activeDomain.domain_id);
        if (draft) {
          if (draft.answers) {
            Object.entries(draft.answers).forEach(([qid, ans]) => {
              initialEvals[`${qid}-${activePeriod}`] = ans;
            });
          }
          if (draft.evaluation_date) {
            setAssessmentDate(draft.evaluation_date);
          }
          setSnackbar({
            open: true,
            message: 'Restored unsaved assessment draft from local storage.',
            severity: 'info',
          });
        }
      }

      setEvaluations(initialEvals);
    } catch (err) {
      console.error(err);
      setError('Could not load student assessment data.');
    } finally {
      setEvalLoading(false);
    }
  };

  const handleAnswerChange = (questionId: string | number, period: string, answer: string) => {
    setEvaluations(prev => {
      const newEvals = { ...prev, [`${questionId}-${period}`]: answer };
      
      if (answer === 'KAYA') {
        if (period === 'PRE') {
          newEvals[`${questionId}-MID`] = 'KAYA';
          newEvals[`${questionId}-POST`] = 'KAYA';
        } else if (period === 'MID') {
          newEvals[`${questionId}-POST`] = 'KAYA';
          if (!prev[`${questionId}-PRE`]) {
            newEvals[`${questionId}-PRE`] = 'KAYA';
          }
        } else if (period === 'POST') {
          if (!prev[`${questionId}-PRE`]) newEvals[`${questionId}-PRE`] = 'KAYA';
          if (!prev[`${questionId}-MID`]) newEvals[`${questionId}-MID`] = 'KAYA';
        }
      }

      // Auto-cache to localStorage under scoped composite key
      if (selectedLrn && activeDomain) {
        const domainAnswers: Record<string, string> = {};
        activeDomain.questions?.forEach(q => {
          const ans = newEvals[`${q.question_id}-${period}`];
          if (ans) {
            domainAnswers[String(q.question_id)] = ans;
          }
        });
        const existingDraft = getDraft(selectedLrn, period, activeDomain.domain_id);
        saveDraft({
          student_lrn: selectedLrn,
          testing_period: period,
          domain_id: activeDomain.domain_id,
          evaluation_date: assessmentDate,
          answers: domainAnswers,
          is_pending_sync: existingDraft ? existingDraft.is_pending_sync : false,
          updated_at: new Date().toISOString(),
        });
        setPendingDraftsCount(getPendingCount());
      }
      
      return newEvals;
    });
  };

  const handleDateChange = (newDate: string) => {
    setAssessmentDate(newDate);
    if (selectedLrn && activeDomain) {
      const existingDraft = getDraft(selectedLrn, activePeriod, activeDomain.domain_id);
      const domainAnswers: Record<string, string> = existingDraft?.answers || {};
      if (Object.keys(domainAnswers).length === 0) {
        activeDomain.questions?.forEach(q => {
          const ans = evaluations[`${q.question_id}-${activePeriod}`];
          if (ans) domainAnswers[String(q.question_id)] = ans;
        });
      }
      saveDraft({
        student_lrn: selectedLrn,
        testing_period: activePeriod,
        domain_id: activeDomain.domain_id,
        evaluation_date: newDate,
        answers: domainAnswers,
        is_pending_sync: existingDraft ? existingDraft.is_pending_sync : false,
        updated_at: new Date().toISOString(),
      });
      setPendingDraftsCount(getPendingCount());
    }
  };

  const getAnswer = (questionId: string | number, period: string) => {
    return evaluations[`${questionId}-${period}`] || null;
  };

  const handleSave = async () => {
    if (!selectedLrn || !activeDomain) return;
    setSaving(true);
    
    const evaluationsPayload = Object.entries(evaluations)
      .filter(([key]) => key.split('-')[1] === activePeriod)
      .map(([key, answer]) => {
        const [question_id, testing_period] = key.split('-');
        return {
          question_id: parseInt(question_id, 10),
          testing_period,
          answer,
        };
      });

    const domainAnswers: Record<string, string> = {};
    evaluationsPayload.forEach(item => {
      domainAnswers[String(item.question_id)] = item.answer;
    });

    const payload = {
      student_lrn: selectedLrn,
      testing_period: activePeriod,
      assessment_date: assessmentDate,
      evaluations: evaluationsPayload,
    };

    // If offline, save locally with is_pending_sync: true and notify user
    if (!navigator.onLine) {
      saveDraft({
        student_lrn: selectedLrn,
        testing_period: activePeriod,
        domain_id: activeDomain.domain_id,
        evaluation_date: assessmentDate,
        answers: domainAnswers,
        is_pending_sync: true,
        updated_at: new Date().toISOString(),
      });
      setPendingDraftsCount(getPendingCount());
      setSnackbar({
        open: true,
        message: 'Saved locally on device. Will automatically sync once reconnected.',
        severity: 'info',
      });
      setSaving(false);
      return;
    }

    try {
      await api.post('/api/eccd/evaluate', payload);
      // Remove specific local draft on confirmed save
      removeDraft(selectedLrn, activePeriod, activeDomain.domain_id);
      setPendingDraftsCount(getPendingCount());
      setSnackbar({
        open: true,
        message: 'Assessment Saved Successfully!',
        severity: 'success',
      });
      fetchDomainsProgress();
      fetchStudentAssessment(selectedLrn);
    } catch (err: any) {
      console.error(err);
      if (!navigator.onLine || !err.response) {
        saveDraft({
          student_lrn: selectedLrn,
          testing_period: activePeriod,
          domain_id: activeDomain.domain_id,
          evaluation_date: assessmentDate,
          answers: domainAnswers,
          is_pending_sync: true,
          updated_at: new Date().toISOString(),
        });
        setPendingDraftsCount(getPendingCount());
        setSnackbar({
          open: true,
          message: 'Saved locally on device. Will automatically sync once reconnected.',
          severity: 'info',
        });
      } else {
        const errorMsg = (err.response?.data?.detail || err.response?.data?.error) || err.message;
        setSnackbar({
          open: true,
          message: 'Error saving assessment: ' + errorMsg,
          severity: 'error',
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDomainClick = (domain: Domain) => {
    setActiveDomain(domain);
    setSelectedLrn(''); 
  };

  const handleDownloadSpecific = async (lrn: string) => {
    if (!lrn) return;
    setDownloading(true);
    try {
      const res = await api.get(`/api/teachers/download/${lrn}`, { responseType: 'blob' });
      const blob = res.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const currentYear = new Date().getFullYear();
      const schoolYear = `${currentYear}-${currentYear + 1}`;
      
      const contentDisposition = res.headers['content-disposition'];
      let filename = `ECCD_Assessment_${schoolYear}.xlsx`;
      if (contentDisposition && contentDisposition.includes('filename=')) {
        filename = contentDisposition.split('filename=')[1].replace(/"/g, '');
      }
      a.download = filename;
      
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      alert('Error downloading assessment: ' + err.message);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadAll = async () => {
    setDownloading(true);
    try {
      const res = await api.get(`/api/teachers/download-all`, { responseType: 'blob' });
      
      const blob = res.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const currentYear = new Date().getFullYear();
      const schoolYear = `${currentYear}-${currentYear + 1}`;
      
      const contentDisposition = res.headers['content-disposition'];
      let filename = `Class_ECCD_Assessments_${schoolYear}.zip`;
      if (contentDisposition && contentDisposition.includes('filename=')) {
        filename = contentDisposition.split('filename=')[1].replace(/"/g, '');
      }
      a.download = filename;
      
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      alert('Error downloading assessments: ' + err.message);
    } finally {
      setDownloading(false);
    }
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
                <MenuItem key={s.lrn_number || s.lrn} value={s.lrn_number || s.lrn}>
                  {s.first_name} {s.last_name} ({s.lrn_number || s.lrn})
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
                        <MenuItem key={s.lrn_number || s.lrn} value={s.lrn_number || s.lrn}>
                          {s.first_name} {s.last_name} ({s.lrn_number || s.lrn})
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
                          onChange={(e) => setActivePeriod(e.target.value as string)}
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

