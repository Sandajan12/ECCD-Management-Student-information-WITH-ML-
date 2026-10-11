// Visual source: legacy pages/chairman/SystemSettings.jsx.
import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import type { SystemSettings } from "../../context/SettingsContext";
import API, { downloadFile, errorMessage } from "../../services/api";
import { useDurableForm } from "../../utils/drafts";
import { useSessionField } from "../../utils/sessionDrafts";
import { useDurableFile } from "../../utils/fileDrafts";
import type { SessionResponse } from "../../types";
import {
  Button,
  Field,
  Modal,
  Notice,
  Select,
} from "../../components/chairman/ui";
import Icon from "../../components/chairman/Icon";
import LegacyIcon from "../../components/LegacyIcon";
import { passwordValid } from "../../components/ForceChangePassword";
// Visual source: legacy components/PasswordValidator.jsx.
function ChairmanPasswordRequirements({ password }: { password: string }) {
  const rules = [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "At least one uppercase letter", met: /[A-Z]/.test(password) },
    { label: "At least one lowercase letter", met: /[a-z]/.test(password) },
    { label: "At least one number", met: /[0-9]/.test(password) },
    {
      label: "Maximum 72 UTF-8 bytes",
      met: new TextEncoder().encode(password).length <= 72,
    },
  ];
  return (
    <div className="mt-2 mb-4 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-3">
      <p className="mb-2 text-xs font-bold leading-[1.66] text-[#64748b]">
        Password Requirements:
      </p>
      {rules.map((rule) => (
        <div key={rule.label} className="mb-1 flex items-center gap-2">
          <LegacyIcon
            name={rule.met ? "CheckCircle" : "Cancel"}
            className={`size-4 shrink-0 ${rule.met ? "text-[#2e7d32]" : "text-black/38"}`}
          />
          <span
            className={`text-[12.8px] leading-[1.43] ${rule.met ? "text-[#2e7d32] line-through" : "text-[#777]"}`}
          >
            {rule.label}
          </span>
        </div>
      ))}
    </div>
  );
}
function AccountSettings() {
  const chairman = true;
  const { user, login } = useAuth();
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
    <section className="mx-auto mt-12 mb-8 max-w-[900px]">
      <h2 className="mb-1 text-2xl font-extrabold leading-[1.334] text-[#111827]">
        Account Settings
      </h2>
      <p className="mb-6 text-base leading-[1.5] text-[#777]">
        Update your email and password
      </p>
      <Notice tone="error">{error}</Notice>
      <Notice tone="success">{message}</Notice>
      <form
        className="chairman-card legacy-md:p-10"
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
        <div className="grid grid-cols-1 gap-8 legacy-md:grid-cols-2">
          <Field
            label="Current Password (Required):"
            containerClassName="[&_label]:text-sm [&_label]:leading-[1.43] [&_label]:text-[#111827] pb-2"
            className="rounded-lg"
            type="password"
            placeholder="Enter current password to save"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              setChallenge("");
            }}
          />
          <Field
            label="New Email (Optional):"
            containerClassName="[&_label]:text-sm [&_label]:leading-[1.43] [&_label]:text-[#111827] pb-2"
            className="rounded-lg"
            type="email"
            placeholder="Enter new email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setChallenge("");
            }}
          />
          <Field
            label="New Password (Optional):"
            containerClassName="[&_label]:text-sm [&_label]:leading-[1.43] [&_label]:text-[#111827] pb-2"
            className="rounded-lg"
            type="password"
            placeholder="Enter new password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setChallenge("");
            }}
          />
          <Field
            label="Confirm New Password:"
            containerClassName="[&_label]:text-sm [&_label]:leading-[1.43] [&_label]:text-[#111827] pb-2"
            className="rounded-lg"
            type="password"
            placeholder="Confirm new password"
            autoComplete="new-password"
            required={!!password}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <ChairmanPasswordRequirements password={password} />
          <div className="hidden legacy-md:block" />
          <div>
            <Button
              type="submit"
              className="mt-2 bg-brand px-10 font-bold shadow-none"
              disabled={
                busy ||
                !current ||
                (!!password &&
                  (!passwordValid(password) || password !== confirm)) ||
                (!password && !email.trim())
              }
            >
              {busy ? "Saving..." : "Update Account"}
            </Button>
          </div>
          <div className="hidden legacy-md:block" />
        </div>
        {challenge && (
          <Modal
            title="Email Verification"
            size="xs"
            className="rounded-xl p-2"
            titleClassName="justify-center [&_h2]:font-bold"
            onClose={() => setChallenge("")}
            closeButton
          >
            <p className="mb-6 text-center text-sm text-[#777]">
              An OTP has been sent to {email}. Please enter it below to verify
              your new email address.
            </p>
            <Field
              aria-label="Email verification code"
              placeholder="Enter 6-digit OTP"
              inputMode="numeric"
              maxLength={6}
              pattern="[0-9]{6}"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
            />
            <Button
              className="mt-6 w-full bg-brand font-bold"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await commit(challenge);
                } catch (err) {
                  setError(errorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Verifying..." : "Verify & Save"}
            </Button>
            <Notice tone="error">{error}</Notice>
          </Modal>
        )}
      </form>
    </section>
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
    <>
      <Notice tone="error">{error}</Notice>
      <Notice tone="success">{message}</Notice>
      <form
        className="chairman-card mx-auto max-w-[900px] legacy-md:p-10"
        onSubmit={async (event) => {
          event.preventDefault();
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
        <div className="grid grid-cols-1 gap-8 legacy-md:grid-cols-2">
          <div className="flex flex-col legacy-lg:border-r legacy-lg:border-[#e5e7eb] legacy-lg:pr-8">
            <p className="mb-6 text-sm font-bold leading-[1.57] tracking-[1px] text-[#9ca3af]">
              IDENTITY
            </p>
            <Field
              label="School Name:"
              placeholder="e.g. APOLINARIO MABINI ELEMENTARY SCHOOL"
              containerClassName="mb-6 [&_label]:text-sm [&_label]:leading-[1.43] [&_label]:text-[#111827]"
              className="rounded-lg"
              maxLength={255}
              value={values.school_name}
              required
              onChange={(e) =>
                change({ ...values, school_name: e.target.value })
              }
            />
            <Field
              label="Principal / School Head Name:"
              placeholder="e.g. REXIE M. CASTRO"
              containerClassName="mb-6 [&_label]:text-sm [&_label]:leading-[1.43] [&_label]:text-[#111827]"
              className="rounded-lg"
              maxLength={255}
              value={values.principal_name}
              onChange={(e) =>
                change({ ...values, principal_name: e.target.value })
              }
            />
            <p className="mb-2 text-sm font-bold leading-[1.43] text-[#111827]">
              Portal Logo:
            </p>
            <div className="mb-auto flex items-center gap-4">
              <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#e5e7eb] bg-[#f3f4f6]">
                {values.existing_logo_url ? (
                  <img
                    alt="School logo preview"
                    src={values.existing_logo_url}
                    className="size-full object-cover"
                  />
                ) : (
                  <Icon
                    name="InsertPhotoOutlined"
                    className="size-6 text-[#9ca3af]"
                  />
                )}
              </div>
              <label className="relative inline-flex cursor-pointer items-center rounded-lg border border-[#eef2ff] bg-[#eef2ff] px-[15px] py-[5px] text-sm font-bold leading-[1.75] text-[#4f46e5] hover:border-[#e0e7ff] hover:bg-[#e0e7ff]">
                <Icon name="FileUploadOutlined" className="mr-2 -ml-1 size-5" />
                Upload New Logo
                <input
                  aria-label="School logo"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) =>
                    chooseImage(e.target.files?.[0], "existing_logo_url")
                  }
                />
              </label>
            </div>
            <Button
              type="submit"
              className="mt-12 w-fit bg-brand px-10 font-bold shadow-none"
              disabled={busy}
            >
              {busy ? "Saving..." : "Save"}
            </Button>
          </div>
          <div className="legacy-lg:pl-8">
            <p className="mb-6 text-sm font-bold leading-[1.57] tracking-[1px] text-[#9ca3af]">
              COLOR THEME
            </p>
            <p className="mb-4 text-sm leading-[1.43] text-[#111827]">
              Select the color for the system
            </p>
            <div className="flex flex-wrap items-center gap-4">
              {["#2563EB", "#059669", "#E11D48", "#EA580C"].map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Select ${color} theme`}
                  aria-pressed={
                    values.primary_color.toLowerCase() === color.toLowerCase()
                  }
                  className="flex size-12 items-center justify-center rounded-full text-white transition-transform duration-200 hover:scale-110"
                  style={{ backgroundColor: color }}
                  onClick={() => change({ ...values, primary_color: color })}
                >
                  {values.primary_color.toLowerCase() ===
                    color.toLowerCase() && <Icon name="Check" />}
                </button>
              ))}
              <div className="mt-4 flex items-center gap-3 legacy-sm:mt-0 legacy-sm:ml-4 legacy-sm:border-l legacy-sm:border-[#e5e7eb] legacy-sm:pl-6">
                <span className="text-sm font-bold text-[#6b7280]">
                  Custom:
                </span>
                <div className="relative flex size-12 overflow-hidden rounded-full border border-[#e5e7eb]">
                  <input
                    aria-label="Primary color"
                    type="color"
                    value={values.primary_color}
                    onChange={(e) =>
                      change({ ...values, primary_color: e.target.value })
                    }
                    className="-m-[50%] h-[200%] w-[200%] shrink-0 cursor-pointer border-0"
                  />
                  <Icon
                    name="EditOutlined"
                    className="pointer-events-none absolute top-1/2 left-1/2 size-[19.2px] -translate-1/2 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.5)]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
      <details className="mx-auto mt-6 max-w-[900px] order-last text-sm text-[#777]">
        <summary className="cursor-pointer">
          Additional appearance settings
        </summary>
        <div className="chairman-card mt-4 space-y-4">
          <Field
            label="System title"
            value={values.system_title}
            onChange={(e) =>
              change({ ...values, system_title: e.target.value })
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
          <Field
            label="Profile image"
            type="file"
            accept="image/*"
            onChange={(e) =>
              chooseImage(e.target.files?.[0], "existing_profile_pic_url")
            }
          />
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await save("/api/settings/update", "put");
                if (result === "saved") await fetchGlobalSettings();
                setMessage(
                  result === "saved"
                    ? "School settings saved."
                    : "Saved for reconnection.",
                );
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save school settings
          </Button>
          <Field
            label="Login background image"
            type="file"
            accept="image/*"
            onChange={(e) => setBackground(e.target.files?.[0] || null)}
          />
          {background && <p>Selected image: {background.name}</p>}
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
      </details>
    </>
  );
}
export default function SystemSettings() {
  const { settings, fetchGlobalSettings } = useSettings();
  const opening = useDurableForm("chairman_rollover_month", {
    school_year_start_month: settings.school_year_start_month,
  });
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
            ? {
                school_year_start_month: opening.values.school_year_start_month,
              }
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
  const currentYear = settings.current_school_year || "2026-2027";
  const yearStart = Number(currentYear.split("-")[0]);
  const nextYear = `${yearStart + 1}-${yearStart + 2}`;
  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(2026, i, 1).toLocaleString("en", { month: "long" }),
  }));
  return (
    <div className="flex min-h-[85vh] flex-col p-6 [&>section]:w-full [&>div]:w-full">
      <div className="mx-auto mb-8 max-w-[900px]">
        <h1 className="mb-1 text-[34px] font-extrabold leading-[1.235] text-[#111827]">
          System Personalization
        </h1>
        <p className="text-base leading-[1.5] text-[#777]">
          Manage system appearance
        </p>
      </div>
      <div className="mx-auto max-w-[900px]">
        <Notice tone="error">{error}</Notice>
        <Notice tone="success">{message}</Notice>
      </div>
      {ready && <SchoolBranding initial={settings} />}
      <AccountSettings />
      <section className="mx-auto mt-12 mb-8 max-w-[900px]">
        <h2 className="mb-1 text-2xl font-extrabold leading-[1.334] text-[#111827]">
          Data Backup & Restore
        </h2>
        <p className="mb-6 text-base leading-[1.5] text-[#777]">
          Securely Download or Restore System
        </p>
        <div className="chairman-card grid grid-cols-1 gap-8 legacy-md:grid-cols-2 legacy-md:p-10">
          <div>
            <p className="mb-6 text-sm font-bold leading-[1.57] tracking-[1px] text-[#9ca3af]">
              ENCRYPTED EXPORT
            </p>
            <p className="mb-4 text-sm leading-[1.43] text-[#111827]">
              Generate and download an AES-256 encrypted backup of the entire
              school database
            </p>
            <Button
              className="mt-4 bg-brand px-6 font-bold shadow-none"
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
              Download Encrypted Backup
            </Button>
          </div>
          <div>
            <p className="mb-6 text-sm font-bold leading-[1.57] tracking-[1px] text-[#9ca3af]">
              SYSTEM RESTORE
            </p>
            <p className="mb-4 text-sm leading-[1.43] text-[#111827]">
              Upload a previously generated `.enc` backup file to restore school
              data. Current accounts, passwords, roles and suspension decisions
              are preserved. Referenced accounts must already exist.
              <strong>Warning: This action overwrites current data.</strong>
            </p>
            <div className="flex flex-col items-start gap-4">
              <label className="relative inline-flex cursor-pointer rounded-lg border border-[#e5e7eb] px-[15px] py-[5px] text-sm font-bold leading-[1.75] text-[#4b5563]">
                {restore ? restore.name : "Choose Backup File"}
                <input
                  className="sr-only"
                  aria-label="Restore .enc backup"
                  accept=".enc,.bak"
                  type="file"
                  onChange={(e) => setRestore(e.target.files?.[0] || null)}
                />
              </label>
              <Button
                variant="danger"
                className="px-8 font-bold shadow-none"
                disabled={!restore || busy}
                onClick={() => setConfirmation("restore")}
              >
                Restore System
              </Button>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto mt-12 mb-8 max-w-[900px]">
        <h2 className="mb-1 text-2xl font-extrabold leading-[1.334] text-[#111827]">
          School Year Management
        </h2>
        <p className="mb-6 text-base leading-[1.5] text-[#777]">
          Advance the system to a new school year
        </p>
        <div className="chairman-card legacy-md:p-10">
          <div className="mb-6 grid grid-cols-1 items-center gap-6 rounded-xl border border-gray-100 bg-gray-50 p-4 md:grid-cols-2">
            <div>
              <span className="text-xs font-semibold tracking-wider text-gray-400 uppercase">
                Active School Year
              </span>
              <div className="mt-1 text-3xl font-extrabold text-blue-600">
                {currentYear}
              </div>
            </div>
            <div>
              <label
                htmlFor="chairman-opening-month"
                className="mb-1 block text-xs font-semibold tracking-wider text-gray-500 uppercase"
              >
                School Year Opening Month
              </label>
              <select
                id="chairman-opening-month"
                value={opening.values.school_year_start_month}
                onChange={(e) =>
                  opening.change({
                    school_year_start_month: Number(e.target.value),
                  })
                }
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {months.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label} ({month.value})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-gray-400">
                Beginning of School Year (BOSY) baseline for pupil decimal age
                calculations.
              </p>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-5">
            <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
              <div className="max-w-xl flex-1">
                <span className="mb-1 block text-xs font-semibold tracking-wider text-gray-400 uppercase">
                  System Rollover
                </span>
                <p className="text-sm leading-relaxed text-gray-500">
                  Advancing the school year will permanently archive all current
                  active students, reset communications, and advance the school
                  year to <strong>{nextYear}</strong> with the selected opening
                  month.
                </p>
              </div>
              <Button
                variant="danger"
                className="w-full shrink-0 px-7 py-[9.6px] font-bold whitespace-nowrap shadow-none md:w-auto"
                disabled={busy}
                onClick={() => setConfirmation("rollover")}
              >
                Advance System to {nextYear}
              </Button>
            </div>
            {settings.canRevertSchoolYear && (
              <div className="mt-5 flex flex-col items-start justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4 md:flex-row md:items-center">
                <div>
                  <p className="text-xs font-bold tracking-wider text-amber-800 uppercase">
                    Rollover Grace Period Active{" "}
                    <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-[11px] text-amber-900">
                      {settings.daysRemaining} days left
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-amber-900/90">
                    You can revert this rollover to restore students and data
                    back to <strong>{settings.previous_school_year}</strong>.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  className="w-full border-[#f59e0b] bg-white px-6 py-2 font-bold text-[#b45309] md:w-auto"
                  disabled={busy}
                  onClick={() => setConfirmation("undo")}
                >
                  Revert to {settings.previous_school_year}
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>
      {confirmation && (
        <Modal
          title={
            confirmation === "restore"
              ? "WARNING: SYSTEM RESTORE"
              : confirmation === "undo"
                ? "REVERT SYSTEM ROLLOVER"
                : "WARNING: SYSTEM ROLLOVER"
          }
          size="xs"
          className={`rounded-xl p-2 ${confirmation === "rollover" ? "max-w-[460px]" : confirmation === "undo" ? "max-w-[420px]" : "max-w-[400px]"}`}
          titleClassName={`justify-center [&_h2]:font-bold ${confirmation === "undo" ? "text-[#ed6c02]" : "text-[#d32f2f]"}`}
          bodyClassName="pb-6"
          locked={busy}
          onClose={() => setConfirmation(null)}
        >
          <p
            className={`mb-6 text-sm leading-[1.43] text-[#777] ${confirmation === "rollover" ? "" : "text-center"}`}
          >
            {confirmation === "restore" ? (
              "Restoring replaces school records and clears verification codes and remembered devices. Current accounts, passwords, roles and suspension decisions are preserved. Accounts referenced by the backup must already exist. Unbacked-up school progress will be lost."
            ) : confirmation === "undo" ? (
              `This will restore the active school year to ${settings.previous_school_year}, restoring only students and messages archived by this rollover. You have ${settings.daysRemaining} days remaining in your 30-day grace period. Do you wish to proceed?`
            ) : (
              <>
                This will archive all current active students, reset all
                parent-teacher communications, and advance the school year to{" "}
                <strong>{nextYear}</strong>.
              </>
            )}
          </p>
          {confirmation === "rollover" && (
            <div className="mb-6 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-4">
              <p className="mb-2 text-sm font-bold text-[#111827]">
                Opening Month for Upcoming SY ({nextYear}):
              </p>
              <Select
                label="Upcoming Opening Month"
                value={opening.values.school_year_start_month}
                onChange={(e) =>
                  opening.change({
                    school_year_start_month: Number(e.target.value),
                  })
                }
              >
                {months.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label} ({month.value})
                  </option>
                ))}
              </Select>
              <p className="mt-2 text-xs text-[#6b7280]">
                Used as the BOSY baseline for pupil age calculations in the new
                academic year.
              </p>
            </div>
          )}
          <Notice tone="error">{error}</Notice>
          <div
            className={`flex gap-4 ${confirmation === "rollover" ? "justify-end" : "justify-center"}`}
          >
            <Button
              variant="secondary"
              className="border-[#e5e7eb] font-bold text-[#4b5563]"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              className={`font-bold ${confirmation === "undo" ? "bg-[#ed6c02]" : ""}`}
              disabled={busy}
              onClick={() => void confirm()}
            >
              {busy
                ? "Processing..."
                : confirmation === "restore"
                  ? "Yes, Overwrite Data"
                  : confirmation === "undo"
                    ? "Yes, Revert School Year"
                    : "Yes, Advance Year"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
