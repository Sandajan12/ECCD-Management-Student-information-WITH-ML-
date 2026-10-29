import { Typography } from "@mui/material";

export interface ForecastState {
  prediction_status: "available";
  support_reason: null;
  predicted_post_interpretation: string | null;
  confidence_percentage: number | null;
  confidence_percentages: Record<string, number>;
  pre_interpretation: string | null;
}

export default function ForecastSupportNotice() {
  return (
    <Typography variant="body2" sx={{ mt: 2, color: "text.secondary" }}>
      The model covers three POST outcomes: Average, Slight Delay and
      Significant Delay. Advanced POST outcomes are unavailable. Overall PRE
      interpretation is calculated separately and need not match POST.
    </Typography>
  );
}
