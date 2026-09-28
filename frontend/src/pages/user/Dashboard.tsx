import React, { useState, useEffect } from 'react';
import type { SelectChangeEvent } from '@mui/material';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Alert,
  CircularProgress,
  LinearProgress,
  Avatar,
  Select,
  MenuItem,
  Stack,
  Grid,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import HomeWorkIcon from '@mui/icons-material/HomeWork';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import TimelineIcon from '@mui/icons-material/Timeline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SyncIcon from '@mui/icons-material/Sync';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

interface LinkedChild {
  lrn_number: string;
  first_name?: string;
  last_name?: string;
  section_name?: string;
  teacher_fname?: string;
  teacher_lname?: string;
  allow_parent_view_student_info?: boolean | number | string;
  allow_parent_view_eccd_pre?: boolean | number | string;
  allow_parent_view_eccd_mid?: boolean | number | string;
  allow_parent_view_eccd_post?: boolean | number | string;
  allow_parent_edit_student_info?: boolean | number | string;
  allow_parent_edit_home_based_eccd?: boolean | number | string;
  allow_parent_view?: boolean;
  allow_parent_edit?: boolean;
  allow_parent_home_based_edit?: boolean;
}

interface DomainProgress {
  domain_id: number | string;
  domain_name: string;
  pre_progress?: number;
  mid_progress?: number;
  post_progress?: number;
}

interface DashboardStats {
  currentPhase: string;
  latestPhase: 'POST' | 'MID' | 'PRE' | null;
  excelsIn: string;
  needsSupportIn: string;
  assessmentMastered: boolean;
  totalKaya: number;
  totalDiKaya: number;
}

interface RecentMessage {
  message_id: number | string;
  senderName: string;
  sender_role: string;
  message_body: string;
  sent_at: string;
}

const Dashboard: React.FC = () => {
  const userString = localStorage.getItem('user');
  const user = userString ? JSON.parse(userString) : {};
  const navigate = useNavigate();

  const [loading, setLoading] = useState<boolean>(true);
  const [linkedChildren, setLinkedChildren] = useState<LinkedChild[]>([]);
  const [activeChildIndex, setActiveChildIndex] = useState<number>(0);

  const [lrnModalOpen, setLrnModalOpen] = useState<boolean>(false);
  const [lrnNumber, setLrnNumber] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLinking, setIsLinking] = useState<boolean>(false);

  const [domains, setDomains] = useState<DomainProgress[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [recentMessages, setRecentMessages] = useState<RecentMessage[]>([]);

  const fetchMyChild = async () => {
    try {
      let data: LinkedChild[] = [];
      try {
        const response = await api.get('/api/parents/children');
        data = response.data;
      } catch {
        const fallback = await api.get('/api/students/linked');
        data = fallback.data;
      }

      if (data && Array.isArray(data)) {
        setLinkedChildren(data);
        setLrnModalOpen(false);

        if (data.length > 0) {
          const lrn = data[0].lrn_number;
          fetchDomainsProgress(lrn);
          fetchDashboardStats(lrn);
          fetchRecentMessages();
        } else {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('Failed to fetch child data', err);
      setLrnModalOpen(true);
      setLoading(false);
    }
  };

  const fetchDashboardStats = async (lrn: string) => {
    try {
      const res = await api.get(`/api/eccd/parent/dashboard-stats/${lrn}`);
      if (res.data) setDashboardStats(res.data);
    } catch (err) {
      console.error('Failed to fetch dashboard stats', err);
    }
  };

  const fetchDomainsProgress = async (lrn: string) => {
    try {
      const res = await api.get(`/api/eccd/parent/domains-progress/${lrn}`);
      if (res.data) setDomains(res.data);
    } catch (err) {
      console.error('Failed to fetch domain progress', err);
    }
  };

  const fetchRecentMessages = async () => {
    try {
      const contactRes = await api.get('/api/messages/contacts');
      const contactData = contactRes.data;

      if (contactData.contacts && contactData.contacts.length > 0) {
        const teacherId = contactData.contacts[0].id;
        const teacherName = contactData.contacts[0].name;
        const parentId = contactData.myId;

        const historyRes = await api.get(
          `/api/messages/history?teacher_id=${teacherId}&parent_id=${parentId}`
        );
        if (historyRes.data) {
          interface RawMsg {
            message_id?: number | string;
            body?: string;
            message_body?: string;
            sender_role: string;
            created_at?: string;
            sent_at?: string;
          }
          const rawMessages: RawMsg[] = historyRes.data;
          const sorted = rawMessages.sort((a, b) => {
            const timeA = new Date(a.sent_at || a.created_at || '').getTime();
            const timeB = new Date(b.sent_at || b.created_at || '').getTime();
            return timeB - timeA;
          });

          const top2: RecentMessage[] = sorted.slice(0, 2).map((m) => ({
            message_id: m.message_id || Date.now(),
            senderName: m.sender_role === 'teacher' ? teacherName : 'You',
            sender_role: m.sender_role,
            message_body: m.message_body || m.body || '',
            sent_at: m.sent_at || m.created_at || '',
          }));
          setRecentMessages(top2);
        }
      }
    } catch (err) {
      console.error('Failed to fetch messages', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyChild();
  }, []);

  const handleLinkLrn = async () => {
    setError('');
    if (!lrnNumber.trim()) {
      setError("Please enter your child's LRN.");
      return;
    }

    setIsLinking(true);
    try {
      try {
        await api.post('/api/parents/children/link', { lrn_number: lrnNumber.trim() });
      } catch {
        await api.post('/api/students/link', { lrn_number: lrnNumber.trim() });
      }
      setLrnNumber('');
      fetchMyChild();
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { detail?: string; message?: string } } })?.response
          ?.data?.detail ||
        (err as { response?: { data?: { detail?: string; message?: string } } })?.response
          ?.data?.message ||
        'Failed to link LRN. Please verify the 12-digit number.';
      setError(errorMsg);
    } finally {
      setIsLinking(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  const activeChild = linkedChildren.length > 0 ? linkedChildren[activeChildIndex] : null;
  const isHomeAssessmentOpen =
    activeChild &&
    (activeChild.allow_parent_edit_home_based_eccd === true ||
      String(activeChild.allow_parent_edit_home_based_eccd) === '1' ||
      activeChild.allow_parent_home_based_edit === true ||
      String(activeChild.allow_parent_home_based_edit) === '1');

  // Fallback domain computations
  let lowestDomain = 'N/A';
  let highestDomain = 'N/A';
  let fallbackPhase = 'Not Started';

  if (activeChild && domains.length > 0) {
    let minScore = 101;
    let maxScore = -1;
    let hasPost = false;
    let hasMid = false;
    let hasPre = false;

    domains.forEach((d) => {
      const pre = d.pre_progress || 0;
      const mid = d.mid_progress || 0;
      const post = d.post_progress || 0;

      if (post > 0) hasPost = true;
      if (mid > 0) hasMid = true;
      if (pre > 0) hasPre = true;

      const maxP = Math.max(pre, mid, post);

      if (maxP < minScore) {
        minScore = maxP;
        lowestDomain = d.domain_name;
      }
      if (maxP > maxScore) {
        maxScore = maxP;
        highestDomain = d.domain_name;
      }
    });

    if (hasPost) fallbackPhase = 'Post-Test';
    else if (hasMid) fallbackPhase = 'Mid-Test';
    else if (hasPre) fallbackPhase = 'Pre-Test';

    if (maxScore === 0) {
      lowestDomain = 'No Data';
      highestDomain = 'No Data';
    }
  }

  const displayCurrentPhase = dashboardStats?.currentPhase || fallbackPhase;
  const displayExcelsIn = dashboardStats?.excelsIn || highestDomain;
  const displayNeedsSupportIn = dashboardStats?.needsSupportIn || lowestDomain;

  const handleChildChange = (event: SelectChangeEvent<number>) => {
    const newIndex = Number(event.target.value);
    setActiveChildIndex(newIndex);
    if (linkedChildren[newIndex]) {
      const lrn = linkedChildren[newIndex].lrn_number;
      fetchDomainsProgress(lrn);
      fetchDashboardStats(lrn);
      fetchRecentMessages();
    }
  };

  return (
    <Box sx={{ pb: 6, p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#1e1e2f', mb: 0.5 }}>
            Welcome, {user.username || 'Parent'}!
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            Monitor your child's developmental progress and school records.
          </Typography>
        </Box>
      </Box>

      {/* Child Quick Info Card */}
      <Card
        sx={{
          background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
          color: 'white',
          borderRadius: 3,
          mb: 4,
          boxShadow: '0 8px 24px rgba(59, 130, 246, 0.18)',
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, md: 3.5 }, '&:last-child': { pb: { xs: 2.5, md: 3.5 } } }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 2.5,
            }}
          >
            <Box sx={{ display: 'flex', gap: 2.5, alignItems: 'center', flexWrap: 'wrap' }}>
              <Avatar
                sx={{
                  width: 72,
                  height: 72,
                  bgcolor: 'rgba(255, 255, 255, 0.25)',
                  fontSize: '2rem',
                  fontWeight: 'bold',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  border: '2px solid rgba(255, 255, 255, 0.4)',
                }}
              >
                {activeChild && activeChild.first_name ? activeChild.first_name.charAt(0) : '?'}
              </Avatar>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                  {activeChild
                    ? `${activeChild.first_name || ''} ${activeChild.last_name || ''}`
                    : 'Awaiting Connection...'}
                </Typography>
                {activeChild && (
                  <Stack direction="row" spacing={2} sx={{ opacity: 0.95, flexWrap: 'wrap', gap: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      📍 Section: {activeChild.section_name || 'Unassigned'}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      👤 Adviser:{' '}
                      {activeChild.teacher_fname
                        ? `Tr. ${activeChild.teacher_fname} ${activeChild.teacher_lname || ''}`
                        : 'Not Assigned'}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      🆔 LRN: {activeChild.lrn_number}
                    </Typography>
                  </Stack>
                )}
              </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              {linkedChildren.length > 1 ? (
                <Box sx={{ mr: { sm: 1 } }}>
                  <Typography
                    variant="caption"
                    sx={{ display: 'block', mb: 0.5, opacity: 0.95, fontWeight: 'bold' }}
                  >
                    Select Child
                  </Typography>
                  <Select
                    value={activeChildIndex}
                    onChange={handleChildChange}
                    size="small"
                    sx={{
                      bgcolor: 'rgba(255, 255, 255, 0.2)',
                      color: 'white',
                      fontWeight: 'bold',
                      borderRadius: 2,
                      minWidth: 170,
                      '& .MuiSelect-icon': { color: 'white' },
                      '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                    }}
                  >
                    {linkedChildren.map((child, index) => (
                      <MenuItem key={child.lrn_number} value={index}>
                        {child.first_name} {child.last_name}
                      </MenuItem>
                    ))}
                  </Select>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', gap: 2, mr: { sm: 1 } }}>
                  <Box
                    sx={{
                      bgcolor: 'rgba(255, 255, 255, 0.18)',
                      px: 2,
                      py: 1,
                      borderRadius: 2,
                      textAlign: 'center',
                    }}
                  >
                    <Typography variant="caption" sx={{ opacity: 0.9, fontWeight: 'bold', display: 'block' }}>
                      Linked Children
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                      {linkedChildren.length}
                    </Typography>
                  </Box>
                </Box>
              )}

              <Button
                variant="contained"
                startIcon={<SyncIcon />}
                onClick={() => setLrnModalOpen(true)}
                sx={{
                  bgcolor: 'white',
                  color: 'primary.main',
                  fontWeight: 'bold',
                  '&:hover': { bgcolor: '#f8fafc' },
                  borderRadius: 2,
                  textTransform: 'none',
                  px: 2.5,
                  py: 1,
                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.1)',
                }}
              >
                Sync LRN
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {activeChild && (
        <Box sx={{ mb: 4 }}>
          {/* 4-Card Summary Grid */}
          <Grid container spacing={3} sx={{ mb: 4 }}>
            {/* Card 1: Assessment Task */}
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card
                onClick={() => (isHomeAssessmentOpen ? navigate('/parent/eccdassessment') : null)}
                sx={{
                  height: 110,
                  width: '100%',
                  borderRadius: 3,
                  cursor: isHomeAssessmentOpen ? 'pointer' : 'default',
                  bgcolor: isHomeAssessmentOpen ? '#fffbeb' : '#fef2f2',
                  border: `1px solid ${isHomeAssessmentOpen ? '#fde68a' : '#fecdd3'}`,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    bgcolor: isHomeAssessmentOpen ? '#fef3c7' : '#fef2f2',
                    transform: isHomeAssessmentOpen ? 'translateY(-2px)' : 'none',
                  },
                }}
              >
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, '&:last-child': { pb: 2 } }}>
                  <Box
                    sx={{
                      p: 1.2,
                      borderRadius: 2,
                      bgcolor: isHomeAssessmentOpen ? '#fef3c7' : '#fee2e2',
                      color: isHomeAssessmentOpen ? '#d97706' : '#ef4444',
                      display: 'flex',
                    }}
                  >
                    {isHomeAssessmentOpen ? <HomeWorkIcon /> : <LockIcon />}
                  </Box>
                  <Box sx={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: isHomeAssessmentOpen ? '#92400e' : 'error.dark' }}>
                      Assessment Task
                    </Typography>
                    <Typography
                      variant="h6"
                      noWrap
                      sx={{
                        fontWeight: 'bold',
                        mt: 0.5,
                        fontSize: '0.95rem',
                        color: isHomeAssessmentOpen ? '#b45309' : 'error.main',
                      }}
                    >
                      {isHomeAssessmentOpen ? 'Open for Edit' : 'Locked'}
                    </Typography>
                    <Typography
                      variant="caption"
                      noWrap
                      sx={{ display: 'block', color: isHomeAssessmentOpen ? '#b45309' : 'error.main' }}
                    >
                      {isHomeAssessmentOpen ? 'Click to evaluate' : 'Class adviser review'}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Card 2: Needs Support In OR Assessment Complete (Mastered) */}
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              {dashboardStats?.assessmentMastered ? (
                <Card
                  sx={{
                    height: 110,
                    width: '100%',
                    borderRadius: 3,
                    boxShadow: '0 4px 12px rgba(22, 163, 74, 0.08)',
                    border: '1px solid #bbf7d0',
                    bgcolor: '#f0fdf4',
                  }}
                >
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: '#dcfce7', color: '#16a34a', display: 'flex' }}>
                      <CheckCircleIcon />
                    </Box>
                    <Box sx={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#166534' }}>
                        Assessment Complete
                      </Typography>
                      <Typography
                        variant="h6"
                        noWrap
                        sx={{ fontWeight: 'bold', mt: 0.5, fontSize: '0.95rem', color: '#16a34a' }}
                      >
                        All Skills Mastered
                      </Typography>
                      <Typography variant="caption" noWrap sx={{ display: 'block', color: '#15803d', fontWeight: 500 }}>
                        Ready for Grade 1
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              ) : (
                <Card
                  sx={{
                    height: 110,
                    width: '100%',
                    borderRadius: 3,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
                    border: '1px solid #f1f5f9',
                  }}
                >
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: '#ffedd5', color: '#ea580c', display: 'flex' }}>
                      <WarningAmberIcon />
                    </Box>
                    <Box sx={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                        Needs Support In
                      </Typography>
                      <Typography variant="h6" noWrap sx={{ fontWeight: 'bold', mt: 0.5, fontSize: '0.95rem' }}>
                        {displayNeedsSupportIn}
                      </Typography>
                      <Typography variant="caption" noWrap sx={{ display: 'block', color: 'text.secondary' }}>
                        Priority for improvement
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              )}
            </Grid>

            {/* Card 3: Excels In */}
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card
                sx={{
                  height: 110,
                  width: '100%',
                  borderRadius: 3,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
                  border: '1px solid #f1f5f9',
                }}
              >
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: '#dcfce7', color: '#16a34a', display: 'flex' }}>
                    <EmojiEventsIcon />
                  </Box>
                  <Box sx={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                      Excels In
                    </Typography>
                    <Typography variant="h6" noWrap sx={{ fontWeight: 'bold', mt: 0.5, fontSize: '0.95rem' }}>
                      {displayExcelsIn}
                    </Typography>
                    <Typography variant="caption" noWrap sx={{ display: 'block', color: 'text.secondary' }}>
                      Top performing domain
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Card 4: Current Phase */}
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card
                sx={{
                  height: 110,
                  width: '100%',
                  borderRadius: 3,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
                  border: '1px solid #f1f5f9',
                }}
              >
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: '#f3e8ff', color: '#9333ea', display: 'flex' }}>
                    <TimelineIcon />
                  </Box>
                  <Box sx={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                      Current Phase
                    </Typography>
                    <Typography variant="h6" noWrap sx={{ fontWeight: 'bold', mt: 0.5, fontSize: '0.95rem' }}>
                      {displayCurrentPhase}
                    </Typography>
                    <Typography variant="caption" noWrap sx={{ display: 'block', color: 'text.secondary' }}>
                      Latest recorded phase
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Split Layout: Domain Progress Overview & Recent Messages */}
          <Grid container spacing={3}>
            {/* Left Column: Domain Progress */}
            <Grid size={{ xs: 12, md: 7 }}>
              <Card sx={{ height: '100%', borderRadius: 3, boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)', border: '1px solid #f1f5f9' }}>
                <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1e1e2f' }}>
                      Domain Progress Overview
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => navigate('/parent/eccdassessment')}
                      sx={{ textTransform: 'none', fontWeight: 'bold' }}
                    >
                      View Report Card
                    </Button>
                  </Box>

                  {domains.length === 0 ? (
                    <Box sx={{ py: 5, textAlign: 'center' }}>
                      <Typography sx={{ color: 'text.secondary' }}>No ECCD assessment records found yet.</Typography>
                    </Box>
                  ) : (
                    domains.map((domain, index) => {
                      const maxProgress = Math.max(
                        domain.pre_progress || 0,
                        domain.mid_progress || 0,
                        domain.post_progress || 0
                      );
                      return (
                        <Box key={domain.domain_id} sx={{ mb: index !== domains.length - 1 ? 2.5 : 0 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.8 }}>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 'bold',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: '85%',
                              }}
                            >
                              {domain.domain_name}
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                              {maxProgress}%
                            </Typography>
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={maxProgress}
                            sx={{
                              height: 8,
                              borderRadius: 4,
                              bgcolor: '#f1f5f9',
                              '& .MuiLinearProgress-bar': { borderRadius: 4, bgcolor: '#3b82f6' },
                            }}
                          />
                        </Box>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Right Column: Recent Messages */}
            <Grid size={{ xs: 12, md: 5 }}>
              <Card sx={{ height: '100%', borderRadius: 3, boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)', border: '1px solid #f1f5f9' }}>
                <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1e1e2f' }}>
                      Recent Messages
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => navigate('/parent/messages')}
                      sx={{ textTransform: 'none', fontWeight: 'bold', minHeight: '40px' }}
                    >
                      View All
                    </Button>
                  </Box>

                  {recentMessages.length === 0 ? (
                    <Box sx={{ py: 5, textAlign: 'center', bgcolor: '#f8fafc', borderRadius: 2 }}>
                      <Typography sx={{ fontWeight: 500, color: 'text.secondary' }}>No recent messages.</Typography>
                    </Box>
                  ) : (
                    recentMessages.map((msg, idx) => (
                      <Box
                        key={msg.message_id || idx}
                        sx={{
                          display: 'flex',
                          gap: 2,
                          mb: idx === recentMessages.length - 1 ? 0 : 2.5,
                          p: 2,
                          bgcolor: '#f8fafc',
                          borderRadius: 2,
                        }}
                      >
                        <Avatar
                          sx={{
                            bgcolor: msg.sender_role === 'teacher' ? 'secondary.main' : 'primary.main',
                            width: 44,
                            height: 44,
                            fontWeight: 'bold',
                          }}
                        >
                          {msg.senderName.charAt(0).toUpperCase()}
                        </Avatar>
                        <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                            <Typography variant="subtitle2" noWrap sx={{ maxWidth: '65%', fontWeight: 'bold' }}>
                              {msg.senderName}
                            </Typography>
                            <Typography variant="caption" noWrap sx={{ fontWeight: 500, color: 'text.secondary' }}>
                              {msg.sent_at
                                ? new Date(msg.sent_at).toLocaleDateString([], { month: 'short', day: 'numeric' })
                                : ''}
                            </Typography>
                          </Box>
                          <Typography
                            variant="body2"
                            sx={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              color: 'text.secondary',
                            }}
                          >
                            {msg.message_body}
                          </Typography>
                        </Box>
                      </Box>
                    ))
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* Sync LRN Dialog */}
      <Dialog
        open={lrnModalOpen}
        onClose={() => setLrnModalOpen(false)}
        slotProps={{ paper: { sx: { borderRadius: 3, p: 1, maxWidth: 420 } } }}
      >
        <DialogTitle sx={{ fontWeight: 'bold', color: '#111827', textAlign: 'center' }}>
          Connect Your Child
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary', textAlign: 'center' }}>
            To view your child's progress records and communicate with their adviser, please securely link your account
            by entering their Learner Reference Number (LRN).
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          <Typography variant="caption" sx={{ fontWeight: 'bold', mb: 0.5, display: 'block', color: 'text.secondary' }}>
            STUDENT LRN
          </Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="Enter 12-digit LRN"
            value={lrnNumber}
            onChange={(e) => setLrnNumber(e.target.value)}
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#F9FAFB' } }}
          />
        </DialogContent>

        <DialogActions sx={{ p: 3, pt: 1, display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => setLrnModalOpen(false)}
            disabled={isLinking}
            sx={{ flex: 1, py: 1.2, fontWeight: 'bold', borderRadius: 2, minHeight: '44px' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleLinkLrn}
            disabled={isLinking}
            sx={{ flex: 1, py: 1.2, fontWeight: 'bold', borderRadius: 2, minHeight: '44px', boxShadow: 'none' }}
          >
            {isLinking ? 'Verifying...' : 'Connect'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Dashboard;
