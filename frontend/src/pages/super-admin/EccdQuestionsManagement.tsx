import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, Paper, Button, Table, TableBody, 
  TableCell, TableContainer, TableHead, TableRow, 
  CircularProgress, Alert, TextField, Dialog, 
  DialogTitle, DialogContent, DialogActions, IconButton,
  Grid
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import HomeIcon from '@mui/icons-material/Home';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import Tooltip from '@mui/material/Tooltip';
import api from '../../services/api';

interface Question {
  question_id: string | number;
  question_text: string;
  sequence_order: string | number;
  is_home_based: boolean;
}

interface Domain {
  domain_id: string | number;
  domain_name: string;
  questions?: Question[];
}

const EccdQuestionsManagement: React.FC = () => {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [activeDomain, setActiveDomain] = useState<Domain | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [domainModal, setDomainModal] = useState({ open: false, mode: 'add', data: null as Domain | null });
  const [questionModal, setQuestionModal] = useState({ open: false, mode: 'add', data: null as Question | null });

  const [domainName, setDomainName] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [sequenceOrder, setSequenceOrder] = useState('');

  useEffect(() => {
    fetchDomains();
  }, []);

  const fetchDomains = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/api/eccd-config/');
      setDomains(response.data);
      if (activeDomain) {
        const updatedActive = response.data.find((d: Domain) => d.domain_id === activeDomain.domain_id);
        setActiveDomain(updatedActive || null);
      }
    } catch (err: any) {
      console.error(err);
      setError('Could not load ECCD data.');
    } finally {
      setLoading(false);
    }
  };

  const handleDomainClick = (domain: Domain) => {
    setActiveDomain(domain);
  };

  const handleSaveDomain = async () => {
    try {
      if (domainModal.mode === 'add') {
        await api.post('/api/eccd-config/domains', { domain_name: domainName });
      } else if (domainModal.data) {
        await api.put(`/api/eccd-config/domains/${domainModal.data.domain_id}`, { domain_name: domainName });
      }

      setDomainModal({ open: false, mode: 'add', data: null });
      setDomainName('');
      fetchDomains();
    } catch (err: any) {
      alert("Error: " + ((err.response?.data?.detail || err.response?.data?.message) || err.message));
    }
  };

  const handleDeleteDomain = async (id: string | number) => {
    if (!window.confirm("Are you sure you want to delete this domain and all its questions?")) return;
    try {
      await api.delete(`/api/eccd-config/domains/${id}`);
      fetchDomains();
    } catch (err: any) {
      alert("Error: " + ((err.response?.data?.detail || err.response?.data?.message) || err.message));
    }
  };

  const handleSaveQuestion = async () => {
    if (!activeDomain) return;
    try {
      const payload = {
        domain_id: activeDomain.domain_id,
        question_text: questionText,
        sequence_order: sequenceOrder
      };

      if (questionModal.mode === 'add') {
        await api.post('/api/eccd-config/questions', payload);
      } else if (questionModal.data) {
        await api.put(`/api/eccd-config/questions/${questionModal.data.question_id}`, payload);
      }

      setQuestionModal({ open: false, mode: 'add', data: null });
      setQuestionText('');
      setSequenceOrder('');
      fetchDomains();
    } catch (err: any) {
      alert("Error: " + ((err.response?.data?.detail || err.response?.data?.message) || err.message));
    }
  };

  const handleDeleteQuestion = async (id: string | number) => {
    if (!window.confirm("Are you sure you want to delete this question?")) return;
    try {
      await api.delete(`/api/eccd-config/questions/${id}`);
      fetchDomains();
    } catch (err: any) {
      alert("Error: " + ((err.response?.data?.detail || err.response?.data?.message) || err.message));
    }
  };

  const handleToggleHomeBased = async (id: string | number, currentStatus: boolean) => {
    try {
      await api.put(`/api/eccd-config/questions/${id}/home-based`, { is_home_based: !currentStatus });
      fetchDomains();
    } catch (err: any) {
      alert("Error: " + ((err.response?.data?.detail || err.response?.data?.message) || err.message));
    }
  };

  return (
    <Box sx={{ p: 3, minHeight: '100vh', pb: 5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: '800', color: '#1e1e2f', mb: 0.5 }}>
            ECCD Questions Management
          </Typography>
          <Typography variant="body1" sx={{ color: 'textSecondary' }}>
            Manage ECCD Domains and their respective assessment questions.
          </Typography>
        </Box>
        {!activeDomain && (
          <Button 
            variant="contained" 
            color="primary" 
            startIcon={<AddIcon />} 
            onClick={() => { setDomainName(''); setDomainModal({ open: true, mode: 'add', data: null }); }}
            sx={{ fontWeight: 'bold', textTransform: 'none', borderRadius: 24 }}
          >
            Add Domain
          </Button>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 5 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && !activeDomain && domains.length > 0 && (
        <Grid container spacing={4}>
          {domains.map(domain => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={domain.domain_id}>
              <Paper 
                sx={{ 
                  width: '100%',
                  height: 300,
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
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1e1e2f', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'normal', overflowWrap: 'break-word', height: 65, }}>
                    {domain.domain_name}
                  </Typography>
                  <Box>
                    <IconButton 
                      size="small" 
                      color="primary" 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setDomainName(domain.domain_name);
                        setDomainModal({ open: true, mode: 'edit', data: domain });
                      }}
                    >
                      <EditIcon fontSize="small"/>
                    </IconButton>
                    <IconButton 
                      size="small" 
                      color="error" 
                      onClick={(e) => { e.stopPropagation(); handleDeleteDomain(domain.domain_id); }}
                    >
                      <DeleteIcon fontSize="small"/>
                    </IconButton>
                  </Box>
                </Box>
                
                <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="body1" sx={{ fontWeight: '500', color: 'textSecondary' }}>
                    {domain.questions?.length || 0} Questions Available
                  </Typography>
                </Box>

                <Button 
                  fullWidth 
                  variant="contained" 
                  onClick={(e) => { e.stopPropagation(); handleDomainClick(domain); }} 
                  sx={{ 
                    mt: 'auto',
                    borderRadius: 24, 
                    py: 1, 
                    textTransform: 'none', 
                    fontWeight: 'bold', 
                    boxShadow: 'none' 
                  }}
                >
                  Manage Questions
                </Button>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}

      {!loading && activeDomain && (
        <Box>
          <Button 
            startIcon={<ArrowBackIcon />} 
            onClick={() => setActiveDomain(null)} 
            sx={{ mb: 3, fontWeight: 'bold', color: 'text.secondary', fontSize: '1.1rem', textTransform: 'none', borderRadius: 24 }}
          >
            Back to Domains
          </Button>

          <Paper sx={{ mb: 4, overflow: 'hidden', borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
            <Box sx={{ p: 3, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, bgcolor: '#fbfbfb' }}>
              <Typography variant="h5" sx={{ fontWeight: '800', color: '#1e1e2f' }}>
                {activeDomain.domain_name} Questions
              </Typography>
              <Button 
                variant="contained" 
                color="primary" 
                startIcon={<AddIcon />} 
                onClick={() => { setQuestionText(''); setSequenceOrder(''); setQuestionModal({ open: true, mode: 'add', data: null }); }}
                sx={{ fontWeight: 'bold', textTransform: 'none', borderRadius: 24 }}
              >
                Add Question
              </Button>
            </Box>
            
            <TableContainer>
              <Table sx={{ minWidth: 700 }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#fbfbfb' }}>
                    <TableCell sx={{ fontWeight: 'bold', color: 'text.secondary', width: '10%', py: 2 }}>ORDER</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', color: 'text.secondary', width: '70%', py: 2 }}>QUESTION / INDICATOR</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold', color: 'text.secondary', width: '20%', py: 2 }}>ACTIONS</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activeDomain.questions?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ py: 4 }}>
                        <Typography sx={{ color: 'textSecondary' }}>No questions found. Please add a question.</Typography>
                      </TableCell>
                    </TableRow>
                  ) : activeDomain.questions?.map((q, index) => (
                    <TableRow key={q.question_id} sx={{ '&:last-child td, &:last-child th': { borderBottom: 0 }, '&:hover': { bgcolor: '#F8FAFC' } }}>
                      <TableCell sx={{ fontWeight: 'bold', color: '#64748B' }}>
                        {q.sequence_order || index + 1}
                      </TableCell>
                      <TableCell sx={{ fontSize: '1.05rem', color: '#334155', fontWeight: '500', py: 3 }}>
                        {q.question_text}
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                          <Tooltip title={q.is_home_based ? "Remove from Home-Based" : "Set as Home-Based"}>
                            <IconButton 
                              color={q.is_home_based ? "success" : "default"}
                              onClick={() => handleToggleHomeBased(q.question_id, q.is_home_based)}
                            >
                              {q.is_home_based ? <HomeIcon /> : <HomeOutlinedIcon />}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Edit Question">
                            <IconButton 
                              color="primary" 
                              onClick={() => {
                                setQuestionText(q.question_text);
                                setSequenceOrder(String(q.sequence_order));
                                setQuestionModal({ open: true, mode: 'edit', data: q });
                              }}
                            >
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete Question">
                            <IconButton color="error" onClick={() => handleDeleteQuestion(q.question_id)}>
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Box>
      )}

      <Dialog open={domainModal.open} onClose={() => setDomainModal({ ...domainModal, open: false })} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { borderRadius: 4 } } }}>
        <DialogTitle>{domainModal.mode === 'add' ? 'Add Domain' : 'Edit Domain'}</DialogTitle>
        <DialogContent dividers>
          <TextField
            autoFocus
            margin="dense"
            label="Domain Name"
            type="text"
            fullWidth
            variant="outlined"
            value={domainName}
            onChange={(e) => setDomainName(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 4 } }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDomainModal({ ...domainModal, open: false })} sx={{ borderRadius: 24 }}>Cancel</Button>
          <Button onClick={handleSaveDomain} variant="contained" sx={{ borderRadius: 24 }}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={questionModal.open} onClose={() => setQuestionModal({ ...questionModal, open: false })} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { borderRadius: 4 } } }}>
        <DialogTitle>{questionModal.mode === 'add' ? 'Add Question' : 'Edit Question'}</DialogTitle>
        <DialogContent dividers>
          <TextField
            margin="dense"
            label="Sequence Order (e.g. 1)"
            type="number"
            fullWidth
            variant="outlined"
            value={sequenceOrder}
            onChange={(e) => setSequenceOrder(e.target.value)}
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 4 } }}
          />
          <TextField
            autoFocus
            margin="dense"
            label="Question Text"
            type="text"
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 4 } }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setQuestionModal({ ...questionModal, open: false })} sx={{ borderRadius: 24 }}>Cancel</Button>
          <Button onClick={handleSaveQuestion} variant="contained" sx={{ borderRadius: 24 }}>Save</Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
};

export default EccdQuestionsManagement;

