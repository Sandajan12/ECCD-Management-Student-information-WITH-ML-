import React, { useContext, useEffect, useState } from "react";
import { BackHandler, Pressable, Text, View } from "react-native";
import {
  BrandColor,
  SchoolBrand,
  Button,
  Card,
  Copy,
  Dialog,
  Icon,
  Input,
  Label,
  Notice,
  OtpInput,
  Seal,
  Title,
  styles,
} from "./ui";
import { session } from "./session";
import { ApiError, messageOf } from "./sessionCore";
import { registrationError, registrationPayload } from "./policy";
import { RELATIONSHIPS } from "./contracts";
import type {
  Challenge,
  Credentials,
  Registration,
  Relationship,
} from "./contracts";
import {
  TermsPrivacyAcknowledgment,
  linkBlue,
} from "./TermsPrivacyAcknowledgment";

interface AuthForm {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  relationship: Relationship;
  confirm: string;
  accepted: boolean;
}

export function AuthScreen() {
  const [register, setRegister] = useState(false);
  const [form, setForm] = useState<AuthForm>({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    relationship: "Guardian",
    confirm: "",
    accepted: false,
  });
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [choosingRelationship, setChoosingRelationship] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [submitted, setSubmitted] = useState<{
    register: boolean;
    body: Credentials | Registration;
  } | null>(null);
  const [attempted, setAttempted] = useState(false);
  const brand = useContext(SchoolBrand),
    color = useContext(BrandColor);
  useEffect(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (busy) return true;
      if (challenge) {
        setChallenge(null);
        setError("");
        return true;
      }
      if (register) {
        setRegister(false);
        setAttempted(false);
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [busy, challenge, register]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const field = <K extends keyof AuthForm>(key: K, value: AuthForm[K]) =>
    setForm((old) => ({ ...old, [key]: value }));
  const fail = (e: unknown) => {
    setError(messageOf(e));
    if (e instanceof ApiError && e.status === 429)
      setRetryAt(Date.now() + Math.max(60000, e.retryAfter));
  };
  const issue = async (value: {
    register: boolean;
    body: Credentials | Registration;
  }) => {
    const response = await session.authenticate(
      value.register ? "/api/auth/register-parent" : "/api/auth/login",
      value.body,
    );
    if ("challengeToken" in response) {
      setSubmitted(value);
      setChallenge(response);
      setOtp("");
      setRetryAt(
        response.code === "REGISTRATION_EMAIL_FAILED" ? 0 : Date.now() + 60000,
      );
    }
  };
  const submit = async () => {
    if (busy || seconds) return;
    setAttempted(true);
    if (!form.accepted) {
      setError("Please accept the Terms and Conditions before signing in.");
      return;
    }
    const email = form.email.trim().toLowerCase();
    if (
      !email ||
      email.length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      setError("Enter a valid email address (100 characters maximum).");
      return;
    }
    if (!form.password) {
      setError("Enter your password.");
      return;
    }
    if (register) {
      const validation = registrationError(
        form.firstName,
        form.lastName,
        form.password,
      );
      if (validation) {
        setError(validation);
        return;
      }
      if (form.password !== form.confirm) {
        setError("Passwords do not match.");
        return;
      }
    }
    const body: Credentials | Registration = register
      ? registrationPayload(form)
      : { email, password: form.password, terms_accepted: true };
    setBusy(true);
    setError("");
    try {
      await issue({ register, body });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    if (busy) return;
    if (!form.accepted) {
      setError("Please accept the Terms and Conditions before signing in.");
      return;
    }
    if (!challenge || !/^[0-9]{6}$/.test(otp)) {
      setError("Enter the 6-digit email code.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await session.authenticate("/api/auth/verify-otp", {
        challengeToken: challenge.challengeToken,
        otp,
        terms_accepted: true,
      });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const resend = async () => {
    if (!submitted || seconds || busy || !form.accepted) return;
    setBusy(true);
    setError("");
    try {
      await issue(submitted);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const acknowledgment = (
    <TermsPrivacyAcknowledgment
      checked={form.accepted}
      disabled={busy}
      onChange={(accepted) => {
        field("accepted", accepted);
        if (
          accepted &&
          error === "Please accept the Terms and Conditions before signing in."
        )
          setError("");
      }}
    />
  );
  if (challenge)
    return (
      <Card style={{ padding: 24, gap: 18 }}>
        <View style={{ alignItems: "center", gap: 12 }}>
          <Seal />
          <Title style={styles.center}>Verify your email</Title>
          <BadgeHeader />
          <Copy style={styles.center}>
            We sent a code to{"\n"}
            {challenge.email}
          </Copy>
        </View>
        <Copy>
          The code expires after 10 minutes. Five incorrect attempts invalidate
          it.
        </Copy>
        {challenge.code === "REGISTRATION_EMAIL_FAILED" ? (
          <Notice error>
            {challenge.message ||
              "Your account is awaiting verification. Retry email delivery with the same registration details."}
          </Notice>
        ) : (
          <>
            <OtpInput value={otp} onChange={setOtp} disabled={busy} />
            {acknowledgment}
            <Button
              icon="check"
              title={
                busy
                  ? "Verifying…"
                  : register
                    ? "Verify & Activate Account"
                    : "Verify & Log In"
              }
              disabled={busy || otp.length !== 6 || !form.accepted}
              onPress={() => void verify()}
            />
          </>
        )}
        {!!error && <Notice error>{error}</Notice>}
        <Button
          secondary
          title={
            seconds ? `Retry email in ${seconds}s` : "Send a new email code"
          }
          disabled={busy || seconds > 0 || !form.accepted}
          onPress={() => void resend()}
        />
        <Button
          secondary
          icon="back"
          title="Back to account details"
          disabled={busy}
          onPress={() => {
            setChallenge(null);
            setError("");
          }}
        />
      </Card>
    );
  return (
    <Card
      style={{
        padding: 0,
        borderRadius: 16,
        overflow: "hidden",
        gap: 0,
        elevation: 6,
      }}
    >
      <View
        style={{ backgroundColor: color, padding: 24, alignItems: "center" }}
      >
        <Seal size={90} />
      </View>
      <View style={{ padding: 24, gap: 16 }}>
        <Title
          style={[
            styles.center,
            {
              color,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              marginBottom: 6,
            },
          ]}
        >
          {brand.system_name}
        </Title>
        {register && (
          <Title style={{ fontSize: 17 }}>Create your parent account</Title>
        )}
        {register && (
          <>
            <Input
              icon="child"
              label="First name"
              value={form.firstName}
              onChangeText={(v) => field("firstName", v)}
              error={
                attempted && !form.firstName.trim()
                  ? "First name is required."
                  : undefined
              }
              autoComplete="given-name"
              editable={!busy}
            />
            <Input
              icon="child"
              label="Last name"
              value={form.lastName}
              onChangeText={(v) => field("lastName", v)}
              error={
                attempted && !form.lastName.trim()
                  ? "Last name is required."
                  : undefined
              }
              autoComplete="family-name"
              editable={!busy}
            />
            <View style={{ gap: 6 }}>
              <Label>Relationship to child</Label>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose relationship to child"
                accessibilityValue={{ text: form.relationship }}
                accessibilityState={{
                  expanded: choosingRelationship,
                  disabled: busy,
                }}
                disabled={busy}
                onPress={() => setChoosingRelationship(true)}
                style={[styles.inputBox, { minHeight: 48 }]}
              >
                <Icon name="home" />
                <Label style={{ flex: 1 }}>{form.relationship}</Label>
                <Icon name="down" />
              </Pressable>
            </View>
            {choosingRelationship && (
              <Dialog
                title="Relationship to child"
                close={() => setChoosingRelationship(false)}
                locked={busy}
              >
                <View accessibilityRole="radiogroup">
                  {RELATIONSHIPS.map((value) => (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityState={{
                        checked: form.relationship === value,
                        disabled: busy,
                      }}
                      disabled={busy}
                      onPress={() => {
                        field("relationship", value);
                        setChoosingRelationship(false);
                      }}
                      style={[
                        styles.row,
                        { minHeight: 48, justifyContent: "space-between" },
                      ]}
                    >
                      <Label>{value}</Label>
                      {form.relationship === value && (
                        <Icon name="check" color={color} />
                      )}
                    </Pressable>
                  ))}
                </View>
              </Dialog>
            )}
          </>
        )}
        <Input
          icon="email"
          label="Email"
          placeholder="Enter your email"
          value={form.email}
          onChangeText={(v) => field("email", v)}
          error={
            attempted &&
            (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) ||
              form.email.trim().length > 100)
              ? "Please enter a valid email address, up to 100 characters."
              : undefined
          }
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          maxLength={100}
          editable={!busy}
        />
        <Input
          icon="lock"
          label="Password"
          placeholder="Enter your password"
          value={form.password}
          onChangeText={(v) => field("password", v)}
          error={
            attempted && !form.password ? "Enter your password." : undefined
          }
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={register ? "new-password" : "current-password"}
          editable={!busy}
        />
        {register && (
          <>
            <Copy>
              At least 8 characters, with uppercase, lowercase and a number.
              Maximum 72 UTF-8 bytes.
            </Copy>
            <Input
              icon="lock"
              label="Confirm password"
              value={form.confirm}
              onChangeText={(v) => field("confirm", v)}
              error={
                attempted && form.password !== form.confirm
                  ? "Passwords do not match!"
                  : undefined
              }
              secureTextEntry
              autoComplete="new-password"
              editable={!busy}
            />
          </>
        )}
        {acknowledgment}
        {!!error && <Notice error>{error}</Notice>}
        <Button
          icon="lock"
          title={
            busy
              ? "Please wait…"
              : seconds
                ? `Try again in ${seconds}s`
                : register
                  ? "Create account"
                  : "Log In"
          }
          disabled={busy || seconds > 0 || !form.accepted}
          onPress={() => void submit()}
        />
        <Copy style={styles.center}>
          {register ? "Already registered? " : "Don't have an account yet? "}
          <Text
            accessibilityRole="link"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => {
              if (busy) return;
              setRegister(!register);
              setAttempted(false);
              setError("");
            }}
            style={{ color: linkBlue, fontWeight: "700" }}
          >
            {register ? "Sign in instead" : "Click here"}
          </Text>
        </Copy>
      </View>
    </Card>
  );
}
function BadgeHeader() {
  return (
    <Label style={{ fontSize: 11, letterSpacing: 0.5, color: "#777777" }}>
      6-DIGIT VERIFICATION CODE
    </Label>
  );
}
