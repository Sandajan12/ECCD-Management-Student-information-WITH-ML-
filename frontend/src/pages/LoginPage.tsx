import { useState } from "react";
import { useSessionField } from "../utils/sessionDrafts";
import type { ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth, roleHome } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import API, { errorMessage } from "../services/api";
import type {
  AuthResponse,
  ChallengeResponse,
  SessionResponse,
} from "../types";
import { Button, Field, Notice } from "../components/ui";
import Background from "../assets/background_pic.webp";
export function AuthFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const { settings } = useSettings();
  return (
    <main className="relative grid min-h-dvh place-items-center bg-slate-900 p-4 sm:p-8">
      <img
        src={settings.login_background || Background}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-40"
      />
      <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-xl sm:p-9">
        <div className="mb-6 text-center">
          {settings.logo_url && (
            <img
              src={settings.logo_url}
              alt="School logo"
              className="mx-auto mb-4 size-16 rounded-full object-cover"
            />
          )}
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-blue-600">
            {settings.school_name || "AMES • Early Childhood"}
          </p>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
        </div>
        {children}
      </div>
    </main>
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
  const [remember, setRemember] = useState(
    Boolean(localStorage.getItem("ames_device_token")),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (user) return <Navigate to={roleHome(user.role)} replace />;
  return (
    <AuthFrame
      title={challenge ? "Check your email" : "Welcome back"}
      subtitle={
        challenge
          ? `Enter the verification code sent to ${challenge.email}.`
          : "Sign in to your ECCD management portal."
      }
    >
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const res = challenge
              ? await API.post<SessionResponse>("/api/auth/verify-otp", {
                  challengeToken: challenge.challengeToken,
                  otp,
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
        <Notice tone="error">{error}</Notice>
        {location.search.includes("session=expired") && (
          <Notice>
            Your session expired. Sign in again; your saved drafts are still on
            this device.
          </Notice>
        )}
        {challenge ? (
          <>
            <Field
              label="Verification code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              required
            />
            <Button variant="secondary" onClick={() => setChallenge(null)}>
              Back to sign in
            </Button>
          </>
        ) : (
          <>
            <Field
              label="Email or username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <label className="flex items-center gap-3 text-sm text-slate-600">
              <input
                type="checkbox"
                className="size-4 accent-blue-600"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Remember this device for 30 days
            </label>
          </>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : challenge ? "Verify & sign in" : "Sign in"}
        </Button>
        <p className="text-center text-sm text-slate-500">
          New parent?{" "}
          <Link className="font-semibold text-blue-600" to="/register-parent">
            Create an account
          </Link>
        </p>
      </form>
    </AuthFrame>
  );
}
