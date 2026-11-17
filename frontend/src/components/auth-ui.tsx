// Visual properties extracted from legacy auth/Login.jsx, auth/Register.jsx
// and ForceChangePasswordModal.jsx. MUI spacing unit = 8px; shape unit = 4px.
import { useId, useRef, useState } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { Box, Stack } from "@mui/material";
import AndroidIcon from "@mui/icons-material/Android";
import Background from "../assets/background_pic.webp";
import LegacyIcon from "./LegacyIcon";
import LegacyRipple from "./LegacyRipple";
import type { LegacyIconName } from "./LegacyIcon";

export const fallbackLogo = "https://via.placeholder.com/150?text=Logo";
const parentAppDownloadUrl =
  import.meta.env.VITE_PARENT_APP_DOWNLOAD_URL?.trim() ||
  "/downloads/ames-parent.apk";

export function AuthBackdrop({ children }: { children: ReactNode }) {
  return (
    <Stack
      component="main"
      className="font-sans text-[#333]"
      sx={{
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        isolation: "isolate",
        minHeight: "100vh",
        width: "100%",
        overflow: "hidden",
        px: { xs: 2, sm: 3 },
        py: { xs: 12, sm: 14 },
      }}
    >
      <Box
        aria-hidden="true"
        className="absolute inset-0 -z-20 bg-cover bg-center blur-[3px]"
        sx={{
          backgroundImage: `url("${Background}")`,
        }}
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-black/40" />
      <a
        href={parentAppDownloadUrl}
        download="ames-parent.apk"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-4 right-4 z-10 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/95 px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-md backdrop-blur-sm transition hover:bg-white hover:shadow-lg sm:top-6 sm:right-6"
      >
        <AndroidIcon sx={{ fontSize: "1.25rem" }} />
        Download App
      </a>
      {children}
    </Stack>
  );
}
function AuthOutline() {
  return (
    <fieldset
      aria-hidden="true"
      className="pointer-events-none absolute -top-1.25 right-0 bottom-0 left-0 m-0 min-w-0 overflow-hidden rounded-[inherit] border border-black/23 px-2 text-left group-hover/auth-outline:border-[#333] group-focus-within/auth-outline:border-2 group-focus-within/auth-outline:border-[#4543c0]"
    >
      <legend className="float-none w-auto overflow-hidden p-0 leading-[11px]">
        &#8203;
      </legend>
    </fieldset>
  );
}
interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: LegacyIconName;
  compact?: boolean;
  visibilityToggle?: boolean;
}
export function AuthField({
  label,
  icon,
  compact = false,
  visibilityToggle = false,
  type,
  className = "",
  ...props
}: AuthFieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className={`min-w-0 ${className}`}>
      <label
        htmlFor={id}
        className={`block text-left font-bold uppercase text-[#777] ${compact ? "mb-0.5 text-[0.72rem] leading-[1.66]" : "mb-1 text-xs leading-[1.66] tracking-[0.5px]"}`}
      >
        {label}
      </label>
      <div
        className={`group/auth-outline relative flex items-center rounded bg-[#f9fafb] ${visibilityToggle ? "pr-3.5" : ""} ${props.disabled ? "pointer-events-none opacity-60" : ""}`}
      >
        <AuthOutline />
        {icon && (
          <LegacyIcon name={icon} className="mr-2 ml-3.5 size-5 text-[#777]" />
        )}
        <input
          id={id}
          type={visible ? "text" : type}
          className={`min-w-0 flex-1 bg-transparent py-[8.5px] text-base leading-[1.4375] text-[#333] outline-none placeholder:text-[#333]/42 focus-visible:outline-none ${icon ? "pl-0" : "pl-3.5"} ${visibilityToggle ? "pr-0" : "pr-3.5"}`}
          {...props}
        />
        {visibilityToggle && (
          <button
            type="button"
            aria-label={
              visible
                ? `Hide ${label.toLowerCase()}`
                : `Show ${label.toLowerCase()}`
            }
            onClick={() => setVisible(!visible)}
            className="relative ml-2 -mr-0.75 inline-flex items-center rounded-full p-1.25 text-black/54 outline-none hover:bg-black/4 [@media(hover:none)]:hover:bg-transparent focus-visible:outline-none"
          >
            <LegacyIcon
              name={visible ? "VisibilityOff" : "Visibility"}
              className="size-5"
            />
            <LegacyRipple center />
          </button>
        )}
      </div>
    </div>
  );
}
export function AuthButton({
  className = "",
  children,
  kind = "login",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: "login" | "registration" | "security";
}) {
  const styles =
    kind === "login"
      ? "bg-brand py-[9.6px] text-[0.9rem] tracking-[1px] uppercase shadow-[0px_4px_10px_rgba(0,0,0,0.15)] hover:brightness-85 disabled:bg-black/12 disabled:text-black/26"
      : kind === "registration"
        ? "bg-brand py-2 text-sm tracking-[1px] uppercase shadow-[0px_3px_1px_-2px_rgba(0,0,0,0.2),0px_2px_2px_rgba(0,0,0,0.14),0px_1px_5px_rgba(0,0,0,0.12)] hover:brightness-85 disabled:bg-black/12 disabled:text-black/26"
        : "bg-[#059669] py-2.5 text-[0.925rem] tracking-normal normal-case shadow-[0px_3px_1px_-2px_rgba(0,0,0,0.2),0px_2px_2px_rgba(0,0,0,0.14),0px_1px_5px_rgba(0,0,0,0.12)] hover:bg-[#047857] disabled:bg-[#cbd5e1] disabled:text-[#94a3b8]";
  return (
    <button
      type="button"
      className={`relative inline-flex w-full items-center justify-center overflow-hidden rounded-lg px-4 leading-[1.75] font-bold text-white outline-none transition-[background-color,box-shadow,border-color,color] duration-250 hover:shadow-[0px_2px_4px_-1px_rgba(0,0,0,0.2),0px_4px_5px_rgba(0,0,0,0.14),0px_1px_10px_rgba(0,0,0,0.12)] active:shadow-[0px_5px_5px_-3px_rgba(0,0,0,0.2),0px_8px_10px_1px_rgba(0,0,0,0.14),0px_3px_14px_2px_rgba(0,0,0,0.12)] focus-visible:shadow-[0_3px_5px_-1px_rgba(0,0,0,0.2),0_6px_10px_rgba(0,0,0,0.14),0_1px_18px_rgba(0,0,0,0.12)] focus-visible:outline-none [@media(hover:none)]:hover:shadow-[0px_3px_1px_-2px_rgba(0,0,0,0.2),0px_2px_2px_rgba(0,0,0,0.14),0px_1px_5px_rgba(0,0,0,0.12)] disabled:pointer-events-none disabled:shadow-none disabled:brightness-100 ${styles} ${className}`}
      {...props}
    >
      {children}
      <LegacyRipple />
    </button>
  );
}
export function AuthAlert({
  children,
  tone = "error",
  compact = false,
}: {
  children: ReactNode;
  tone?: "error" | "success" | "warning";
  compact?: boolean;
}) {
  if (!children) return null;
  const styles = {
    error: "bg-[#fdeded] text-[#5f2120]",
    success: "bg-[#edf7ed] text-[#1e4620]",
    warning: "bg-[#fff4e5] text-[#663c00]",
  };
  const icons: Record<typeof tone, LegacyIconName> = {
    error: "ErrorOutline",
    success: "SuccessOutlined",
    warning: "WarningAmber",
  };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex w-full rounded-lg px-4 text-left ${compact ? "mb-2.5 py-0.5 text-[0.8rem]" : "mb-4 py-1.5 text-sm"} leading-[1.43] ${styles[tone]}`}
    >
      <LegacyIcon
        name={icons[tone]}
        className={`mr-3 my-[7px] size-[22px] opacity-90 ${tone === "error" ? "text-[#d32f2f]" : tone === "success" ? "text-[#2e7d32]" : "text-[#ed6c02]"}`}
      />
      <div className="min-w-0 py-2">{children}</div>
    </div>
  );
}
interface OtpFieldsProps {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}
export function OtpFields({
  value,
  onChange,
  compact = false,
  disabled = false,
  autoFocus = false,
}: OtpFieldsProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const update = (index: number, text: string) => {
    if (!/^\d*$/.test(text)) return;
    if (text.length > 1) {
      const start = text.length >= 6 ? 0 : index;
      const digits = Array.from({ length: 6 }, (_, i) => value[i] || " ");
      const pasted = text.slice(0, 6 - start);
      Array.from(pasted).forEach((digit, offset) => {
        digits[start + offset] = digit;
      });
      onChange(digits.join("").trimEnd());
      refs.current[Math.min(start + pasted.length, 5)]?.focus();
      return;
    }
    const digits = Array.from({ length: 6 }, (_, i) => value[i] || " ");
    digits[index] = text || " ";
    onChange(digits.join("").trimEnd());
    if (text && index < 5) refs.current[index + 1]?.focus();
  };
  return (
    <fieldset
      aria-label="6-digit verification code"
      disabled={disabled}
      className={`flex min-w-0 justify-center gap-2 ${compact ? "mb-5" : "mb-6"}`}
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className={`group/auth-outline relative min-w-0 rounded bg-[#f9fafb] ${compact ? "w-11" : "w-12"}`}
        >
          <AuthOutline />
          <input
            ref={(el) => {
              refs.current[index] = el;
            }}
            aria-label={`Verification digit ${index + 1}`}
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={6}
            autoFocus={autoFocus && index === 0}
            value={value[index]?.trim() || ""}
            onFocus={(e) => e.target.select()}
            onChange={(e) => update(index, e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text").trim();
              if (/^\d+$/.test(text)) {
                e.preventDefault();
                update(index, text);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace") {
                e.preventDefault();
                const target =
                  value[index]?.trim() || index === 0 ? index : index - 1;
                update(target, "");
                refs.current[target]?.focus();
              } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                refs.current[
                  Math.max(
                    0,
                    Math.min(5, index + (e.key === "ArrowLeft" ? -1 : 1)),
                  )
                ]?.focus();
              }
            }}
            className={`w-full min-w-0 rounded bg-transparent px-0 text-center font-bold text-[#333] outline-none focus-visible:outline-none ${compact ? "py-2 text-[1.4rem] leading-[1.4375]" : "py-2.5 text-2xl leading-[1.4375]"}`}
          />
        </div>
      ))}
    </fieldset>
  );
}
export function PasswordCriteria({
  value,
  compact = false,
}: {
  value: string;
  compact?: boolean;
}) {
  const criteria = [
    { label: "Minimum 8 characters", met: value.length >= 8 },
    { label: "At least one uppercase letter (A-Z)", met: /[A-Z]/.test(value) },
    { label: "At least one lowercase letter (a-z)", met: /[a-z]/.test(value) },
    { label: "At least one number", met: /[0-9]/.test(value) },
    {
      label: "Maximum 72 UTF-8 bytes",
      met: new TextEncoder().encode(value).length <= 72,
    },
  ];
  return (
    <div
      className={`rounded-lg border border-[#e2e8f0] bg-[#f8fafc] text-left ${compact ? "mb-2 px-2.5 py-1.5" : "mt-2 p-4"}`}
    >
      <p
        className={`block font-bold text-[#475569] ${compact ? "mb-1 text-[0.72rem] leading-[1.66]" : "mb-2 text-xs leading-[1.66] tracking-[0.05em]"}`}
      >
        {compact ? "PASSWORD REQUIREMENTS:" : "PASSWORD SECURITY CRITERIA:"}
      </p>
      <div className={compact ? "grid gap-1.5 legacy-sm:grid-cols-2" : ""}>
        {criteria.map(({ label, met }) => (
          <div
            key={label}
            className={`flex items-center transition-colors duration-200 ${compact ? "gap-1" : "mb-1.5 gap-2"}`}
          >
            <LegacyIcon
              name={met ? "CheckCircle" : "Cancel"}
              className={`${compact ? "size-3.5" : "size-4.5"} ${met ? "text-[#059669]" : "text-[#94a3b8]"}`}
            />
            <span
              className={`${compact ? "text-[0.72rem] leading-[1.2]" : "text-[0.825rem] leading-[1.43]"} ${met ? "font-semibold text-[#059669]" : "font-normal text-[#64748b]"}`}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
