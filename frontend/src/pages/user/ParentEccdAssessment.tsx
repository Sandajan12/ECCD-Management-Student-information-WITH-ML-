import React, { useState, useEffect } from 'react';
import type { SelectChangeEvent } from '@mui/material';
import {
  Box,
  Typography,
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Chip,
  Card,
  CardContent,
  Stack,
  Grid,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import AssignmentIcon from '@mui/icons-material/Assignment';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import api from '../../services/api';

interface LinkedChild {
  lrn_number: string;
  first_name?: string;
  last_name?: string;
  allow_parent_view_student_info?: boolean | number | string;
  allow_parent_view_eccd_pre?: boolean | number | string;
  allow_parent_view_eccd_mid?: boolean | number | string;
  allow_parent_view_eccd_post?: boolean | number | string;
  allow_parent_edit_student_info?: boolean | number | string;
  allow_parent_edit_home_based_eccd?: boolean | number | string;
  allow_parent_home_based_edit?: boolean | number | string;
}

interface DomainQuestion {
  question_id: number;
  question_text: string;
  sequence_order: number;
  answers?: {
    PRE?: string | null;
    MID?: string | null;
    POST?: string | null;
  };
}

interface DomainItem {
  domain_id: number | string;
  domain_name: string;
  questions: DomainQuestion[];
}

interface DomainScoreItem {
  domain_code: string;
  domain_name: string;
  raw_score?: number | null;
  scaled_score?: number | null;
}

interface PeriodSummary {
  testing_period: string;
  evaluation_date?: string | null;
  decimal_age?: number | null;
  domains: DomainScoreItem[];
  sum_of_scaled_scores?: number | null;
  standard_score?: number | null;
  interpretation?: string | null;
  is_published?: boolean;
}

interface EccdSummaryData {
  student_lrn: string;
  student_name: string;
  current_phase?: string | null;
  permissions?: {
    allow_parent_view_student_info?: boolean;
    allow_parent_view_eccd_pre?: boolean;
    allow_parent_view_eccd_mid?: boolean;
    allow_parent_view_eccd_post?: boolean;
    allow_parent_edit_student_info?: boolean;
    allow_parent_edit_home_based_eccd?: boolean;
  };
  periods: {
    PRE?: PeriodSummary | null;
    MID?: PeriodSummary | null;
    POST?: PeriodSummary | null;
  };
}

const DOMAIN_ORDER = [
  'Gross Motor',
  'Fine Motor',
  'Self-Help',
  'Receptive Language',
  'Expressive Language',
  'Cognitive',
  'Socio-Emotional',
];

const ParentEccdAssessment: React.FC = () => {
  const [childrenList, setChildrenList] = useState<LinkedChild[]>([]);
  const [selectedChildIndex, setSelectedChildIndex] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<number>(0);

  // Home-based checklist state
  const [checklistDomains, setChecklistDomains] = useState<DomainItem[]>([]);
  const [activeDomain, setActiveDomain] = useState<DomainItem | null>(null);
  const [evaluations, setEvaluations] = useState<Record<string, string>>({});
  const [evalAges, setEvalAges] = useState<Record<string, Record<string, number | null>>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [evalLoading, setEvalLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Official summary report card state
  const [summaryData, setSummaryData] = useState<EccdSummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState<boolean>(false);

  useEffect(() => {
    fetchChildData();
  }, []);

  const fetchChildData = async () => {
    try {
      let data: LinkedChild[] = [];
      try {
        const response = await api.get('/api/parents/children');
        data = response.data;
      } catch {
        const fallback = await api.get('/api/students/linked');
        data = fallback.data;
      }

      if (data && Array.isArray(data) && data.length > 0) {
        setChildrenList(data);
        const lrn = data[0].lrn_number;
        fetchSummary(lrn);
        fetchChecklistData(lrn);
      } else {
        setError('No child linked to your account yet.');
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch child records.');
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async (lrn: string) => {
    setSummaryLoading(true);
    try {
      const res = await api.get(`/api/parents/children/${lrn}/eccd-summary`);
      if (res.data) setSummaryData(res.data);
    } catch (err) {
      console.error('Failed to fetch ECCD summary', err);
    } finally {
      setSummaryLoading(false);
    }
  };

  const fetchChecklistData = async (lrn: string) => {
    setEvalLoading(true);
    try {
      const res = await api.get(`/api/eccd/parent/assessment/${lrn}`);
      const rawData = res.data;
      const domainList: DomainItem[] = rawData.domains || (Array.isArray(rawData) ? rawData : []);
      setChecklistDomains(domainList);
      setEvalAges(rawData.evalAges || {});

      const initialEvals: Record<string, string> = {};
      domainList.forEach((domain) => {
        domain.questions?.forEach((q) => {
          ['PRE', 'MID', 'POST'].forEach((period) => {
            const ans = q.answers ? q.answers[period as 'PRE' | 'MID' | 'POST'] : null;
            if (ans) {
              initialEvals[`${q.question_id}-${period}`] = ans;
            }
          });
        });
      });
      setEvaluations(initialEvals);
    } catch (err) {
      console.error(err);
    } finally {
      setEvalLoading(false);
    }
  };

  const handleChildSwitch = (event: SelectChangeEvent<number>) => {
    const newIndex = Number(event.target.value);
    setSelectedChildIndex(newIndex);
    setActiveDomain(null);
    if (childrenList[newIndex]) {
      const lrn = childrenList[newIndex].lrn_number;
      fetchSummary(lrn);
      fetchChecklistData(lrn);
    }
  };

  const activeChild = childrenList[selectedChildIndex];
  const canEditHomeBased =
    activeChild &&
    (activeChild.allow_parent_edit_home_based_eccd === true ||
      String(activeChild.allow_parent_edit_home_based_eccd) === '1' ||
      activeChild.allow_parent_home_based_edit === true ||
      String(activeChild.allow_parent_home_based_edit) === '1');

  const isPeriodReleased = (period: 'PRE' | 'MID' | 'POST'): boolean => {
    if (period === 'PRE') {
      if (summaryData?.permissions?.allow_parent_view_eccd_pre !== undefined) {
        if (!summaryData.permissions.allow_parent_view_eccd_pre) return false;
      } else if (activeChild?.allow_parent_view_eccd_pre !== undefined && activeChild.allow_parent_view_eccd_pre !== null) {
        const val = activeChild.allow_parent_view_eccd_pre;
        if (val === false || String(val) === '0' || String(val) === 'false') return false;
      }
    } else if (period === 'MID') {
      if (summaryData?.permissions?.allow_parent_view_eccd_mid !== undefined) {
        if (!summaryData.permissions.allow_parent_view_eccd_mid) return false;
      } else if (activeChild?.allow_parent_view_eccd_mid !== undefined && activeChild.allow_parent_view_eccd_mid !== null) {
        const val = activeChild.allow_parent_view_eccd_mid;
        if (val === false || String(val) === '0' || String(val) === 'false') return false;
      }
    } else if (period === 'POST') {
      if (summaryData?.permissions?.allow_parent_view_eccd_post !== undefined) {
        if (!summaryData.permissions.allow_parent_view_eccd_post) return false;
      } else if (activeChild?.allow_parent_view_eccd_post !== undefined && activeChild.allow_parent_view_eccd_post !== null) {
        const val = activeChild.allow_parent_view_eccd_post;
        if (val === false || String(val) === '0' || String(val) === 'false') return false;
      }
    }
    const pData = summaryData?.periods[period];
    if (pData && pData.is_published === false) {
      return false;
    }
    return true;
  };

  const handleAnswerChange = (questionId: number, period: string, answer: string) => {
    if (!canEditHomeBased) return;

    setEvaluations((prev) => {
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

      return newEvals;
    });
  };

  const getAnswer = (questionId: number, period: string): string | null => {
    return evaluations[`${questionId}-${period}`] || null;
  };

  const handleSaveChecklist = async () => {
    if (!activeChild || !canEditHomeBased) return;
    setSaving(true);
    setSaveSuccess(null);

    const evaluationsPayload = Object.entries(evaluations).map(([key, answer]) => {
      const [questionIdStr, period] = key.split('-');
      return {
        question_id: parseInt(questionIdStr, 10),
        testing_period: period,
        answer,
      };
    });

    try {
      await api.post('/api/eccd/parent/evaluate', {
        student_lrn: activeChild.lrn_number,
        evaluations: evaluationsPayload,
      });

      setSaveSuccess('Assessment evaluations saved successfully!');
      fetchSummary(activeChild.lrn_number);
      fetchChecklistData(activeChild.lrn_number);
    } catch (err: unknown) {
      console.error(err);
      alert('Error saving assessment. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (childrenList.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography sx={{ color: 'text.secondary' }}>{error || 'No child linked to your account yet.'}</Typography>
      </Box>
    );
  }

  const renderSummaryTab = () => {
    if (summaryLoading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 8 }}>
          <CircularProgress />
        </Box>
      );
    }

    if (!summaryData) {
      return (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <Typography sx={{ color: 'text.secondary' }}>No assessment scores recorded yet.</Typography>
        </Box>
      );
    }

    const periods = ['PRE', 'MID', 'POST'];

    return (
      <Box sx={{ mt: 3 }}>
        {/* Header interpretation card */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {periods.map((p) => {
            const periodKey = p as 'PRE' | 'MID' | 'POST';
            const isReleased = isPeriodReleased(periodKey);
            const pData = summaryData.periods[periodKey];
            const hasData = Boolean(isReleased && pData && pData.standard_score != null);

            if (!isReleased) {
              return (
                <Grid size={{ xs: 12, md: 4 }} key={p}>
                  <Card
                    sx={{
                      borderRadius: 3,
                      boxShadow: '0 4px 14px rgba(0, 0, 0, 0.04)',
                      border: '1px dashed #cbd5e1',
                      bgcolor: '#f8fafc',
                    }}
                  >
                    <CardContent sx={{ p: 2.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                          {p === 'PRE' ? 'Pre-Test' : p === 'MID' ? 'Mid-Test' : 'Post-Test'}
                        </Typography>
                        <Chip
                          icon={<LockOutlinedIcon sx={{ fontSize: '0.9rem !important' }} />}
                          label="Unreleased"
                          size="small"
                          color="default"
                          variant="outlined"
                          sx={{ fontWeight: 'bold', fontSize: '0.75rem', bgcolor: '#f1f5f9' }}
                        />
                      </Box>
                      <Box sx={{ py: 2, textAlign: 'center' }}>
                        <LockOutlinedIcon sx={{ fontSize: 36, color: '#94a3b8', mb: 1 }} />
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                          Results Pending Adviser Release
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', px: 1 }}>
                          The class adviser has not yet published the evaluation results for this testing window.
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            }

            return (
              <Grid size={{ xs: 12, md: 4 }} key={p}>
                <Card
                  sx={{
                    borderRadius: 3,
                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.04)',
                    border: '1px solid',
                    borderColor: hasData ? 'primary.light' : '#f1f5f9',
                    bgcolor: hasData ? '#f8fafc' : '#fafafa',
                  }}
                >
                  <CardContent sx={{ p: 2.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: '#1e1e2f' }}>
                        {p === 'PRE' ? 'Pre-Test' : p === 'MID' ? 'Mid-Test' : 'Post-Test'}
                      </Typography>
                      <Chip
                        label={hasData ? 'Evaluated' : 'Pending'}
                        size="small"
                        color={hasData ? 'success' : 'default'}
                        variant={hasData ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 'bold', fontSize: '0.75rem' }}
                      />
                    </Box>

                    {hasData && pData ? (
                      <Stack spacing={1}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            Assessment Date:
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            {pData.evaluation_date
                              ? new Date(pData.evaluation_date).toLocaleDateString([], {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : 'Recorded'}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            Decimal Age:
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            {pData.decimal_age != null ? pData.decimal_age : 'N/A'}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            Standard Score:
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                            {pData.standard_score}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            Interpretation:
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                            {pData.interpretation || 'Average'}
                          </Typography>
                        </Box>
                      </Stack>
                    ) : (
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic', mt: 1 }}>
                        Not yet evaluated for this testing period.
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>

        {/* Scaled Scores & Domain Breakdown Table */}
        <Paper sx={{ borderRadius: 3, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)', border: '1px solid #f1f5f9' }}>
          <Box sx={{ p: 2.5, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1e1e2f' }}>
              DepEd Official ECCD Summary Matrix
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Standardized domain scaled scores based on DepEd Early Childhood Care and Development scoring matrix.
            </Typography>
          </Box>

          {(() => {
            const isPreReleased = isPeriodReleased('PRE');
            const isMidReleased = isPeriodReleased('MID');
            const isPostReleased = isPeriodReleased('POST');

            return (
              <TableContainer sx={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
                <Table sx={{ minWidth: 650 }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f8fafc' }}>
                      <TableCell sx={{ fontWeight: 'bold', color: 'text.secondary', py: 2 }}>DEVELOPMENTAL DOMAIN</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 'bold', color: 'text.secondary', borderLeft: '1px solid #e2e8f0' }}>
                        PRE-TEST SCALED
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 'bold', color: 'text.secondary', borderLeft: '1px solid #e2e8f0' }}>
                        MID-TEST SCALED
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 'bold', color: 'text.secondary', borderLeft: '1px solid #e2e8f0' }}>
                        POST-TEST SCALED
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {DOMAIN_ORDER.map((domainName) => {
                      const preDomain = summaryData.periods.PRE?.domains.find((d) => d.domain_name === domainName);
                      const midDomain = summaryData.periods.MID?.domains.find((d) => d.domain_name === domainName);
                      const postDomain = summaryData.periods.POST?.domains.find((d) => d.domain_name === domainName);

                      return (
                        <TableRow key={domainName} sx={{ '&:hover': { bgcolor: '#f8fafc' } }}>
                          <TableCell sx={{ fontWeight: 600, color: '#334155', py: 2 }}>{domainName}</TableCell>
                          <TableCell align="center" sx={{ borderLeft: '1px solid #e2e8f0', fontWeight: 'bold' }}>
                            {isPreReleased && preDomain && preDomain.scaled_score != null ? (
                              <Chip label={preDomain.scaled_score} size="small" sx={{ fontWeight: 'bold' }} />
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell align="center" sx={{ borderLeft: '1px solid #e2e8f0', fontWeight: 'bold' }}>
                            {isMidReleased && midDomain && midDomain.scaled_score != null ? (
                              <Chip label={midDomain.scaled_score} size="small" sx={{ fontWeight: 'bold' }} />
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell align="center" sx={{ borderLeft: '1px solid #e2e8f0', fontWeight: 'bold' }}>
                            {isPostReleased && postDomain && postDomain.scaled_score != null ? (
                              <Chip label={postDomain.scaled_score} size="small" sx={{ fontWeight: 'bold' }} />
                            ) : (
                              '-'
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}

                    {/* Sum of Scaled Scores */}
                    <TableRow sx={{ bgcolor: '#f8fafc', fontWeight: 'bold' }}>
                      <TableCell sx={{ fontWeight: 'bold', color: '#1e1e2f', py: 2 }}>Sum of Scaled Scores</TableCell>
                      <TableCell align="center" sx={{ borderLeft: '1px solid #e2e8f0', fontWeight: 'bold', color: 'primary.main' }}>
                        {isPreReleased ? (summaryData.periods.PRE?.sum_of_scaled_scores ?? '-') : '-'}
                      </TableCell>
                      <TableCell align="center" sx={{ borderLeft: '1px solid #e2e8f0', fontWeight: 'bold', color: 'primary.main' }}>
                        {isMidReleased ? (summaryData.periods.MID?.sum_of_scaled_scores ?? '-') : '-'}
                      </TableCell>
                      <TableCell align="center" sx={{ borderLeft: '1px solid #e2e8f0', fontWeight: 'bold', color: 'primary.main' }}>
                        {isPostReleased ? (summaryData.periods.POST?.sum_of_scaled_scores ?? '-') : '-'}
                      </TableCell>
                    </TableRow>

                    {/* Standard Score */}
                    <TableRow sx={{ bgcolor: '#f8fafc' }}>
                      <TableCell sx={{ fontWeight: 'bold', color: '#1e1e2f', py: 2 }}>Standard Score</TableCell>
                      <TableCell align="center" sx={{ borderLeft: '1px solid #e2e8f0', fontWeight: 'bold', color: 'primary.dark' }}>
                        {isPreReleased ? (summaryData.periods.PRE?.standard_score ?? '-') : '-'}
                      </TableCell>
                      <TableCell align="center" sx={{ borderLeft: '1px solid #e2e8f0', fontWeight: 'bold', color: 'primary.dark' }}>
                        {isMidReleased ? (summaryData.periods.MID?.standard_score ?? '-') : '-'}
                      </TableCell>
                      <TableCell align="center" sx={{ borderLeft: '1px solid #e2e8f0', fontWeight: 'bold', color: 'primary.dark' }}>
                        {isPostReleased ? (summaryData.periods.POST?.standard_score ?? '-') : '-'}
                      </TableCell>
                    </TableRow>

                    {/* Qualitative Interpretation */}
                    <TableRow sx={{ bgcolor: '#eff6ff' }}>
                      <TableCell sx={{ fontWeight: 'bold', color: '#1e1e2f', py: 2 }}>Interpretation</TableCell>
                      <TableCell align="center" sx={{ borderLeft: '1px solid #e2e8f0', fontWeight: 'bold', color: '#1d4ed8' }}>
                        {isPreReleased ? (summaryData.periods.PRE?.interpretation ?? '-') : '-'}
                      </TableCell>
                      <TableCell align="center" sx={{ borderLeft: '1px solid #e2e8f0', fontWeight: 'bold', color: '#1d4ed8' }}>
                        {isMidReleased ? (summaryData.periods.MID?.interpretation ?? '-') : '-'}
                      </TableCell>
                      <TableCell align="center" sx={{ borderLeft: '1px solid #e2e8f0', fontWeight: 'bold', color: '#1d4ed8' }}>
                        {isPostReleased ? (summaryData.periods.POST?.interpretation ?? '-') : '-'}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            );
          })()}
        </Paper>
      </Box>
    );
  };

  const renderChecklistTab = () => {
    return (
      <Box sx={{ mt: 3 }}>
        {!canEditHomeBased && (
          <Alert severity="warning" icon={<LockOutlinedIcon />} sx={{ mb: 3, borderRadius: 2, fontWeight: 'bold' }}>
            Home-based evaluation is currently closed by the class adviser. You can view previously answered indicators below in read-only mode.
          </Alert>
        )}

        {saveSuccess && (
          <Alert severity="success" icon={<CheckCircleOutlinedIcon />} sx={{ mb: 3, borderRadius: 2, fontWeight: 'bold' }}>
            {saveSuccess}
          </Alert>
        )}

        {/* Domain Cards Grid */}
        {!activeDomain && checklistDomains.length > 0 && (
          <Grid container spacing={3}>
            {checklistDomains.map((domain) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={domain.domain_id}>
                <Paper
                  sx={{
                    p: 3,
                    borderRadius: 3,
                    height: 260,
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.04)',
                    border: '1px solid #f1f5f9',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      transform: 'translateY(-3px)',
                      boxShadow: '0 10px 24px rgba(0, 0, 0, 0.08)',
                    },
                  }}
                  onClick={() => setActiveDomain(domain)}
                >
                  <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1e1e2f', mb: 2, minHeight: 56 }}>
                    {domain.domain_name}
                  </Typography>

                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexGrow: 1 }}>
                    <AssignmentIcon sx={{ fontSize: 56, color: '#94a3b8', mb: 1, opacity: 0.6 }} />
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 'bold' }}>
                      {domain.questions?.length || 0} Home Indicator(s)
                    </Typography>
                  </Box>

                  <Button
                    fullWidth
                    variant="contained"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveDomain(domain);
                    }}
                    sx={{ mt: 'auto', borderRadius: 2, textTransform: 'none', fontWeight: 'bold', boxShadow: 'none' }}
                  >
                    {canEditHomeBased ? 'Evaluate Domain' : 'View Indicators'}
                  </Button>
                </Paper>
              </Grid>
            ))}
          </Grid>
        )}

        {/* Active Domain Checklist Table */}
        {activeDomain && (
          <Box>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => setActiveDomain(null)}
              sx={{ mb: 3, fontWeight: 'bold', color: 'text.secondary', textTransform: 'none' }}
            >
              Back to Domains
            </Button>

            <Paper sx={{ mb: 6, overflow: 'hidden', borderRadius: 3, boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)', border: '1px solid #f1f5f9' }}>
              <Box sx={{ p: 2.5, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1e1e2f' }}>
                  {activeDomain.domain_name}
                </Typography>
              </Box>

              {evalLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', my: 5 }}>
                  <CircularProgress />
                </Box>
              ) : activeDomain.questions.length === 0 ? (
                <Box sx={{ p: 5, textAlign: 'center' }}>
                  <Typography sx={{ color: 'text.secondary', fontWeight: 'bold' }}>
                    No home-based assessment indicators assigned to this domain.
                  </Typography>
                </Box>
              ) : (
                <TableContainer sx={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
                  <Table sx={{ minWidth: 650 }}>
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#f8fafc' }}>
                        <TableCell sx={{ fontWeight: 'bold', color: 'text.secondary', width: '45%', py: 2 }}>
                          QUESTION / INDICATOR
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 'bold', color: 'text.secondary', width: '18%', borderLeft: '1px solid #e2e8f0' }}>
                          PRE-TEST
                          {evalAges[String(activeDomain.domain_id)]?.PRE != null && (
                            <Typography variant="caption" sx={{ display: 'block', color: 'primary.main' }}>
                              Age: {evalAges[String(activeDomain.domain_id)].PRE}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 'bold', color: 'text.secondary', width: '18%', borderLeft: '1px solid #e2e8f0' }}>
                          MID-TEST
                          {evalAges[String(activeDomain.domain_id)]?.MID != null && (
                            <Typography variant="caption" sx={{ display: 'block', color: 'warning.main' }}>
                              Age: {evalAges[String(activeDomain.domain_id)].MID}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 'bold', color: 'text.secondary', width: '18%', borderLeft: '1px solid #e2e8f0' }}>
                          POST-TEST
                          {evalAges[String(activeDomain.domain_id)]?.POST != null && (
                            <Typography variant="caption" sx={{ display: 'block', color: 'success.main' }}>
                              Age: {evalAges[String(activeDomain.domain_id)].POST}
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {activeDomain.questions.map((q, idx) => (
                        <TableRow key={q.question_id} sx={{ '&:hover': { bgcolor: '#f8fafc' } }}>
                          <TableCell sx={{ fontSize: '0.95rem', color: '#334155', fontWeight: 500, py: 2 }}>
                            {idx + 1}. {q.question_text}
                          </TableCell>
                          {['PRE', 'MID', 'POST'].map((period) => (
                            <TableCell key={period} align="center" sx={{ borderLeft: '1px solid #e2e8f0' }}>
                              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                                <Button
                                  variant={getAnswer(q.question_id, period) === 'KAYA' ? 'contained' : 'outlined'}
                                  color="success"
                                  size="small"
                                  onClick={() => handleAnswerChange(q.question_id, period, 'KAYA')}
                                  disabled={!canEditHomeBased}
                                  sx={{
                                    minWidth: 70,
                                    fontWeight: 'bold',
                                    borderRadius: 2,
                                    py: 0.6,
                                  }}
                                  disableElevation
                                >
                                  KAYA
                                </Button>
                                <Button
                                  variant={getAnswer(q.question_id, period) === 'DI-KAYA' ? 'contained' : 'outlined'}
                                  color="error"
                                  size="small"
                                  onClick={() => handleAnswerChange(q.question_id, period, 'DI-KAYA')}
                                  disabled={!canEditHomeBased}
                                  sx={{
                                    minWidth: 70,
                                    fontWeight: 'bold',
                                    borderRadius: 2,
                                    py: 0.6,
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

            {/* Sticky Save Button */}
            {canEditHomeBased && !evalLoading && activeDomain.questions.length > 0 && (
              <Box
                sx={{
                  position: 'fixed',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  p: 2.5,
                  bgcolor: 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(8px)',
                  borderTop: '1px solid #e2e8f0',
                  zIndex: 1000,
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                <Button
                  variant="contained"
                  size="large"
                  color="success"
                  onClick={handleSaveChecklist}
                  disabled={saving}
                  sx={{
                    py: 1.5,
                    px: 6,
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    textTransform: 'none',
                    borderRadius: 2.5,
                    minWidth: { xs: '100%', sm: 360 },
                  }}
                >
                  {saving ? <CircularProgress size={24} color="inherit" /> : 'Save Home Evaluations'}
                </Button>
              </Box>
            )}
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, minHeight: '100vh', pb: 12 }}>
      {/* Page Header */}
      <Box
        sx={{
          mb: 3,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#1e1e2f', mb: 0.5 }}>
            ECCD Assessment
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            View official DepEd assessment summaries and submit home-based evaluations.
          </Typography>
        </Box>

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
                <MenuItem key={child.lrn_number} value={index}>
                  {child.first_name} {child.last_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Box>

      {/* Tabs navigation */}
      <Paper sx={{ borderRadius: 3, mb: 3, border: '1px solid #f1f5f9' }}>
        <Tabs
          value={activeTab}
          onChange={(_, val) => {
            setActiveTab(val);
            setActiveDomain(null);
          }}
          textColor="primary"
          indicatorColor="primary"
          sx={{
            px: 2,
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 'bold',
              fontSize: '0.95rem',
              py: 2,
            },
          }}
        >
          <Tab icon={<AssessmentOutlinedIcon />} iconPosition="start" label="Official Evaluation Summary" />
          <Tab icon={<AssignmentIcon />} iconPosition="start" label="Home-Based Checklist" />
        </Tabs>
      </Paper>

      {activeTab === 0 ? renderSummaryTab() : renderChecklistTab()}
    </Box>
  );
};

export default ParentEccdAssessment;
