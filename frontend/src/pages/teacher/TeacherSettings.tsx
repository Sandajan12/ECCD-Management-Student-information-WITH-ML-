import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import API, { errorMessage } from "../../services/api";
import { useDurableForm } from "../../utils/drafts";
import { useSessionField } from "../../utils/sessionDrafts";
import type { Permissions, SessionResponse } from "../../types";
import { PERMISSION_LABELS } from "../../types";
import { Button, Field, Notice, PageHeader } from "../../components/ui";
import {
  passwordValid,
  PasswordRules,
} from "../../components/ForceChangePassword";

function AccountSettings({ chairman }: { chairman: boolean }) {
  const { user, login, logout } = useAuth();
  const prefix = `ames_account_${user?.id}`;
  const [current, setCurrent, confirmCurrent] = useSessionField(
    `${prefix}_current`,
    "",
  );
  const [email, setEmail, confirmEmail] = useSessionField(
    `${prefix}_email`,
    "",
  );
  const [password, setPassword, confirmPasswordDraft] = useSessionField(
    `${prefix}_password`,
    "",
  );
  const [confirm, setConfirm, confirmConfirmation] = useSessionField(
    `${prefix}_confirm`,
    "",
  );
  const [challenge, setChallenge, confirmChallenge] = useSessionField(
    `${prefix}_challenge`,
    "",
  );
  const [otp, setOtp, confirmOtp] = useSessionField(`${prefix}_otp`, "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const commit = async (challengeToken?: string) => {
    const payload = chairman
      ? {
          currentPassword: current,
          ...(email.trim() && { newEmail: email.trim() }),
          ...(password && { newPassword: password, confirmPassword: confirm }),
          ...(challengeToken && { challengeToken, otp }),
        }
      : {
          oldPassword: current,
          newPassword: password,
          confirmPassword: confirm,
          ...(challengeToken && { challengeToken, otp }),
        };
    const res = chairman
      ? await API.put<SessionResponse>("/api/chairman/account", payload)
      : await API.post<SessionResponse>(
          "/api/teachers/change-password-verify",
          payload,
        );
    localStorage.removeItem("ames_device_token");
    login(res.data);
    setCurrent("");
    setPassword("");
    setConfirm("");
    setEmail("");
    setOtp("");
    setChallenge("");
    confirmCurrent();
    confirmEmail();
    confirmPasswordDraft();
    confirmConfirmation();
    confirmChallenge();
    confirmOtp();
    setMessage("Account updated successfully. Your new session is active.");
  };
  return (
    <section className="card">
      <h2 className="mb-2 text-lg font-semibold">Account security</h2>
      <p className="mb-5 break-words text-sm text-slate-500">
        Signed in as {user?.email || user?.username}
      </p>
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setMessage("");
          try {
            if (challenge) await commit(challenge);
            else if (!chairman || email.trim()) {
              const res = await API.post<{ challengeToken?: string }>(
                chairman
                  ? "/api/auth/send-otp"
                  : "/api/teachers/change-password-request",
                chairman
                  ? { email: email.trim(), currentPassword: current }
                  : { oldPassword: current },
              );
              if (res.data.challengeToken) {
                setChallenge(res.data.challengeToken);
                setMessage("A verification code was sent to your email.");
              } else await commit();
            } else await commit();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Notice tone="error">{error}</Notice>
        <Notice tone="success">{message}</Notice>
        <Field
          label="Current password"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => {
            setCurrent(e.target.value);
            setChallenge("");
          }}
        />
        {chairman && (
          <Field
            label="New email (optional)"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setChallenge("");
            }}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={chairman ? "New password (optional)" : "New password"}
            type="password"
            autoComplete="new-password"
            value={password}
            required={!chairman}
            onChange={(e) => {
              setPassword(e.target.value);
              setChallenge("");
            }}
          />
          <Field
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required={!!password}
          />
        </div>
        <PasswordRules value={password} />
        {challenge && (
          <Field
            label="Email verification code"
            inputMode="numeric"
            maxLength={6}
            pattern="[0-9]{6}"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            required
          />
        )}
        <Button
          type="submit"
          disabled={
            busy ||
            (!!password &&
              (!passwordValid(password) || password !== confirm)) ||
            (chairman && !password && !email.trim())
          }
        >
          {busy
            ? "Saving…"
            : challenge
              ? "Verify & save changes"
              : "Save account changes"}
        </Button>
        <Button
          className="ml-2"
          variant="secondary"
          onClick={() => void logout(true)}
        >
          Sign out & forget this device
        </Button>
      </form>
    </section>
  );
}
function ParentPermissionSettings({ initial }: { initial: Permissions }) {
  const { values, change, save } = useDurableForm(
    "parent_permissions",
    initial,
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="card">
      <h2 className="mb-2 text-lg font-semibold">Parent access controls</h2>
      <p className="mb-5 text-sm leading-6 text-slate-500">
        These permissions are inherited by students where you are the active
        Primary Adviser. Substitute assignments retain the Primary Adviser’s
        settings.
      </p>
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const result = await save("/api/teachers/access-controls", "put");
            setMessage(
              result === "saved"
                ? "Parent permissions saved."
                : "Saved on this device. Pending reconnection.",
            );
            setError("");
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Notice tone="error">{error}</Notice>
        <Notice tone="success">{message}</Notice>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(PERMISSION_LABELS) as (keyof Permissions)[]).map(
            (key) => (
              <label
                key={key}
                className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 accent-blue-600"
                  checked={values[key]}
                  onChange={(e) =>
                    change({ ...values, [key]: e.target.checked })
                  }
                />
                <span>{PERMISSION_LABELS[key]}</span>
              </label>
            ),
          )}
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save parent access"}
        </Button>
      </form>
    </section>
  );
}
export default function TeacherSettings() {
  const { user, login, token } = useAuth();
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void API.get<Permissions & { allow_eccd_question_management: boolean }>(
      "/api/teachers/access-controls",
    )
      .then((res) => {
        setPermissions(res.data);
        if (
          user &&
          token &&
          user.allow_eccd_question_management !==
            res.data.allow_eccd_question_management
        )
          login({
            success: true,
            requireOtp: false,
            requiresPasswordChange: false,
            token,
            user: {
              ...user,
              allow_eccd_question_management:
                res.data.allow_eccd_question_management,
            },
          });
      })
      .catch((err) => setError(errorMessage(err)));
  }, [user?.id]);
  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Control parent access and keep your account secure."
      />
      <Notice tone="error">{error}</Notice>
      <div className="space-y-6">
        {permissions && (
          <ParentPermissionSettings
            initial={
              Object.fromEntries(
                (Object.keys(PERMISSION_LABELS) as (keyof Permissions)[]).map(
                  (key) => [key, permissions[key]],
                ),
              ) as unknown as Permissions
            }
          />
        )}
        <AccountSettings chairman={false} />
      </div>
    </>
  );
}
