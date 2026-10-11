// Legacy visual source: pages/auth/Login.jsx (LoginPage.jsx re-exports it).
import { useState } from "react";
import type { ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useSessionField } from "../utils/sessionDrafts";
import { useAuth, roleHome } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import API, { errorMessage } from "../services/api";
import type {
  AuthResponse,
  ChallengeResponse,
  SessionResponse,
} from "../types";
import {
  AuthBackdrop,
  AuthAlert,
  AuthButton,
  AuthField,
  OtpFields,
  RememberDevice,
  fallbackLogo,
} from "../components/auth-ui";
import LegacyRipple from "../components/LegacyRipple";
import LegacyIcon from "../components/LegacyIcon";

export function AuthFrame({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  return (
    <AuthBackdrop>
      <div
        data-auth-card="login"
        className="flex w-full max-w-[52.5rem] flex-col overflow-hidden rounded-2xl border-[#e5e7eb] bg-[rgba(255,255,255,0.96)] shadow-[0px_11px_15px_-7px_rgba(0,0,0,0.2),0px_24px_38px_3px_rgba(0,0,0,0.14),0px_9px_46px_8px_rgba(0,0,0,0.12)] backdrop-blur-[10px] legacy-md:min-h-[28.75rem] legacy-md:flex-row"
      >
        <div
          data-brand-panel
          className="flex w-full flex-col items-center justify-center border-b border-[#e0e0e0] bg-brand px-4 py-6 legacy-md:w-[32%] legacy-md:shrink-0 legacy-md:border-r legacy-md:border-b-0 legacy-md:px-6 legacy-md:py-8"
        >
          <img
            src={settings.logo_url || fallbackLogo}
            alt="School Logo"
            className="size-[5.625rem] rounded-full border-[3px] border-white bg-white object-cover shadow-[0_4px_12px_rgba(0,0,0,0.3)] legacy-md:size-[8.125rem]"
          />
        </div>
        <div
          data-auth-form-panel
          className="relative flex min-w-0 flex-1 flex-col items-center justify-center p-6 legacy-sm:p-10 legacy-md:p-12"
        >
          <div className="mx-auto w-full max-w-[26.25rem] text-center">
            <h1 className="mb-6 text-center text-[1.1rem] leading-[1.3] font-extrabold tracking-[0.04em] text-brand uppercase legacy-sm:text-xl legacy-md:mb-7 legacy-md:text-[1.35rem]">
              {settings.school_name || "Apolinario Mabini Elementary School"}
            </h1>
            {children}
          </div>
        </div>
      </div>
    </AuthBackdrop>
  );
}

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail, confirmEmail] = useSessionField(
    "ames_login_email",
    "",
  );
  const [password, setPassword, confirmPassword] = useSessionField(
    "ames_login_password",
    "",
  );
  const [otp, setOtp, confirmOtp] = useSessionField("ames_login_otp", "");
  const [challenge, setChallenge, confirmChallenge] =
    useSessionField<ChallengeResponse | null>("ames_login_challenge", null);
  const [remember, setRemember, confirmRemember] = useSessionField(
    "ames_login_remember_device",
    Boolean(localStorage.getItem("ames_device_token")),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expiredNotice, setExpiredNotice] = useState(
    new URLSearchParams(location.search).get("session") === "expired",
  );
  if (user) return <Navigate to={roleHome(user.role)} replace />;
  return (
    <AuthFrame>
      <AuthAlert tone="warning">
        {expiredNotice &&
          "Your session has expired due to inactivity. Please sign in again."}
      </AuthAlert>
      <AuthAlert>{error}</AuthAlert>
      <form
        className="w-full"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setError("");
          setExpiredNotice(false);
          if (challenge && !/^\d{6}$/.test(otp)) {
            setError("Please enter the complete 6-digit verification code.");
            return;
          }
          setBusy(true);
          try {
            const res = challenge
              ? await API.post<SessionResponse>("/api/auth/verify-otp", {
                  challengeToken: challenge.challengeToken,
                  otp,
                  rememberDevice: remember,
                })
              : await API.post<AuthResponse>("/api/auth/login", {
                  email: email.trim(),
                  password,
                  rememberDevice: remember,
                  deviceToken: localStorage.getItem("ames_device_token"),
                });
            if (res.data.requireOtp) setChallenge(res.data);
            else {
              confirmEmail();
              confirmPassword();
              confirmOtp();
              confirmChallenge();
              confirmRemember();
              login(res.data);
              navigate(roleHome(res.data.user.role), { replace: true });
            }
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {challenge ? (
          <>
            <div className="mb-4 flex items-center text-left">
              <button
                type="button"
                aria-label="Back to Login"
                onClick={() => setChallenge(null)}
                className="relative mr-2 inline-flex rounded-full p-1.25 text-[#777] outline-none hover:bg-black/4 [@media(hover:none)]:hover:bg-transparent focus-visible:outline-none"
              >
                <LegacyIcon name="ArrowBack" className="size-5" />
                <LegacyRipple center />
              </button>
              <span className="text-sm leading-[1.43] font-bold text-[#777]">
                Back to Login
              </span>
            </div>
            <p className="mb-2 text-xs leading-[1.66] font-bold tracking-[0.5px] text-[#777]">
              6-DIGIT VERIFICATION CODE
            </p>
            <p className="mb-6 text-sm leading-[1.5] text-[#4b5563]">
              We sent a code to
              <br />
              <strong>{challenge.email || email}</strong>
            </p>
            <OtpFields value={otp} onChange={setOtp} />
            <AuthButton type="submit" disabled={busy}>
              {busy ? "Verifying..." : "Verify & Log In"}
            </AuthButton>
          </>
        ) : (
          <>
            <AuthField
              label="Email or username"
              icon="EmailOutlined"
              name="email"
              placeholder="Enter your email or username"
              className="mb-4"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
            <AuthField
              label="Password"
              icon="LockOutlined"
              name="password"
              type="password"
              placeholder="Enter your password"
              className="mb-3"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <RememberDevice checked={remember} onChange={setRemember} />
            <AuthButton type="submit" disabled={busy}>
              {busy ? "Checking..." : "Log In"}
            </AuthButton>
            <p className="mt-6 text-sm leading-[1.43] text-[#6b7280]">
              Don&apos;t have an account yet?{" "}
              <Link
                className="font-bold text-brand no-underline"
                to="/register-parent"
              >
                Click here
              </Link>
            </p>
          </>
        )}
      </form>
    </AuthFrame>
  );
}
