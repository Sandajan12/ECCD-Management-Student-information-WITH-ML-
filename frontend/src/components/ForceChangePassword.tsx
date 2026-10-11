// Legacy visual source: components/ForceChangePasswordModal.jsx.
import { useEffect, useRef, useState } from "react";
import { useSessionField } from "../utils/sessionDrafts";
import API, { errorMessage } from "../services/api";
import { useAuth } from "../context/AuthContext";
import type { SessionResponse } from "../types";
import { AuthAlert, AuthButton, AuthField, PasswordCriteria } from "./auth-ui";
import LegacyIcon from "./LegacyIcon";
export const passwordValid = (value: string): boolean =>
  value.length >= 8 &&
  /[A-Z]/.test(value) &&
  /[a-z]/.test(value) &&
  /[0-9]/.test(value) &&
  new TextEncoder().encode(value).length <= 72;
export function PasswordRules({ value }: { value: string }) {
  return (
    <p
      className={`text-xs leading-6 ${passwordValid(value) ? "text-emerald-600" : "text-slate-500"}`}
    >
      Use 8 or more characters, an uppercase letter, a lowercase letter, and a
      number. Maximum 72 UTF-8 bytes.
    </p>
  );
}
export default function ForceChangePassword() {
  const { user, login } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    dialog?.focus();
    return () => dialog?.close();
  }, []);
  const [password, setPassword, confirmPasswordDraft] = useSessionField(
    `ames_first_login_password_${user?.id}`,
    "",
  );
  const [confirm, setConfirm, confirmConfirmationDraft] = useSessionField(
    `ames_first_login_confirm_${user?.id}`,
    "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="first-login-title"
      tabIndex={-1}
      onCancel={(e) => e.preventDefault()}
      className="open:flex open:flex-col m-auto max-h-[calc(100dvh-4rem)] w-[calc(100%-4rem)] max-w-[37.5rem] overflow-y-auto rounded-xl border border-[#e2e8f0] bg-white p-2 font-sans text-[#333] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] backdrop:bg-[#0f172a]/75 backdrop:backdrop-blur-[6px] legacy-sm:p-4"
    >
      <header className="shrink-0 px-6 pt-4 pb-2 text-center">
        <div className="mb-2 flex justify-center">
          <div className="grid size-12 place-items-center rounded-full bg-[#ecfdf5] text-[#059669] shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)]">
            <LegacyIcon name="Security" className="size-7" />
          </div>
        </div>
        <h1
          id="first-login-title"
          className="text-2xl leading-[1.334] font-extrabold text-[#0f172a]"
        >
          First-Time Login Security Setup
        </h1>
        <p className="mt-1 text-sm leading-[1.43] text-[#64748b]">
          As a new teacher, you must replace your temporary initial password
          with a secure personal password before continuing.
        </p>
      </header>
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || !passwordValid(password) || password !== confirm) return;
          setBusy(true);
          setError("");
          try {
            const res = await API.put<SessionResponse>(
              "/api/auth/update-password",
              { newPassword: password, confirmPassword: confirm },
            );
            if (!res.data.success)
              throw new Error("Failed to update password.");
            localStorage.removeItem("ames_device_token");
            confirmPasswordDraft();
            confirmConfirmationDraft();
            login(res.data);
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">
          <AuthAlert>{error}</AuthAlert>
          <div className="mt-2">
            <AuthField
              label="New password"
              icon="LockOutlined"
              visibilityToggle
              placeholder="Enter your new secure password"
              className="mb-4 [&_label]:tracking-normal [&_label]:text-[#475569] [&_div]:bg-[#f8fafc] [&_div>svg]:text-[#94a3b8]"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <AuthField
              label="Confirm new password"
              icon="LockOutlined"
              visibilityToggle
              placeholder="Re-enter your new password"
              className="mb-3 [&_label]:tracking-normal [&_label]:text-[#475569] [&_div]:bg-[#f8fafc] [&_div>svg]:text-[#94a3b8]"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            {confirm.length > 0 && (
              <div
                className={`mb-4 flex items-center gap-2 text-xs leading-[1.66] font-semibold ${password === confirm ? "text-[#059669]" : "text-[#dc2626]"}`}
              >
                <LegacyIcon
                  name={password === confirm ? "CheckCircle" : "Cancel"}
                  className="size-4"
                />
                <span>
                  {password === confirm
                    ? "Passwords match"
                    : "Passwords do not match"}
                </span>
              </div>
            )}
            <div className={confirm.length ? "" : "flow-root"}>
              <PasswordCriteria value={password} />
            </div>
            {busy && (
              <div
                role="progressbar"
                aria-label="Saving password"
                className="relative mt-4 h-1 overflow-hidden rounded bg-[#b8b8e7]"
              >
                <span className="legacy-progress-first absolute inset-y-0 w-auto bg-[#4543c0]" />
                <span className="legacy-progress-second absolute inset-y-0 w-auto bg-[#4543c0]" />
              </div>
            )}
          </div>
        </div>
        <div className="shrink-0 px-6 pt-2 pb-6">
          <AuthButton
            type="submit"
            kind="security"
            disabled={busy || !passwordValid(password) || password !== confirm}
          >
            {busy ? "Saving Password..." : "Save Password & Continue"}
          </AuthButton>
        </div>
      </form>
    </dialog>
  );
}
