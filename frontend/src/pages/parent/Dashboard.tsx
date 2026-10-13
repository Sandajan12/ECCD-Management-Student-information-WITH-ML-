import React, { useState, useEffect, useRef } from 'react';
import { isAxiosError } from 'axios';
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
import api, { errorMessage, isNetworkError } from '../../services/api';
import { useChildren } from '../../hooks/useChildren';
import { useAuth } from '../../context/AuthContext';
import { confirmDraft, readDraft, storeDraft, type Draft } from '../../utils/drafts';
import type { ChatMessage, Contact, DomainProgress, ParentStats } from '../../types';

interface RecentMessage {
  message_id: number;
  senderName: string;
  sender_role: string;
  message_body: string;
  sent_at: string;
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const roster = useChildren();
  const linkedChildren = roster.children;
  const activeChild = roster.child;
  const activeChildIndex = Math.max(0, linkedChildren.findIndex(child => child.student_id === roster.selected));
  const loading = roster.loading;
  const owner = user?.id || 0;
  const linkKey = `ames_draft_${owner}_parent_link`;
  const [lrnModalOpen, setLrnModalOpen] = useState<boolean>(false);
  const [lrnNumber, setLrnValue] = useState<string>(() => readDraft<string>(linkKey)?.values ?? '');
  const [error, setError] = useState<string>('');
  const [isLinking, setIsLinking] = useState<boolean>(false);
  const linkingLock = useRef(false);
  const linkRevision = useRef('');
  const [domains, setDomains] = useState<DomainProgress[]>([]);
  const [dashboardStats, setDashboardStats] = useState<ParentStats | null>(null);
  const [recentMessages, setRecentMessages] = useState<RecentMessage[]>([]);
  const [hydratedChild, setHydratedChild] = useState<number>(0);
  const requestVersion = useRef(0);
  const setLrnNumber = (value: string) => {
    setLrnValue(value);
    linkRevision.current = crypto.randomUUID();
    storeDraft(linkKey, { owner_id: owner, values: value, revision: linkRevision.current, is_pending_sync: false });
  };
  useEffect(() => {
    setLrnValue(readDraft<string>(linkKey)?.values ?? '');
    const synced = (event: Event) => {
      if ((event as CustomEvent<string>).detail === linkKey && !readDraft<string>(linkKey)) {
        setLrnValue(''); setLrnModalOpen(false); setError('');
      }
    };
    window.addEventListener('ames-record-synced', synced);
    return () => window.removeEventListener('ames-record-synced', synced);
  }, [linkKey]);
  useEffect(() => {
    if (!roster.loading && !roster.children.length) { setLrnModalOpen(true); setError(roster.error); }
  }, [roster.loading, roster.children.length, roster.error]);
  useEffect(() => {
    const version = ++requestVersion.current;
    const id = activeChild?.student_id;
    setDomains([]); setDashboardStats(null); setRecentMessages([]); setHydratedChild(0);
    if (!id) return;
    const load = async () => {
      const results = await Promise.allSettled([
        api.get<ParentStats>(`/api/eccd/parent/dashboard-stats/${id}`),
        api.get<DomainProgress[]>(`/api/eccd/parent/domains-progress/${id}`),
        api.get<{ myId: number | null; contacts: Contact[] }>('/api/messages/contacts'),
      ]);
      if (version !== requestVersion.current) return;
      const [stats, progress, contacts] = results;
      if (stats.status === 'fulfilled') setDashboardStats(stats.value.data);
      if (progress.status === 'fulfilled') setDomains(progress.value.data);
      setHydratedChild(id);
      if (contacts.status === 'fulfilled' && contacts.value.data.myId) {
        const parentId = contacts.value.data.myId;
        const adviser = [activeChild.teacher_fname, activeChild.teacher_lname].filter(Boolean).join(' ').trim().toLowerCase();
        const all = contacts.value.data.contacts;
        const matching = all.filter(contact => contact.name.replace(/^Teacher\s+/i, '').trim().toLowerCase() === adviser);
        const relevant = matching.length ? matching : all;
        const histories = await Promise.allSettled(relevant.map(async contact => {
          const response = await api.get<ChatMessage[]>('/api/messages/history', { params: { teacher_id: contact.id, parent_id: parentId } });
          return response.data.map(message => ({ message_id: message.message_id, senderName: message.sender_role === 'teacher' ? contact.name : 'You', sender_role: message.sender_role, message_body: message.body, sent_at: message.created_at }));
        }));
        if (version !== requestVersion.current) return;
        setRecentMessages(histories.flatMap(result => result.status === 'fulfilled' ? result.value : []).sort((a,b) => Date.parse(b.sent_at) - Date.parse(a.sent_at) || b.message_id-a.message_id).slice(0,2));
      }
    };
    void load();
    return () => { ++requestVersion.current; };
  }, [activeChild]);
  const handleLinkLrn = async () => {
    if (linkingLock.current) return;
    const lrn = lrnNumber.trim();
    if (!/^\d{12}$/.test(lrn)) { setError('Please enter a valid 12-digit LRN.'); return; }
    linkingLock.current = true; setIsLinking(true); setError('');
    const draft: Draft<string> = { owner_id: owner, values: lrnNumber, revision: crypto.randomUUID(), is_pending_sync: true, request: { path: '/api/parents/children/link', method: 'post', data: { lrn_number: lrn } } };
    linkRevision.current = draft.revision;
    storeDraft(linkKey, draft);
    try {
      if (!navigator.onLine) { setError('Saved on this device. Linking will retry when your connection returns.'); return; }
      const response = await api.post(draft.request!.path, draft.request!.data);
      if (response.status !== 200 && response.status !== 201) throw new Error('The server did not confirm this link.');
      confirmDraft(linkKey, draft.revision);
      if (!readDraft<string>(linkKey) && linkRevision.current === draft.revision) { setLrnValue(''); setLrnModalOpen(false); }
      await roster.refresh();
    } catch (err) {
      if (isNetworkError(err) || (isAxiosError(err) && (err.response?.status || 0) >= 500)) setError('Saved on this device. Linking is queued for synchronization.');
      else {
        if (readDraft<string>(linkKey)?.revision === draft.revision) storeDraft(linkKey, { ...draft, is_pending_sync: false, error: errorMessage(err) });
        setError(errorMessage(err));
      }
    } finally { linkingLock.current = false; setIsLinking(false); }
  };
  const handleChildChange = (event: SelectChangeEvent<number>) => {
    const child = linkedChildren[Number(event.target.value)];
    if (child) roster.select(child.student_id);
  };
  const isHomeAssessmentOpen = activeChild?.allow_parent_edit_home_based_eccd === true;
  const visibleStats = hydratedChild === activeChild?.student_id ? dashboardStats : null;
  const displayCurrentPhase = visibleStats?.currentPhase || (activeChild ? 'Unavailable' : 'Not Started');
  const displayExcelsIn = visibleStats?.excelsIn || 'Pending Adviser Release';
  const displayNeedsSupportIn = visibleStats?.needsSupportIn || 'Pending Adviser Release';
  const currentProgress = (domain: DomainProgress): number | null => {
    if (!visibleStats?.is_published || !visibleStats.latestPhase) return null;
    const value = domain[visibleStats.latestPhase === 'POST' ? 'post_progress' : visibleStats.latestPhase === 'MID' ? 'mid_progress' : 'pre_progress'];
    return value === null ? null : Math.min(100, Math.max(0, value));
  };
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

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
            Welcome, {user?.username || 'Parent'}!
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
                    ? `${activeChild.first_name || ''} ${activeChild.last_name || ''}`.trim() || 'Child Information Locked'
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
                      🆔 LRN: {activeChild.masked_lrn}
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
                      <MenuItem key={child.student_id} value={index}>
                        {[child.first_name, child.last_name].filter(Boolean).join(' ') || child.masked_lrn}
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
              {visibleStats?.assessmentMastered ? (
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

                  {hydratedChild !== activeChild?.student_id || domains.length === 0 ? (
                    <Box sx={{ py: 5, textAlign: 'center' }}>
                      <Typography sx={{ color: 'text.secondary' }}>No ECCD assessment records found yet.</Typography>
                    </Box>
                  ) : (
                    domains.map((domain, index) => {
                      const maxProgress = currentProgress(domain);
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
                              {maxProgress === null ? 'Pending' : `${maxProgress}%`}
                            </Typography>
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={maxProgress ?? 0}
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

                  {hydratedChild !== activeChild?.student_id || recentMessages.length === 0 ? (
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
