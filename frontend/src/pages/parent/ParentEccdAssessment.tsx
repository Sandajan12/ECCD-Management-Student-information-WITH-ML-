import React, { useState } from 'react';
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
import { useChildren } from '../../hooks/useChildren';
import { useParentAssessment } from '../../hooks/useParentAssessment';

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
  const roster = useChildren();
  const childrenList = roster.children;
  const selectedChildIndex = Math.max(0, childrenList.findIndex(child => child.student_id === roster.selected));
  const [activeTab, setActiveTab] = useState<number>(0);
  const assessment = useParentAssessment(roster.child);
  const { checklistDomains, activeDomain, setActiveDomain, canEditHomeBased, isPeriodReleased, getAnswer, handleAnswerChange, handleSaveChecklist, saving, summaryData, evalAges, saveSuccess } = assessment;
  const loading = roster.loading;
  const evalLoading = assessment.loading;
  const summaryLoading = assessment.loading;
  const error = roster.error || assessment.error;
  const handleChildSwitch = (event: SelectChangeEvent<number>) => {
    const child = childrenList[Number(event.target.value)];
    if (child) {
      setActiveDomain(null);
      roster.select(child.student_id);
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
          <Typography sx={{ color: 'text.secondary' }}>{error || 'No assessment scores recorded yet.'}</Typography>
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
                            {pData.interpretation || 'Not available'}
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

        {(saveSuccess || error) && (
          <Alert severity={error ? 'error' : 'success'} icon={error ? undefined : <CheckCircleOutlinedIcon />} sx={{ mb: 3, borderRadius: 2, fontWeight: 'bold' }}>
            {error || saveSuccess}
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
                                  disabled={!canEditHomeBased || saving}
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
                                  disabled={!canEditHomeBased || saving}
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
                <MenuItem key={child.student_id} value={index}>
                  {[child.first_name, child.last_name].filter(Boolean).join(' ') || child.masked_lrn}
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
