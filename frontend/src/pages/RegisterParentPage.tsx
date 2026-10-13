// Legacy visual source: pages/auth/Register.jsx (RegisterParentPage.jsx re-exports it).
import { useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useSessionField } from "../utils/sessionDrafts";
import { useAuth, roleHome } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import API, { errorMessage } from "../services/api";
import type {
  AuthResponse,
  ChallengeResponse,
  SessionResponse,
} from "../types";
import { passwordValid } from "../components/ForceChangePassword";
import {
  AuthBackdrop,
  AuthAlert,
  AuthButton,
  AuthField,
  OtpFields,
  PasswordCriteria,
  RememberDevice,
  fallbackLogo,
} from "../components/auth-ui";
import LegacyRipple from "../components/LegacyRipple";
import LegacyIcon from "../components/LegacyIcon";
export default function RegisterParentPage() {
  const { user, login } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [form, setForm, confirmForm] = useSessionField("ames_registration", {
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirm: "",
    relationship: "Mother",
  });
  const [otp, setOtp, confirmOtp] = useSessionField(
    "ames_registration_otp",
    "",
  );
  const [challenge, setChallenge, confirmChallenge] =
    useSessionField<ChallengeResponse | null>(
      "ames_registration_challenge",
      null,
    );
  const [remember, setRemember, confirmRemember] = useSessionField(
    "ames_registration_remember_device",
    false,
  );
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  if (user) return <Navigate to={roleHome(user.role)} replace />;
  const register = async (): Promise<AuthResponse> =>
    (
      await API.post<AuthResponse>("/api/auth/register-parent", {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        password: form.password,
        relationship: form.relationship,
        rememberDevice: remember,
      })
    ).data;
  const accept = (data: AuthResponse) => {
    if (data.requireOtp) {
      setOtp("");
      setChallenge(data);
      setError(
        data.emailSent
          ? ""
          : data.message ||
              "The email could not be sent. Retry below to recover your registration.",
      );
      setMessage(data.emailSent ? "Verification code sent to your email!" : "");
    } else {
      confirmForm();
      confirmOtp();
      confirmChallenge();
      confirmRemember();
      login(data);
      navigate("/parent/dashboard");
    }
  };
  return (
    <AuthBackdrop>
      <div
        data-auth-card="registration"
        className="mx-auto flex w-full max-w-[37.5rem] flex-col items-center overflow-hidden rounded-xl bg-[rgba(255,255,255,0.98)] px-5 py-5 text-center shadow-[0px_8px_10px_-5px_rgba(0,0,0,0.2),0px_16px_24px_2px_rgba(0,0,0,0.14),0px_6px_30px_5px_rgba(0,0,0,0.12)] backdrop-blur-[10px] legacy-sm:px-8"
      >
        <img
          src={settings.logo_url || fallbackLogo}
          alt="School Emblem"
          className="mb-1.5 size-[2.875rem] rounded-full bg-white object-contain shadow-[0_2px_8px_rgba(0,0,0,0.1)]"
        />
        <h1 className="mb-0.5 text-xl leading-[1.334] font-extrabold tracking-[0.04em] text-brand uppercase">
          Parent Registration
        </h1>
        <p className="mb-3 text-[0.8rem] leading-[1.43] font-medium text-[#777]">
          Create your account to view your child&apos;s milestones
        </p>
        <AuthAlert compact>{error}</AuthAlert>
        <AuthAlert compact tone="success">
          {message}
        </AuthAlert>
        <form
          className="w-full"
          onSubmit={async (e) => {
            e.preventDefault();
            if (submitting.current) return;
            setError("");
            setMessage("");
            if (challenge && !/^\d{6}$/.test(otp)) {
              setError("Please enter the complete 6-digit verification code.");
              return;
            }
            if (!challenge) {
              if (!form.firstName.trim() || !form.lastName.trim()) {
                setError("First and last names are required.");
                return;
              }
              if ([form.firstName, form.lastName].some(name => name.trim().length > 100 || !/^[\p{L}\p{M} .'-]+$/u.test(name.trim()) || !/\p{L}/u.test(name))) {
                setError("Names may contain only letters, spaces, hyphens, apostrophes and periods, up to 100 characters.");
                return;
              }
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) || form.email.trim().length > 100) {
                setError("Please enter a valid email address, up to 100 characters.");
                return;
              }
              if (!passwordValid(form.password) || new TextEncoder().encode(form.password).length > 72) {
                setError("Please satisfy all password requirements. Passwords must not exceed 72 UTF-8 bytes.");
                return;
              }
              if (form.password !== form.confirm) {
                setError("Passwords do not match!");
                return;
              }
            }
            submitting.current = true;
            setBusy(true);
            try {
              accept(
                challenge
                  ? (
                      await API.post<SessionResponse>("/api/auth/verify-otp", {
                        challengeToken: challenge.challengeToken,
                        otp,
                        rememberDevice: remember,
                      })
                    ).data
                  : await register(),
              );
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              submitting.current = false;
              setBusy(false);
            }
          }}
        >
          {challenge ? (
            <>
              <div className="mb-3 flex items-center text-left">
                <button
                  type="button"
                  aria-label="Back to Registration"
                  className="relative mr-2 inline-flex rounded-full p-1.25 text-[#777] outline-none hover:bg-black/4 [@media(hover:none)]:hover:bg-transparent focus-visible:outline-none"
                  onClick={() => setChallenge(null)}
                >
                  <LegacyIcon name="ArrowBack" className="size-5" />
                  <LegacyRipple center />
                </button>
                <span className="text-[0.82rem] leading-[1.43] font-bold text-[#777]">
                  Back to Registration
                </span>
              </div>
              <p className="mb-1 text-xs leading-[1.66] font-bold tracking-[0.5px] text-[#777]">
                6-DIGIT VERIFICATION CODE
              </p>
              <p className="mb-4 text-[0.85rem] leading-[1.5] text-[#4b5563]">
                We sent an activation code to <br />
                <strong>{challenge.email || form.email}</strong>
              </p>
              <OtpFields value={otp} onChange={setOtp} compact />
              <AuthButton type="submit" disabled={busy} kind="registration">
                {busy ? "Verifying..." : "Verify & Activate Account"}
              </AuthButton>
              <button
                type="button"
                disabled={busy}
                className="relative mt-2 w-full rounded-lg px-2 py-1.5 text-sm leading-[1.75] font-medium text-[#4543c0] outline-none hover:bg-[#4543c0]/4 focus-visible:bg-[#4543c0]/12 focus-visible:outline-none disabled:text-black/26"
                onClick={async () => {
                  if (submitting.current) return;
                  submitting.current = true;
                  setError("");
                  setMessage("");
                  setBusy(true);
                  try {
                    accept(await register());
                  } catch (err) {
                    setError(errorMessage(err));
                  } finally {
                    submitting.current = false;
                    setBusy(false);
                  }
                }}
              >
                Resend verification code
                <LegacyRipple />
              </button>
            </>
          ) : (
            <>
              <div className="mb-2.5 grid gap-4 legacy-sm:grid-cols-2">
                <AuthField
                  compact
                  label="First name"
                  name="firstName"
                  placeholder="First Name"
                  value={form.firstName}
                  onChange={(e) =>
                    setForm({ ...form, firstName: e.target.value })
                  }
                  required
                />
                <AuthField
                  compact
                  label="Last name"
                  name="lastName"
                  placeholder="Last Name"
                  value={form.lastName}
                  onChange={(e) =>
                    setForm({ ...form, lastName: e.target.value })
                  }
                  required
                />
              </div>
              <div className="mb-2.5 grid gap-4 legacy-sm:grid-cols-[1fr_2fr]">
                <label className="relative min-w-0 text-left">
                  <span className="mb-0.5 block text-[0.72rem] leading-[1.66] font-bold text-[#777] uppercase">
                    Relationship
                  </span>
                  <select
                    aria-label="Relationship to child"
                    name="relationship"
                    className="h-[2.5rem] w-full appearance-none rounded border-0 bg-[#f9fafb] pl-3.5 pr-8 py-[8.5px] text-base leading-[1.4375] text-[#333] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.23)] outline-none hover:shadow-[inset_0_0_0_1px_#333] focus:shadow-[inset_0_0_0_2px_#4543c0] focus-visible:outline-none"
                    value={form.relationship}
                    onChange={(e) =>
                      setForm({ ...form, relationship: e.target.value })
                    }
                  >
                    {["Mother", "Father", "Guardian"].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                  <LegacyIcon
                    name="ArrowDropDown"
                    className="pointer-events-none absolute right-1.75 bottom-2 size-6 text-black/54"
                  />
                </label>
                <AuthField
                  compact
                  label="Email address"
                  aria-label="Email"
                  name="email"
                  icon="EmailOutlined"
                  placeholder="Enter your email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div className="mb-2.5 grid gap-4 legacy-sm:grid-cols-2">
                <AuthField
                  compact
                  label="Password"
                  name="password"
                  icon="LockOutlined"
                  placeholder="Create password"
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  required
                />
                <AuthField
                  compact
                  label="Confirm password"
                  name="confirmPassword"
                  icon="LockOutlined"
                  placeholder="Confirm password"
                  type="password"
                  autoComplete="new-password"
                  value={form.confirm}
                  onChange={(e) =>
                    setForm({ ...form, confirm: e.target.value })
                  }
                  required
                />
              </div>
              <PasswordCriteria value={form.password} compact />
              <RememberDevice
                checked={remember}
                onChange={setRemember}
                compact
              />
              <AuthButton
                type="submit"
                kind="registration"
                disabled={
                  busy ||
                  !passwordValid(form.password) ||
                  form.password !== form.confirm
                }
              >
                {busy ? "Sending Code..." : "Sign Up"}
              </AuthButton>
              <p className="mt-2 text-center text-[0.82rem] leading-[1.43] text-[#6b7280]">
                Already have an account?{" "}
                <Link to="/login" className="font-bold text-brand no-underline">
                  Log In here
                </Link>
              </p>
            </>
          )}
        </form>
      </div>
    </AuthBackdrop>
  );
}
