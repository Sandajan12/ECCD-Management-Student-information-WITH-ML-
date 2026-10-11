import { useState } from "react";
import { useSessionField } from "../utils/sessionDrafts";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth, roleHome } from "../context/AuthContext";
import API, { errorMessage } from "../services/api";
import type {
  AuthResponse,
  ChallengeResponse,
  SessionResponse,
} from "../types";
import { Button, Field, Notice, Select } from "../components/ui";
import {
  PasswordRules,
  passwordValid,
} from "../components/ForceChangePassword";
import { AuthFrame } from "./LoginPage";
export default function RegisterParentPage() {
  const { user, login } = useAuth();
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (user) return <Navigate to={roleHome(user.role)} replace />;
  const register = async (): Promise<AuthResponse> =>
    (
      await API.post<AuthResponse>("/api/auth/register-parent", {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        relationship: form.relationship,
      })
    ).data;
  return (
    <AuthFrame
      title={challenge ? "Verify your email" : "Create parent account"}
      subtitle="Stay connected with your child’s learning journey."
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const data = challenge
              ? (
                  await API.post<SessionResponse>("/api/auth/verify-otp", {
                    challengeToken: challenge.challengeToken,
                    otp,
                  })
                ).data
              : await register();
            if (data.requireOtp) {
              setChallenge(data);
              if (!data.emailSent)
                setError(
                  data.message ||
                    "The email could not be sent. Retry below to recover your registration.",
                );
            } else {
              confirmForm();
              confirmOtp();
              confirmChallenge();
              login(data);
              navigate("/parent/dashboard");
            }
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Notice tone="error">{error}</Notice>
        {challenge ? (
          <>
            <Notice>Enter the code sent to {challenge.email}.</Notice>
            <Field
              label="Verification code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
            />
            <Button
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const data = await register();
                  if (data.requireOtp) {
                    setChallenge(data);
                    setError(
                      data.emailSent
                        ? ""
                        : data.message ||
                            "Email delivery failed. Please retry.",
                    );
                  } else {
                    confirmForm();
                    confirmOtp();
                    confirmChallenge();
                    login(data);
                    navigate("/parent/dashboard");
                  }
                } catch (err) {
                  setError(errorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Resend verification email
            </Button>
          </>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {(["firstName", "lastName"] as const).map((key) => (
                <Field
                  key={key}
                  label={key === "firstName" ? "First name" : "Last name"}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  required
                />
              ))}
            </div>
            <Select
              label="Relationship to child"
              value={form.relationship}
              onChange={(e) =>
                setForm({ ...form, relationship: e.target.value })
              }
            >
              {["Mother", "Father", "Guardian"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
            <Field
              label="Email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <Field
              label="Password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
            <PasswordRules value={form.password} />
            <Field
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              required
            />
          </>
        )}
        <Button
          type="submit"
          className="w-full"
          disabled={
            busy ||
            (!challenge &&
              (!passwordValid(form.password) || form.password !== form.confirm))
          }
        >
          {busy
            ? "Please wait…"
            : challenge
              ? "Verify & continue"
              : "Create account"}
        </Button>
        <p className="text-center text-sm text-slate-500">
          Already registered?{" "}
          <Link className="font-semibold text-blue-600" to="/login">
            Sign in
          </Link>
        </p>
      </form>
    </AuthFrame>
  );
}
