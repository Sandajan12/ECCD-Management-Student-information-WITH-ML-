import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import type { useParentAssessment } from "../../hooks/useParentAssessment";
import { PERIOD_LABELS, type Period } from "../../types";

interface ReadOnlyDomainChecklistProps {
  assessment: ReturnType<typeof useParentAssessment>;
}

export default function ReadOnlyDomainChecklist({
  assessment,
}: ReadOnlyDomainChecklistProps) {
  const domain = assessment.activeDomain;
  const period = assessment.activePeriod;

  if (!assessment.canViewMarks)
    return (
      <Alert severity="info" sx={{ borderRadius: 3 }}>
        Checklist viewing is restricted by the class adviser. Recorded marks and
        domain details are hidden until your adviser enables access. Home
        observations can be entered on the Overview page when editing is open.
      </Alert>
    );

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between" }}
      >
        <Stack spacing={1}>
          <Typography component="h2" variant="h6">
            Developmental Domains
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            View saved checklist results. Submit home observations on the
            Overview page.
          </Typography>
        </Stack>
        <TextField
          select
          label="Testing period"
          value={period}
          onChange={(event) =>
            assessment.setSelectedPeriod(event.target.value as Period)
          }
          sx={{
            width: { xs: "100%", sm: "40%", md: "25%" },
            "& .MuiOutlinedInput-root": { borderRadius: 3 },
          }}
        >
          {assessment.viewablePeriods.map((value) => (
            <MenuItem key={value} value={value}>
              {PERIOD_LABELS[value]}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      {!domain ? (
        <Grid container spacing={2}>
          {assessment.checklistDomains.map((item) => (
            <Grid key={item.domain_id} size={{ xs: 12, sm: 6, lg: 4 }}>
              <Card elevation={1} sx={{ borderRadius: 3, height: "100%" }}>
                <CardContent sx={{ p: 3, height: "100%" }}>
                  <Stack
                    spacing={3}
                    sx={{ height: "100%", justifyContent: "space-between" }}
                  >
                    <Typography component="h3" sx={{ fontWeight: 600 }}>
                      {item.domain_name}
                    </Typography>
                    <Button
                      variant="contained"
                      aria-label={`View ${item.domain_name}`}
                      onClick={() => assessment.setActiveDomain(item)}
                      sx={{ borderRadius: 3 }}
                    >
                      View Domain
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        <Stack spacing={3}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => assessment.setActiveDomain(null)}
            sx={{ borderRadius: 3, alignSelf: "flex-start" }}
          >
            Back to Domains
          </Button>
          <Typography component="h3" variant="h6">
            {domain.domain_name}
          </Typography>
          {[
            { home: true, title: "Home-Based Questions" },
            { home: false, title: "School-Administered Questions" },
          ].map((group) => {
            const questions = assessment
              .sortedQuestions(domain.questions)
              .filter((question) => question.is_home_based === group.home);
            return (
              <Card
                component="section"
                aria-label={group.title}
                key={group.title}
                elevation={1}
                sx={{ borderRadius: 3 }}
              >
                <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                  <Stack spacing={2}>
                    <Typography component="h4" sx={{ fontWeight: 600 }}>
                      {group.title}
                    </Typography>
                    {questions.length === 0 && (
                      <Typography
                        variant="body2"
                        sx={{ color: "text.secondary" }}
                      >
                        No items in this group.
                      </Typography>
                    )}
                    {questions.map((question) => {
                      // Inspection uses only server records, never local drafts or inherited answers.
                      const answer = question.answers[period];
                      return (
                        <Stack
                          key={question.question_id}
                          role="group"
                          aria-label={question.question_text}
                          direction={{ xs: "column", sm: "row" }}
                          spacing={2}
                          sx={{
                            p: 2,
                            borderRadius: 3,
                            bgcolor: "action.hover",
                            justifyContent: "space-between",
                            alignItems: { xs: "flex-start", sm: "center" },
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{ minWidth: 0, overflowWrap: "anywhere" }}
                          >
                            {question.question_text}
                          </Typography>
                          <Chip
                            label={answer || "Not yet evaluated"}
                            color={
                              answer === "KAYA"
                                ? "success"
                                : answer === "DI-KAYA"
                                  ? "warning"
                                  : "default"
                            }
                            sx={{ flexShrink: 0 }}
                          />
                        </Stack>
                      );
                    })}
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
