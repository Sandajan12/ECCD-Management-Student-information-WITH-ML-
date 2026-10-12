import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useTeacher } from "../../context/TeacherContext";
import API, { errorMessage } from "../../services/api";
import { readDraft, useDurableForm } from "../../utils/drafts";
import { useSessionField } from "../../utils/sessionDrafts";
import type { Permissions, SessionResponse } from "../../types";
import { Button, Field, Notice, PageHeader } from "../../components/ui";
import {
  passwordValid,
  PasswordRules,
} from "../../components/ForceChangePassword";
import TeacherDialog from "../../components/teacher/TeacherDialog";
import TeacherSkeleton from "../../components/teacher/TeacherSkeleton";

interface PermissionControl {
  key: keyof Permissions;
  title: string;
  description: string;
  color: string;
}
const profileControls: PermissionControl[] = [
  {
    key: "allow_parent_view_student_info",
    title: "Student Profile Viewing",
    description: "Allow parents to view student information",
    color: "#2563eb",
  },
  {
    key: "allow_parent_edit_student_info",
    title: "Student Profile Editing",
    description: "Allow parents to update child information",
    color: "#9333ea",
  },
];
const assessmentControls: PermissionControl[] = [
  {
    key: "allow_parent_view_eccd_pre",
    title: "Pre-Test Scores Visibility",
    description: "Make Pre-test evaluation results visible",
    color: "#0288d1",
  },
  {
    key: "allow_parent_view_eccd_mid",
    title: "Mid-Test Scores Visibility",
    description: "Make Mid-test evaluation results visible",
    color: "#ed6c02",
  },
  {
    key: "allow_parent_view_eccd_post",
    title: "Post-Test Scores Visibility",
    description: "Make Post-test evaluation results visible",
    color: "#2e7d32",
  },
  {
    key: "allow_parent_edit_home_based_eccd",
    title: "Home-Based Checklist Edit",
    description: "Allow parents to fill out home checklist",
    color: "#2e7d32",
  },
];
interface ParentAccessProps {
  initial: Permissions;
}
function ParentAccess({ initial }: ParentAccessProps) {
  const { values, change, save, key } = useDurableForm(
    "parent_permissions",
    initial,
  );
  const [error, setError] = useState<string>(
    () => readDraft<Permissions>(key)?.error || "",
  );
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const lock = useRef<boolean>(false);
  const persist = async (next: Permissions) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    change(next);
    try {
      const result = await save(
        "/api/teachers/access-controls",
        "put",
        next,
        next,
      );
      setMessage(
        result === "saved"
          ? "Access controls updated."
          : "Saved on this device. Pending reconnection.",
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const controls = (items: PermissionControl[]) => (
    <div className="grid gap-5 legacy-sm:grid-cols-2">
      {items.map((control) => (
        <label
          key={control.key}
          className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-4"
        >
          <span>
            <span className="block text-sm font-bold text-slate-700">
              {control.title}
            </span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">
              {control.description}
            </span>
          </span>
          <span className="relative inline-flex shrink-0">
            <input
              type="checkbox"
              role="switch"
              aria-label={control.title}
              checked={values[control.key]}
              disabled={busy}
              onChange={(e) =>
                void persist({ ...values, [control.key]: e.target.checked })
              }
              className="peer sr-only"
            />
            <span
              className="block h-5 w-10 rounded-full bg-slate-300 transition peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-4 peer-disabled:opacity-50"
              style={
                values[control.key]
                  ? { backgroundColor: control.color }
                  : undefined
              }
            />
            <span
              className={`absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform ${values[control.key] ? "translate-x-[1.375rem]" : "translate-x-0.5"}`}
            />
          </span>
        </label>
      ))}
    </div>
  );
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-extrabold">Global Parent Access</h2>
        <p className="mt-1 text-sm text-slate-500">
          Control what information parents can see or change across all your
          students.
        </p>
      </div>
      <div className="card space-y-5">
        <Notice tone="error">{error}</Notice>
        <Notice tone="success">{message}</Notice>
        <p className="text-xs leading-5 text-slate-500">
          Students inherit these settings from their active Primary Adviser.
          Substitute assignments retain the Primary Adviser’s settings.
        </p>
        <h3 className="font-bold text-slate-700">Student Record Permissions</h3>
        {controls(profileControls)}
        <hr className="border-slate-100" />
        <h3 className="font-bold text-slate-700">
          ECCD Assessment Visibility &amp; Editing
        </h3>
        {controls(assessmentControls)}
        {busy && (
          <p role="status" className="text-xs text-slate-500">
            Saving access controls…
          </p>
        )}
        {error && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void persist(values)}
          >
            Retry changes
          </Button>
        )}
      </div>
    </section>
  );
}
function TeacherAccount() {
  const { user, login, logout } = useAuth();
  const prefix = `ames_account_${user?.id}`;
  const [current, setCurrent, confirmCurrent] = useSessionField<string>(
    `${prefix}_current`,
    "",
  );
  const [password, setPassword, confirmPassword] = useSessionField<string>(
    `${prefix}_password`,
    "",
  );
  const [confirmation, setConfirmation, confirmConfirmation] =
    useSessionField<string>(`${prefix}_confirm`, "");
  const [challenge, setChallenge, confirmChallenge] = useSessionField<string>(
    `${prefix}_challenge`,
    "",
  );
  const [otp, setOtp, confirmOtp] = useSessionField<string>(
    `${prefix}_otp`,
    "",
  );
  const [open, setOpen] = useState<boolean>(!!challenge);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const lock = useRef<boolean>(false);
  const valid =
    !!current && passwordValid(password) && password === confirmation;
  const commit = async (token?: string) => {
    const res = await API.post<SessionResponse>(
      "/api/teachers/change-password-verify",
      {
        oldPassword: current,
        newPassword: password,
        confirmPassword: confirmation,
        ...(token && { challengeToken: token, otp }),
      },
    );
    if (res.status !== 200 && res.status !== 201)
      throw new Error("The server did not confirm this update.");
    localStorage.removeItem("ames_device_token");
    login(res.data);
    setCurrent("");
    setPassword("");
    setConfirmation("");
    setChallenge("");
    setOtp("");
    confirmCurrent();
    confirmPassword();
    confirmConfirmation();
    confirmChallenge();
    confirmOtp();
    setOpen(false);
    setMessage("Password successfully updated! Your new session is active.");
  };
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const requestChallenge = async () => {
    const res = await API.post<{ challengeToken?: string; email?: string }>(
      "/api/teachers/change-password-request",
      { oldPassword: current },
    );
    if (res.data.challengeToken) {
      setChallenge(res.data.challengeToken);
      setOpen(true);
      setMessage("Verification code sent to your email.");
    } else await commit();
  };
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-extrabold">Account Settings</h2>
        <p className="mt-1 text-sm text-slate-500">
          Change or update your account password.
        </p>
      </div>
      <div className="card">
        <Notice tone="error">{error}</Notice>
        <Notice tone="success">{message}</Notice>
        <form
          className="mt-4 grid gap-6 legacy-md:grid-cols-[7fr_5fr]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            if (challenge) setOpen(true);
            else void run(requestChallenge);
          }}
        >
          <fieldset disabled={busy} className="space-y-5">
            <Field
              label="Current Password (Required)"
              type="password"
              autoComplete="current-password"
              required
              placeholder="Enter current password to save"
              value={current}
              onChange={(e) => {
                setCurrent(e.target.value);
                setChallenge("");
              }}
            />
            <Field
              label="New Password"
              type="password"
              autoComplete="new-password"
              required
              placeholder="Enter new password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Field
              label="Confirm New Password"
              type="password"
              autoComplete="new-password"
              required
              placeholder="Confirm new password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
            {confirmation && confirmation !== password && (
              <Notice tone="error">New passwords do not match.</Notice>
            )}
            <Button type="submit" disabled={busy || !valid}>
              {busy
                ? "Saving…"
                : challenge
                  ? "Continue Verification"
                  : "Change Password"}
            </Button>
          </fieldset>
          <div className="legacy-md:pt-20">
            <PasswordRules value={password} />
          </div>
        </form>
        <Button
          className="mt-5"
          variant="secondary"
          disabled={busy}
          onClick={() => void logout(true)}
        >
          Sign out &amp; forget this device
        </Button>
      </div>
      {open && (
        <TeacherDialog
          title="Verification Required"
          locked={busy}
          onClose={() => setOpen(false)}
        >
          <p className="text-sm leading-6 text-slate-500">
            A verification code has been sent to {user?.email || "your email"}.
            Please enter it below to confirm your password change.
          </p>
          <Notice tone="error">{error}</Notice>
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid && /^[0-9]{6}$/.test(otp))
                void run(() => commit(challenge));
            }}
          >
            <Field
              label="Verification Code (OTP)"
              autoFocus
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              disabled={busy}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            />
            <div className="flex flex-wrap justify-end gap-3">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void run(requestChallenge)}
              >
                Resend Code
              </Button>
              <Button
                type="submit"
                className="bg-emerald-600"
                disabled={busy || !valid || !/^[0-9]{6}$/.test(otp)}
              >
                {busy ? "Verifying…" : "Verify & Update"}
              </Button>
            </div>
          </form>
        </TeacherDialog>
      )}
    </section>
  );
}
export default function TeacherSettings() {
  const { user } = useAuth();
  const { sections } = useTeacher();
  const [permissions, setPermissions] = useState<Permissions | null>(
    () =>
      readDraft<Permissions>(`ames_draft_${user?.id}_parent_permissions`)
        ?.values || null,
  );
  const [error, setError] = useState<string>("");
  useEffect(() => {
    let current = true;
    void API.get<Permissions>("/api/teachers/access-controls")
      .then((res) => {
        if (!current) return;
        setPermissions({
          allow_parent_view_student_info:
            res.data.allow_parent_view_student_info,
          allow_parent_view_eccd_pre: res.data.allow_parent_view_eccd_pre,
          allow_parent_view_eccd_mid: res.data.allow_parent_view_eccd_mid,
          allow_parent_view_eccd_post: res.data.allow_parent_view_eccd_post,
          allow_parent_edit_student_info:
            res.data.allow_parent_edit_student_info,
          allow_parent_edit_home_based_eccd:
            res.data.allow_parent_edit_home_based_eccd,
        });
      })
      .catch((err) => {
        if (current) setError(errorMessage(err));
      });
    return () => {
      current = false;
    };
  }, [user?.id]);
  return (
    <div className="mx-auto w-full max-w-[56.25rem] space-y-8 py-4">
      <PageHeader
        title="Settings"
        subtitle="Manage teacher and parent access settings."
      />
      <section className="card flex flex-wrap items-center gap-4">
        <span className="grid size-14 place-items-center rounded-full bg-blue-50 text-xl font-bold text-blue-700">
          {user?.username.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h2 className="font-bold break-words">{user?.username}</h2>
          <p className="text-sm break-words text-slate-500">{user?.email}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {sections.length ? (
              sections.map((s) => (
                <span key={s.section_id} className="badge">
                  {s.section_name}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-500">
                No section assigned.
              </span>
            )}
          </div>
        </div>
      </section>
      <Notice tone="error">{error}</Notice>
      {permissions ? (
        <ParentAccess key={user?.id} initial={permissions} />
      ) : (
        !error && <TeacherSkeleton cards={2} />
      )}
      <TeacherAccount key={user?.id} />
    </div>
  );
}
