import { useEffect, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { useParentAssessment } from "../../hooks/useParentAssessment";
import HomePhotoField from "./HomePhotoField";
import { PERIOD_LABELS, type Answer, type Period } from "../../types";

interface HomeAssessmentFormProps {
  assessment: ReturnType<typeof useParentAssessment>;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

export default function HomeAssessmentForm({
  assessment,
  expanded,
  onExpandedChange,
}: HomeAssessmentFormProps) {
  const period = assessment.selectedPeriod;
  const [navigation, setNavigation] = useState<{
    scope: string;
    collapsed: Record<number, boolean>;
    question?: number;
  }>({ scope: "", collapsed: {} });
  const currentNavigation = navigation.scope === assessment.photoScope ? navigation : null;
  const rows = useRef(new Map<number, HTMLDivElement>());
  useEffect(() => {
    setNavigation({ scope: assessment.photoScope, collapsed: {} });
  }, [assessment.photoScope]);
  useEffect(() => {
    const question = currentNavigation?.question;
    if (!expanded || !question) return;
    const frame = requestAnimationFrame(() => {
      const row = rows.current.get(question);
      row?.querySelector<HTMLButtonElement>("button[data-home-answer]:not([disabled])")?.focus({ preventScroll: true });
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [currentNavigation, expanded]);
  const domains = assessment.checklistDomains
    .map((domain) => ({
      ...domain,
      questions: domain.questions.filter(
        (question) =>
          question.is_home_based === true &&
          period &&
          assessment.canEditPeriod(period) &&
          !assessment.isQuestionSaved(question.question_id, period),
      ),
    }))
    .filter((domain) => domain.questions.length > 0);
  const disabled = assessment.loading || assessment.saving || !period;

  return (
    <Accordion
      component="section"
      id="home-assessment"
      aria-labelledby="home-assessment-title"
      elevation={1}
      expanded={expanded}
      slots={{ heading: "h2" }}
      onChange={(_, next) => onExpandedChange(next)}
      sx={{ borderRadius: 3, minWidth: 0, scrollMarginTop: "6rem" }}
    >
      <AccordionSummary
        aria-label="Assess Home-Based Questions"
        expandIcon={<ExpandMoreIcon />}
        aria-controls="home-assessment-content"
        id="home-assessment-toggle"
        sx={{
          p: { xs: 2, sm: 3 },
          "& .MuiAccordionSummary-content": { minWidth: 0 },
        }}
      >
        <Stack spacing={1}>
          <Typography id="home-assessment-title" component="span" variant="h6">
            Assess Home-Based Questions
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Choose KAYA or DI-KAYA for each home-based question, then tap Submit
            Observations.
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 0 }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack
            component="form"
            onSubmit={(event) => {
              event.preventDefault();
              void assessment.handleSaveChecklist();
            }}
            spacing={3}
            sx={{ pb: expanded && domains.length > 0 ? { xs: 16, md: 10 } : 0 }}
          >
            {assessment.error && (
              <Alert severity="error" sx={{ borderRadius: 3 }}>
                {assessment.error}
              </Alert>
            )}
            {assessment.saveSuccess && (
              <Alert severity="success" sx={{ borderRadius: 3 }}>
                {assessment.saveSuccess}
              </Alert>
            )}
            {assessment.loading && !assessment.data ? (
              <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                <CircularProgress size="1.5rem" />
                <Typography variant="body2">Loading home questions…</Typography>
              </Stack>
            ) : !assessment.data ? (
              <Alert severity="info" sx={{ borderRadius: 3 }}>
                Home questions are currently unavailable. Your saved drafts
                remain on this device.
              </Alert>
            ) : (
              <>
                {!assessment.hasOpenPeriod && (
                  <Alert severity="info" sx={{ borderRadius: 3 }}>
                    Locked by teacher. Your adviser must enable home-based
                    editing and open a testing period before you can submit.
                    Your drafts remain on this device.
                  </Alert>
                )}
                <TextField
                  select
                  label="Home assessment testing period"
                  value={period || ""}
                  disabled={disabled}
                  onChange={(event) =>
                    assessment.setSelectedPeriod(event.target.value as Period)
                  }
                  sx={{
                    width: { xs: "100%", sm: "50%", md: "33%" },
                    "& .MuiOutlinedInput-root": { borderRadius: 3 },
                  }}
                >
                  {!period && <MenuItem value="">No periods open</MenuItem>}
                  {assessment.editablePeriods.map((value) => (
                    <MenuItem key={value} value={value}>
                      {PERIOD_LABELS[value]}
                    </MenuItem>
                  ))}
                </TextField>
                {period && domains.length === 0 && (
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    All home observations submitted
                  </Typography>
                )}
                {domains.map((domain) => (
                  <Accordion
                    component="section"
                    key={`${period}-${domain.domain_id}`}
                    expanded={!currentNavigation?.collapsed[domain.domain_id]}
                    onChange={(_, next) => setNavigation({
                      scope: assessment.photoScope,
                      collapsed: { ...currentNavigation?.collapsed, [domain.domain_id]: !next },
                    })}
                    disableGutters
                    elevation={0}
                    sx={{
                      borderRadius: 3,
                      bgcolor: "transparent",
                      "&::before": { display: "none" },
                    }}
                  >
                    <AccordionSummary
                      expandIcon={<ExpandMoreIcon />}
                      aria-controls={`home-domain-content-${domain.domain_id}`}
                      id={`home-domain-${domain.domain_id}`}
                    >
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "center", minWidth: 0 }}
                      >
                        <Typography
                          component="span"
                          sx={{ fontWeight: 600, overflowWrap: "anywhere" }}
                        >
                          {domain.domain_name}
                        </Typography>
                        <Chip
                          size="small"
                          label={`${domain.questions.length} remaining`}
                        />
                      </Stack>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: { xs: 0, sm: 2 } }}>
                      <Stack spacing={2}>
                        {assessment
                          .sortedQuestions(domain.questions)
                          .map((question) => (
                            <Stack
                              key={question.question_id}
                              ref={(row: HTMLDivElement | null) => {
                                if (row) rows.current.set(question.question_id, row);
                                else rows.current.delete(question.question_id);
                              }}
                              direction={{ xs: "column", md: "row" }}
                              spacing={2}
                              sx={{
                                p: 2,
                                bgcolor: "action.hover",
                                borderRadius: 3,
                                alignItems: { xs: "stretch", md: "center" },
                                justifyContent: "space-between",
                              }}
                            >
                              <Stack spacing={1} sx={{ minWidth: 0, flex: 1 }}>
                                <Chip
                                  size="small"
                                  color="primary"
                                  variant="outlined"
                                  label={domain.domain_name.replace(
                                    / Domain$/i,
                                    "",
                                  )}
                                  sx={{
                                    alignSelf: "flex-start",
                                    maxWidth: "100%",
                                  }}
                                />
                                <Typography
                                  id={`home-question-${question.question_id}`}
                                  variant="body2"
                                  sx={{ overflowWrap: "anywhere" }}
                                >
                                  {question.sequence_order}. {question.question_text}
                                </Typography>
                                {period &&
                                  assessment.isQuestionLocked(
                                    question.question_id,
                                    period,
                                  ) && (
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        color: "text.secondary",
                                        fontWeight: 500,
                                        overflowWrap: "anywhere",
                                        whiteSpace: assessment.isCarriedForward(
                                          question.question_id,
                                          period,
                                        )
                                          ? "nowrap"
                                          : "normal",
                                      }}
                                    >
                                      {assessment.isCarriedForward(
                                        question.question_id,
                                        period,
                                      )
                                        ? "draft-not save"
                                        : "Locked by teacher"}
                                    </Typography>
                                  )}
                                {period && (
                                  <HomePhotoField
                                    key={assessment.photoResource(
                                      question.question_id,
                                      period,
                                    )}
                                    resource={assessment.photoResource(
                                      question.question_id,
                                      period,
                                    )}
                                    eligible={
                                      question.photo_eligible?.[period] === true
                                    }
                                    disabled={disabled}
                                  />
                                )}
                              </Stack>
                              <ToggleButtonGroup
                                exclusive
                                size="small"
                                value={
                                  period
                                    ? assessment.getAnswer(
                                        question.question_id,
                                        period,
                                      )
                                    : null
                                }
                                disabled={
                                  disabled ||
                                  Boolean(
                                    period &&
                                    assessment.isQuestionLocked(
                                      question.question_id,
                                      period,
                                    ),
                                  )
                                }
                                aria-label={question.question_text}
                                onChange={(_, answer: Answer | null) => {
                                  if (period && answer)
                                    assessment.handleAnswerChange(
                                      question.question_id,
                                      period,
                                      answer,
                                    );
                                }}
                                sx={{
                                  flexShrink: 0,
                                  alignSelf: "flex-start",
                                  borderRadius: 3,
                                  ...(currentNavigation?.question === question.question_id
                                    ? { outline: "2px solid", outlineColor: "warning.main", outlineOffset: 4 }
                                    : {}),
                                }}
                              >
                                <ToggleButton
                                  data-home-answer
                                  value="KAYA"
                                  color="success"
                                  sx={{ borderRadius: 3, px: 2 }}
                                >
                                  KAYA
                                </ToggleButton>
                                <ToggleButton
                                  data-home-answer
                                  value="DI-KAYA"
                                  color="warning"
                                  sx={{ borderRadius: 3, px: 2 }}
                                >
                                  DI-KAYA
                                </ToggleButton>
                              </ToggleButtonGroup>
                            </Stack>
                          ))}
                      </Stack>
                    </AccordionDetails>
                  </Accordion>
                ))}
                {expanded && domains.length > 0 && period && (
                  <Stack
                    aria-label="Home observation submission"
                    sx={{
                      position: "fixed",
                      left: { xs: "0.75rem", md: "16rem" },
                      right: { xs: "0.75rem", md: "1rem" },
                      bottom: {
                        xs: "calc(4.75rem + env(safe-area-inset-bottom, 0px))",
                        md: "1rem",
                      },
                      zIndex: 1100,
                      bgcolor: "background.paper",
                      borderRadius: 3,
                      boxShadow: 2,
                      p: 1.5,
                    }}
                  >
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={disabled || domains.length === 0}
                      startIcon={
                        assessment.saving ? (
                          <CircularProgress size="1rem" color="inherit" />
                        ) : (
                          <SaveIcon />
                        )
                      }
                      sx={{
                        borderRadius: 3,
                        alignSelf: { xs: "stretch", sm: "flex-start" },
                        py: 1.25,
                      }}
                    >
                      {assessment.saving
                        ? "Submitting…"
                        : "Submit Observations"}
                    </Button>
                  </Stack>
                )}
              </>
            )}
          </Stack>
        </CardContent>
      </AccordionDetails>
      <Dialog
        open={assessment.missingPhotoMarks.length > 0}
        onClose={assessment.closePhotoWarning}
        disableRestoreFocus={Boolean(currentNavigation?.question)}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
        aria-labelledby="home-photo-warning-title"
        aria-describedby="home-photo-warning-description"
      >
        <DialogTitle id="home-photo-warning-title">Mark the questions with photos</DialogTitle>
        <DialogContent>
          <Stack spacing={3}>
            <DialogContentText id="home-photo-warning-description">
              Some questions have a photo but no KAYA or DI-KAYA mark. Mark these questions or remove their photos before submitting. Your drafts are saved.
            </DialogContentText>
            {assessment.missingPhotoMarks.map((question) => (
              <Stack key={question.questionId} spacing={1}>
                <Typography sx={{ fontWeight: 600 }}>{question.domainName}</Typography>
                <Typography>{question.number}. {question.text}</Typography>
                <Button variant="outlined" sx={{ borderRadius: 3, alignSelf: "flex-start" }} onClick={() => {
                  assessment.closePhotoWarning();
                  onExpandedChange(true);
                  setNavigation({ scope: assessment.photoScope,
                    collapsed: { ...currentNavigation?.collapsed, [question.domainId]: false },
                    question: question.questionId });
                }}>Go to question</Button>
              </Stack>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={assessment.closePhotoWarning} sx={{ borderRadius: 3 }}>Close</Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={assessment.confirmationOpen}
        onClose={assessment.cancelConfirmation}
        fullWidth
        maxWidth="xs"
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
        aria-labelledby="home-submit-title"
      >
        <DialogTitle id="home-submit-title">Submit Answers</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Submit {assessment.submissionCount} answered questions for teacher
            review. Submitted answers cannot be changed. Any unanswered
            questions can still be completed later. Photos are optional and
            removed after the teacher saves a review.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            onClick={assessment.cancelConfirmation}
            sx={{ borderRadius: 3 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void assessment.handleSaveChecklist(true)}
            sx={{ borderRadius: 3 }}
          >
            Submit Answers
          </Button>
        </DialogActions>
      </Dialog>
    </Accordion>
  );
}
