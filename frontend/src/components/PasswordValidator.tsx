import { useEffect } from "react";
import { PasswordRules, passwordValid } from "./ForceChangePassword";
interface PasswordValidatorProps {
  password?: string;
  onValidationChange?: (valid: boolean) => void;
}
export default function PasswordValidator({
  password = "",
  onValidationChange,
}: PasswordValidatorProps) {
  const valid = passwordValid(password);
  useEffect(() => {
    onValidationChange?.(valid);
  }, [valid, onValidationChange]);
  return <PasswordRules value={password} />;
}
