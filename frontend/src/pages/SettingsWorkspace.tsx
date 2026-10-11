import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import type { SystemSettings } from "../context/SettingsContext";
import API, { downloadFile, errorMessage } from "../services/api";
import { useDurableForm } from "../utils/drafts";
import { useSessionField } from "../utils/sessionDrafts";
import { useDurableFile } from "../utils/fileDrafts";
import type { Permissions, SessionResponse } from "../types";
import { PERMISSION_LABELS } from "../types";
import {
  Button,
  Field,
  Modal,
  Notice,
  PageHeader,
  Select,
} from "../components/ui";
import {
  passwordValid,
  PasswordRules,
} from "../components/ForceChangePassword";
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
export function TeacherSettings() {
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
interface BrandingFields {
  school_name: string;
  principal_name: string;
  system_title: string;
  primary_color: string;
  secondary_color: string;
  school_year_start_month: number;
  existing_logo_url: string;
  existing_profile_pic_url: string;
}
function SchoolBranding({ initial }: { initial: SystemSettings }) {
  const { fetchGlobalSettings } = useSettings();
  const { values, change, save } = useDurableForm<BrandingFields>(
    "school_settings",
    {
      school_name: initial.school_name,
      principal_name: initial.principal_name || "",
      system_title: initial.system_title,
      primary_color: initial.primary_color,
      secondary_color: initial.secondary_color,
      school_year_start_month: initial.school_year_start_month,
      existing_logo_url: initial.logo_url || "",
      existing_profile_pic_url: initial.profile_pic_url || "",
    },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const {
    file: background,
    choose: setBackground,
    upload: uploadBackground,
  } = useDurableFile("login_background");
  const chooseImage = (
    file: File | undefined,
    key: "existing_logo_url" | "existing_profile_pic_url",
  ) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => change({ ...values, [key]: String(reader.result) });
    reader.readAsDataURL(file);
  };
  return (
    <section className="card">
      <h2 className="mb-5 text-lg font-semibold">
        School identity & appearance
      </h2>
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const result = await save("/api/settings/update", "put");
            setMessage(
              result === "saved"
                ? "School settings saved."
                : "Saved for reconnection.",
            );
            if (result === "saved") await fetchGlobalSettings();
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="School name"
            maxLength={255}
            value={values.school_name}
            onChange={(e) => change({ ...values, school_name: e.target.value })}
            required
          />
          <Field
            label="Principal name"
            maxLength={255}
            value={values.principal_name}
            onChange={(e) =>
              change({ ...values, principal_name: e.target.value })
            }
          />
          <Field
            label="System title"
            maxLength={255}
            value={values.system_title}
            onChange={(e) =>
              change({ ...values, system_title: e.target.value })
            }
            required
          />
          <Select
            label="School year opening month"
            value={values.school_year_start_month}
            onChange={(e) =>
              change({
                ...values,
                school_year_start_month: Number(e.target.value),
              })
            }
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i + 1}>
                {new Date(2026, i, 1).toLocaleString("en", { month: "long" })}
              </option>
            ))}
          </Select>
          <Field
            label="Primary color"
            type="color"
            value={values.primary_color}
            onChange={(e) =>
              change({ ...values, primary_color: e.target.value })
            }
          />
          <Field
            label="Secondary color"
            type="color"
            value={values.secondary_color}
            onChange={(e) =>
              change({ ...values, secondary_color: e.target.value })
            }
          />
          <div>
            {values.existing_logo_url && (
              <img
                alt="School logo preview"
                className="mb-3 size-16 rounded-xl object-cover"
                src={values.existing_logo_url}
              />
            )}
            <Field
              label="School logo"
              type="file"
              accept="image/*"
              onChange={(e) =>
                chooseImage(e.target.files?.[0], "existing_logo_url")
              }
            />
          </div>
          <div>
            {values.existing_profile_pic_url && (
              <img
                alt="Profile image preview"
                className="mb-3 size-16 rounded-full object-cover"
                src={values.existing_profile_pic_url}
              />
            )}
            <Field
              label="Profile image"
              type="file"
              accept="image/*"
              onChange={(e) =>
                chooseImage(e.target.files?.[0], "existing_profile_pic_url")
              }
            />
          </div>
        </div>
        <Button type="submit" disabled={busy}>
          Save school settings
        </Button>
      </form>
      <div className="mt-6 space-y-4 border-t border-slate-100 pt-5">
        <Field
          label="Login background image"
          type="file"
          accept="image/*"
          onChange={(e) => setBackground(e.target.files?.[0] || null)}
        />
        {background && (
          <p className="text-sm text-slate-500">
            Selected image: {background.name}
          </p>
        )}
        <Button
          variant="secondary"
          disabled={!background || busy}
          onClick={async () => {
            if (!background) return;
            setBusy(true);
            try {
              const result = await uploadBackground<{ message: string }>(
                "/api/settings/upload-background",
              );
              if (result) await fetchGlobalSettings();
              setMessage(
                result
                  ? "Login background updated."
                  : "Image saved on this device and queued for reconnection.",
              );
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          Upload background
        </Button>
      </div>
    </section>
  );
}
export function ChairmanSettings() {
  const { settings, fetchGlobalSettings } = useSettings();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const {
    file: restore,
    choose: setRestore,
    confirm: confirmRestore,
    revision: restoreRevision,
  } = useDurableFile("backup_restore");
  const [confirmation, setConfirmation] = useState<
    "rollover" | "undo" | "restore" | null
  >(null);
  useEffect(() => {
    void fetchGlobalSettings()
      .then(() => setReady(true))
      .catch((err) => setError(errorMessage(err)));
    const synced = () => void fetchGlobalSettings();
    window.addEventListener("ames-record-synced", synced);
    return () => window.removeEventListener("ames-record-synced", synced);
  }, [fetchGlobalSettings]);
  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      if (confirmation === "restore") {
        if (!restore) return;
        const form = new FormData();
        const version = restoreRevision.current;
        form.append("file", restore);
        await API.post("/api/backup/restore", form, { timeout: 120000 });
        await confirmRestore(version);
        setMessage(
          "Backup restored successfully. School records have been refreshed.",
        );
      } else {
        const res = await API.post<{ message: string }>(
          confirmation === "undo"
            ? "/api/chairman/undo-rollover"
            : "/api/chairman/rollover-year",
          confirmation === "rollover"
            ? { school_year_start_month: settings.school_year_start_month }
            : {},
        );
        setMessage(res.data.message);
      }
      setConfirmation(null);
      await fetchGlobalSettings();
      window.dispatchEvent(new Event("ames-record-synced"));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        title="System Settings"
        subtitle="Manage school identity, account security, backups, and academic years."
      />
      <div className="mb-5 space-y-3">
        <Notice tone="error">{error}</Notice>
        <Notice tone="success">{message}</Notice>
      </div>
      <div className="space-y-6">
        {ready && <SchoolBranding initial={settings} />}
        <AccountSettings chairman />
        <section className="card">
          <h2 className="mb-2 text-lg font-semibold">Backup & restore</h2>
          <p className="mb-5 text-sm leading-6 text-slate-500">
            Download an encrypted .enc school-data backup. Restoring validates
            all records together and preserves your existing account
            credentials.
          </p>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await downloadFile("/api/backup/export", "AMES_Backup.enc");
                    setMessage("Encrypted backup downloaded.");
                  } catch (err) {
                    setError(errorMessage(err));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Download encrypted backup
              </Button>
            </div>
            <div className="space-y-4">
              <Field
                label="Restore .enc backup"
                type="file"
                accept=".enc"
                onChange={(e) => setRestore(e.target.files?.[0] || null)}
              />
              {restore && (
                <p className="break-words text-sm text-slate-500">
                  Selected backup: {restore.name}
                </p>
              )}
              <Button
                variant="danger"
                disabled={!restore || busy}
                onClick={() => setConfirmation("restore")}
              >
                Restore backup
              </Button>
            </div>
          </div>
        </section>
        <section className="card">
          <h2 className="mb-2 text-lg font-semibold">Academic year rollover</h2>
          <p className="mb-5 text-sm leading-6 text-slate-500">
            Current school year: <strong>{settings.current_school_year}</strong>
            . Rollover archives active students and messages and opens the next
            year. You can undo the exact rollover within 30 days.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button disabled={busy} onClick={() => setConfirmation("rollover")}>
              Start next school year
            </Button>
            {settings.canRevertSchoolYear && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setConfirmation("undo")}
              >
                Undo rollover • {settings.daysRemaining} days remaining
              </Button>
            )}
          </div>
        </section>
      </div>
      {confirmation && (
        <Modal
          title={
            confirmation === "restore"
              ? "Restore school backup?"
              : confirmation === "undo"
                ? "Undo last rollover?"
                : "Start next school year?"
          }
          onClose={() => setConfirmation(null)}
        >
          <p className="text-sm leading-7 text-slate-600">
            {confirmation === "restore"
              ? "This replaces current school records with the selected backup. Download a current backup first if you need to retain the present data."
              : confirmation === "undo"
                ? "Only students and messages archived by the last rollover will be restored. Older archives remain archived."
                : "Active students and current conversations will move to the archive. Their assessment history is retained."}
          </p>
          <Notice tone="error">{error}</Notice>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? "Processing…" : "Confirm"}
          </Button>
        </Modal>
      )}
    </>
  );
}
