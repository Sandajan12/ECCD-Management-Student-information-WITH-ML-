import { useId, useState } from "react";
import Stack from "@mui/material/Stack";
import TermsAndPrivacyModal from "./TermsAndPrivacyModal";

interface TermsPrivacyAcknowledgmentProps {
  context: "registration" | "login";
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export default function TermsPrivacyAcknowledgment({
  context,
  checked,
  onChange,
  disabled = false,
}: TermsPrivacyAcknowledgmentProps) {
  const id = useId();
  const helpId = `${context}-${id}-help`;
  const [open, setOpen] = useState<boolean>(false);
  // Keep the portal inside an OTP dialog's browser top layer when reviewing there.
  const [container, setContainer] = useState<HTMLElement | null>(null);
  return (
    <>
      <Stack sx={{ gap: 1, mb: 2, textAlign: "left" }}>
        <label className="flex cursor-pointer select-none items-center gap-2 text-left text-sm text-gray-600">
          <input
            type="checkbox"
            name="terms_accepted"
            checked={checked}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
            aria-required="true"
            aria-describedby={checked ? undefined : helpId}
            className="h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 accent-blue-600 focus:ring-blue-500"
          />
          <span>
            I have read and agree to the{" "}
            <button
              type="button"
              onClick={(event) => {
                setContainer(event.currentTarget.closest("dialog"));
                setOpen(true);
              }}
              aria-haspopup="dialog"
              className="inline cursor-pointer font-medium text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              Terms and Conditions
            </button>
            .
          </span>
        </label>
        {!checked && (
          <span id={helpId} className="sr-only">
            Please read and accept the terms and privacy notice to continue.
          </span>
        )}
      </Stack>
      <TermsAndPrivacyModal
        open={open}
        container={container}
        onClose={() => setOpen(false)}
        onAccept={() => {
          if (!disabled) onChange(true);
        }}
      />
    </>
  );
}
