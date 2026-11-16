import {
  Alert,
  Button,
  Card,
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
import type { useParentAssessment } from "../../hooks/useParentAssessment";
import HomePhotoField from "./HomePhotoField";
import { PERIOD_LABELS, type Answer, type Period } from "../../types";

interface HomeAssessmentFormProps {
  assessment: ReturnType<typeof useParentAssessment>;
  childName: string;
}

export default function HomeAssessmentForm({
  assessment,
  childName,
}: HomeAssessmentFormProps) {
  const domains = assessment.checklistDomains.filter((domain) =>
    domain.questions.some((question) => question.is_home_based === true),
  );
  const period = assessment.selectedPeriod;
  const disabled = assessment.loading || assessment.saving || !period;

  return (
    <Card
      component="section"
      id="home-assessment"
      aria-labelledby="home-assessment-title"
      elevation={1}
      sx={{ borderRadius: 3, minWidth: 0, scrollMarginTop: "6rem" }}
    >
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            void assessment.handleSaveChecklist();
          }}
          spacing={3}
        >
          <Stack spacing={1}>
            <Typography id="home-assessment-title" component="h2" variant="h6">
              Home-Based Assessment
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Share your observations for {childName || "your child"}. Choose
              KAYA when your child can do an activity independently, or DI-KAYA
              when they are still learning. Your answers stay on this device
              until you save them and the server confirms your submission.
            </Typography>
          </Stack>

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
              Home questions are currently unavailable. Your saved drafts remain
              on this device.
            </Alert>
          ) : (
            <>
              {!assessment.hasOpenPeriod && (
                <Alert severity="info" sx={{ borderRadius: 3 }}>
                  Editing Closed by Teacher. Your adviser must enable home-based
                  editing and open a testing period before you can submit. Your
                  drafts remain on this device.
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
              {domains.length === 0 && (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  No home-based questions have been configured yet.
                </Typography>
              )}
              {domains.map((domain) => (
                <Stack
                  component="section"
                  key={domain.domain_id}
                  aria-labelledby={`home-domain-${domain.domain_id}`}
                  spacing={2}
                >
                  <Typography
                    id={`home-domain-${domain.domain_id}`}
                    component="h3"
                    sx={{ fontWeight: 600 }}
                  >
                    {domain.domain_name}
                  </Typography>
                  {assessment
                    .sortedQuestions(domain.questions)
                    .filter((question) => question.is_home_based === true)
                    .map((question) => (
                      <Stack
                        key={question.question_id}
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
                            label={domain.domain_name.replace(/ Domain$/i, "")}
                            sx={{ alignSelf: "flex-start", maxWidth: "100%" }}
                          />
                          <Typography
                            id={`home-question-${question.question_id}`}
                            variant="body2"
                            sx={{ overflowWrap: "anywhere" }}
                          >
                            {question.question_text}
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
                                  : assessment.isQuestionSaved(
                                        question.question_id,
                                        period,
                                      )
                                    ? question.home_observations?.[period]
                                        ?.status === "pending"
                                      ? "Submitted — awaiting teacher review"
                                      : question.home_observations?.[period]
                                            ?.status === "declined"
                                        ? "Declined · Locked"
                                        : "Saved · Locked"
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
                          aria-labelledby={`home-question-${question.question_id}`}
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
                          }}
                        >
                          <ToggleButton
                            value="KAYA"
                            color="success"
                            sx={{ borderRadius: 3, px: 2 }}
                          >
                            KAYA
                          </ToggleButton>
                          <ToggleButton
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
              ))}
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
                {assessment.saving ? "Saving…" : "Save Home Observations"}
              </Button>
            </>
          )}
        </Stack>
      </CardContent>
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
    </Card>
  );
}
