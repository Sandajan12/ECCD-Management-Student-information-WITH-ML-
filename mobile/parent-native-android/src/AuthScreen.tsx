import React, {useEffect, useState} from 'react';
import {Linking, Pressable, Text, View} from 'react-native';
import {Button, Card, Copy, Input, Label, Notice, Title, styles} from './ui';
import {session} from './session';
import {ApiError, messageOf} from './sessionCore';
import {registrationError} from './policy';
import type {Challenge, Credentials, Registration} from './contracts';

export function AuthScreen() {
  const [register, setRegister] = useState(false);
  const [form, setForm] = useState({email: '', password: '', firstName: '', lastName: '', relationship: 'Guardian', confirm: '', accepted: false});
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [submitted, setSubmitted] = useState<{register: boolean; body: Credentials | Registration} | null>(null);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const field = (key: keyof typeof form, value: string | boolean) => setForm(old => ({...old, [key]: value}));
  const fail = (e: unknown) => { setError(messageOf(e)); if (e instanceof ApiError && e.status === 429) setRetryAt(Date.now() + Math.max(60000, e.retryAfter)); };
  const issue = async (value: {register: boolean; body: Credentials | Registration}) => {
    const response = await session.authenticate(value.register ? '/api/auth/register-parent' : '/api/auth/login', value.body);
    if ('challengeToken' in response) {
      setSubmitted(value); setChallenge(response); setOtp('');
      setRetryAt(response.code === 'REGISTRATION_EMAIL_FAILED' ? 0 : Date.now() + 60000);
    }
  };
  const submit = async () => {
    if (!form.accepted) { setError('Please accept the Terms and Conditions before continuing.'); return; }
    const email = form.email.trim().toLowerCase();
    if (!email || email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email address (100 characters maximum).'); return; }
    if (!form.password) { setError('Enter your password.'); return; }
    if (register) {
      const validation = registrationError(form.firstName, form.lastName, form.password);
      if (validation) { setError(validation); return; }
      if (form.password !== form.confirm) { setError('Passwords do not match.'); return; }
    }
    const body: Credentials | Registration = register ? {email, password: form.password, firstName: form.firstName.trim(), lastName: form.lastName.trim(), relationship: form.relationship.trim() || 'Guardian', terms_accepted: true} : {email, password: form.password, terms_accepted: true};
    setBusy(true); setError('');
    try { await issue({register, body}); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const verify = async () => {
    if (!challenge || !/^[0-9]{6}$/.test(otp)) { setError('Enter the 6-digit email code.'); return; }
    setBusy(true); setError('');
    try { await session.authenticate('/api/auth/verify-otp', {challengeToken: challenge.challengeToken, otp, terms_accepted: true}); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };
  const resend = async () => {
    if (!submitted || seconds || busy) return;
    setBusy(true); setError('');
    try { await issue(submitted); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  if (challenge) return <Card><Title>Check your email</Title><Copy>{challenge.email}</Copy>
    <Copy>The code expires after 10 minutes. Five incorrect attempts invalidate it.</Copy>
    {challenge.code === 'REGISTRATION_EMAIL_FAILED' ? <Notice error>{challenge.message || 'Your account is awaiting verification. Retry email delivery with the same registration details.'}</Notice> : <>
      <Input label="6-digit verification code" value={otp} onChangeText={value => setOtp(value.replace(/[^0-9]/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} editable={!busy}/>
      <Button title={busy ? 'Please wait…' : 'Verify email'} disabled={busy || otp.length !== 6} onPress={() => void verify()}/>
    </>}
    {!!error && <Notice error>{error}</Notice>}
    <Button secondary title={seconds ? `Retry email in ${seconds}s` : 'Send a new email code'} disabled={busy || seconds > 0} onPress={() => void resend()}/>
    <Button secondary title="Back to account details" disabled={busy} onPress={() => { setChallenge(null); setError(''); }}/>
  </Card>;
  return <Card><Title>{register ? 'Create your parent account' : 'Welcome back'}</Title><Copy>Sign in to follow your child’s learning journey.</Copy>
    {register && <><Input label="First name" value={form.firstName} onChangeText={v => field('firstName', v)} autoComplete="given-name" editable={!busy}/>
      <Input label="Last name" value={form.lastName} onChangeText={v => field('lastName', v)} autoComplete="family-name" editable={!busy}/>
      <Input label="Relationship to child" value={form.relationship} onChangeText={v => field('relationship', v)} maxLength={50} editable={!busy}/></>}
    <Input label="Email" value={form.email} onChangeText={v => field('email', v)} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" maxLength={100} editable={!busy}/>
    <Input label="Password" value={form.password} onChangeText={v => field('password', v)} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={register ? 'new-password' : 'current-password'} editable={!busy}/>
    {register && <><Copy>At least 8 characters, with uppercase, lowercase and a number. Maximum 72 UTF-8 bytes.</Copy><Input label="Confirm password" value={form.confirm} onChangeText={v => field('confirm', v)} secureTextEntry autoComplete="new-password" editable={!busy}/></>}
    <Pressable accessibilityRole="checkbox" accessibilityState={{checked: form.accepted}} disabled={busy} onPress={() => field('accepted', !form.accepted)} style={styles.row}>
      <Text style={styles.label}>{form.accepted ? '☑' : '☐'} I accept the Terms and Conditions</Text>
    </Pressable>
    <Copy>Use the school website to review the account terms before accepting.</Copy>
    <Button secondary title="Open school website" onPress={() => { void Linking.openURL('https://www.ameskinder.com').catch(() => setError('Unable to open browser. Visit www.ameskinder.com.')); }}/>
    {!!error && <Notice error>{error}</Notice>}
    <Button title={busy ? 'Please wait…' : seconds ? `Try again in ${seconds}s` : register ? 'Create account' : 'Sign in'} disabled={busy || seconds > 0} onPress={() => void submit()}/>
    <View style={styles.row}><Label>{register ? 'Already registered?' : 'New to AMES?'}</Label></View>
    <Button secondary title={register ? 'Sign in instead' : 'Create parent account'} disabled={busy} onPress={() => { setRegister(!register); setError(''); }}/>
  </Card>;
}
