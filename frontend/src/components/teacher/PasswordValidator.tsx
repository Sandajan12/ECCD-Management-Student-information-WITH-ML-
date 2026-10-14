import { useEffect } from "react";
import { Box, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";

interface PasswordValidatorProps {
  password: string;
  onValidationChange?: (valid: boolean) => void;
}
const PasswordValidator = ({
  password,
  onValidationChange,
}: PasswordValidatorProps) => {
  const rules = [
    { label: "At least 8 characters", test: (pw: string) => pw.length >= 8 },
    {
      label: "At least one uppercase letter",
      test: (pw: string) => /[A-Z]/.test(pw),
    },
    {
      label: "At least one lowercase letter",
      test: (pw: string) => /[a-z]/.test(pw),
    },
    { label: "At least one number", test: (pw: string) => /[0-9]/.test(pw) },
    {
      label: "Maximum 72 UTF-8 bytes",
      test: (pw: string) => new TextEncoder().encode(pw).length <= 72,
    },
  ];

  // Compute validity
  const allValid = rules.every((rule) => rule.test(password || ""));

  // Notify parent component of validation state changes
  useEffect(() => {
    if (onValidationChange) {
      onValidationChange(allValid);
    }
  }, [allValid, onValidationChange]);

  return (
    <Box
      sx={{
        mt: 1,
        mb: 2,
        p: 1.5,
        bgcolor: "#f8fafc",
        borderRadius: 2,
        border: "1px solid #e2e8f0",
      }}
    >
      <Typography
        variant="caption"
        sx={{ fontWeight: "bold", color: "#64748b", mb: 1, display: "block" }}
      >
        Password Requirements:
      </Typography>
      {rules.map((rule, index) => {
        const isValid = rule.test(password || "");
        return (
          <Box
            key={index}
            sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}
          >
            {isValid ? (
              <CheckCircleIcon sx={{ fontSize: 16, color: "success.main" }} />
            ) : (
              <CancelIcon sx={{ fontSize: 16, color: "text.disabled" }} />
            )}
            <Typography
              variant="body2"
              sx={{
                color: isValid ? "success.main" : "text.secondary",
                textDecoration: isValid ? "line-through" : "none",
                fontSize: "0.8rem",
              }}
            >
              {rule.label}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
};

export default PasswordValidator;
