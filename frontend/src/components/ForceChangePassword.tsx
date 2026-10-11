import { useState } from "react";
import { useSessionField } from "../utils/sessionDrafts";
import API, { errorMessage } from "../services/api";
import { useAuth } from "../context/AuthContext";
import type { SessionResponse } from "../types";
import { Button, Field, Notice } from "./ui";
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
  const { user, login, logout } = useAuth();
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
    <main className="grid min-h-dvh place-items-center p-4">
      <form
        className="card w-full max-w-lg space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const res = await API.put<SessionResponse>(
              "/api/auth/update-password",
              { newPassword: password, confirmPassword: confirm },
            );
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
        <div className="badge">Welcome to AMES</div>
        <h1 className="text-2xl font-bold">First-time login security setup</h1>
        <p className="text-sm text-slate-500">
          Choose a personal password to replace the temporary password before
          continuing.
        </p>
        <Notice tone="error">{error}</Notice>
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <PasswordRules value={password} />
        <Field
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        <Button
          type="submit"
          className="w-full"
          disabled={busy || !passwordValid(password) || password !== confirm}
        >
          {busy ? "Saving…" : "Save password & continue"}
        </Button>
        <Button
          className="w-full"
          variant="secondary"
          onClick={() => void logout()}
        >
          Sign out
        </Button>
      </form>
    </main>
  );
}
