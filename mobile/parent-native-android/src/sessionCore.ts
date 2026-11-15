import type {AuthResponse, SessionResponse} from './contracts';

export interface SessionState { session: SessionResponse | null; loading: boolean; message: string; }
export interface SessionDependencies {
  baseUrl: string;
  fetch: typeof fetch;
  readPending: () => Promise<boolean>;
  writePending: (pending: boolean) => Promise<void>;
  clearCookie: () => Promise<void>;
}
export class ApiError extends Error {
  constructor(message: string, public status: number, public code = '', public retryAfter = 0) { super(message); }
}
export const transient = (e: unknown) => !(e instanceof ApiError) || [408, 425, 429].includes(e.status) || e.status >= 500;
export function messageOf(e: unknown): string { return e instanceof Error ? e.message : 'Unable to complete the request.'; }
function jwtClaims(token: string): {tokenType?: string; exp?: number} {
  const payload = token.split('.')[1];
  if (!payload || !/^[A-Za-z0-9_-]+$/.test(payload)) throw new Error('Invalid JWT');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let bits = 0; let value = 0; let encoded = '';
  for (const char of payload) {
    value = (value << 6) | alphabet.indexOf(char); bits += 6;
    if (bits >= 8) { bits -= 8; encoded += '%' + ((value >> bits) & 255).toString(16).padStart(2, '0'); }
  }
  // Hermes has no browser atob. Decode UTF-8 without storing or validating JWTs locally.
  return JSON.parse(decodeURIComponent(encoded));
}
export class SessionManager {
  private state: SessionState = {session: null, loading: true, message: ''};
  private listeners = new Set<() => void>();
  private generation = 0;
  private refreshFlight: Promise<void> | null = null;
  private nextRefresh = 0;
  private failures = 0;
  private expiresAt = 0;
  private clockOffset = 0;
  private signingOut = false;
  constructor(private deps: SessionDependencies) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(value: Partial<SessionState>) { this.state = {...this.state, ...value}; this.listeners.forEach(fn => fn()); }
  private accept(value: SessionResponse) {
    if (!value || typeof value.access_token !== 'string' || !value.user || !Number.isInteger(value.user.id) ||
      !['user', 'admin', 'super-admin'].includes(value.user.role)) throw new Error('Invalid session response.');
    try {
      const claims = jwtClaims(value.access_token);
      if (claims.tokenType !== 'session' || !Number.isFinite(claims.exp)) throw new Error('Unexpected session token');
      this.expiresAt = (claims.exp || 0) * 1000;
    } catch { throw new Error('The server did not return a valid session token.'); }
    this.publish({session: value, message: ''});
  }
  private async wire<T>(path: string, method: string, data?: unknown, token?: string): Promise<T> {
    if (!/^\/api\/[a-zA-Z0-9/_-]+$/.test(path)) throw new Error('Invalid API path.');
    const response = await this.deps.fetch(this.deps.baseUrl + path, {
      method, credentials: 'include', headers: {Accept: 'application/json', ...(data === undefined ? {} : {'Content-Type': 'application/json'}),
        ...(token ? {Authorization: `Bearer ${token}`} : {})}, ...(data === undefined ? {} : {body: JSON.stringify(data)}),
    });
    const date = Date.parse(response.headers.get('Date') || '');
    if (Number.isFinite(date)) this.clockOffset = date - Date.now();
    const text = await response.text();
    let body: unknown;
    try { body = text ? JSON.parse(text) : {}; } catch { throw new ApiError('The server returned an unreadable response.', response.status || 502); }
    if (!response.ok) {
      const error = body as {message?: string; detail?: string | Array<{msg: string}>; code?: string};
      const message = typeof error.detail === 'string' ? error.detail : Array.isArray(error.detail) ? error.detail.map(row => row.msg).join('\n') : error.message;
      const retry = response.headers.get('Retry-After') || '';
      const retryMs = /^\d+$/.test(retry) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now() - this.clockOffset) || 0;
      throw new ApiError(message || `Request failed (${response.status}).`, response.status, error.code, retryMs);
    }
    return body as T;
  }
  async restore(): Promise<void> {
    try {
      if (await this.deps.readPending()) { await this.logout(); return; }
      await this.refresh();
    } catch (e) { this.publish({message: transient(e) ? 'Unable to restore your session. Reconnect and tap Retry.' : messageOf(e)}); }
    finally { this.publish({loading: false}); }
  }
  refresh(): Promise<void> {
    if (this.refreshFlight) return this.refreshFlight;
    if (this.signingOut) return Promise.reject(new Error('Account switch in progress.'));
    if (Date.now() < this.nextRefresh) return Promise.reject(new ApiError('Session renewal is waiting. Please retry shortly.', 429, '', this.nextRefresh - Date.now()));
    const generation = this.generation;
    const flight = (async () => {
      try {
        const session = await this.wire<SessionResponse>('/api/auth/refresh', 'POST');
        if (generation !== this.generation) return;
        this.accept(session); this.failures = 0; this.nextRefresh = 0;
      } catch (e) {
        if (generation !== this.generation) return;
        if (transient(e)) {
          this.nextRefresh = Date.now() + Math.max([30000, 60000, 120000][Math.min(this.failures++, 2)], e instanceof ApiError ? e.retryAfter : 0);
          this.publish({message: 'Connection interrupted. Your session will retry when connected.'});
        } else { this.generation++; await this.deps.clearCookie(); this.publish({session: null, message: messageOf(e)}); }
        throw e;
      }
    })();
    this.refreshFlight = flight;
    void flight.finally(() => { if (this.refreshFlight === flight) this.refreshFlight = null; }).catch(() => {});
    return flight;
  }
  async renewIfNeeded() {
    if (this.state.session && this.expiresAt - Date.now() - this.clockOffset < 120000 && Date.now() >= this.nextRefresh) await this.refresh();
  }
  async authenticate(path: '/api/auth/login' | '/api/auth/register-parent' | '/api/auth/verify-otp', body: unknown): Promise<AuthResponse> {
    if (this.signingOut) throw new Error('Wait for logout to finish.');
    if (this.refreshFlight) { try { await this.refreshFlight; } catch {} }
    const generation = ++this.generation;
    const response = await this.wire<AuthResponse>(path, 'POST', body);
    if (generation !== this.generation) throw new Error('This sign-in attempt was cancelled.');
    if ('access_token' in response) { await this.deps.writePending(false); this.accept(response); this.nextRefresh = 0; this.failures = 0; }
    return response;
  }
  async request<T>(path: string, method = 'GET'): Promise<T> {
    if (path.startsWith('/api/auth/')) throw new Error('Use the authentication flow.');
    const generation = this.generation;
    const token = this.state.session?.access_token;
    if (!token) throw new ApiError('Please sign in.', 401);
    try { return await this.wire<T>(path, method, undefined, token); }
    catch (e) {
      if (!(e instanceof ApiError) || generation !== this.generation) throw e;
      if (['SESSION_REVOKED', 'INVALID_TOKEN', 'ACCOUNT_INACTIVE'].includes(e.code)) {
        this.generation++; await this.deps.clearCookie(); this.publish({session: null, message: e.message}); throw e;
      }
      if (e.status !== 401) throw e;
      if (this.state.session?.access_token === token) await this.refresh();
      if (generation !== this.generation || !this.state.session) throw e;
      return await this.wire<T>(path, method, undefined, this.state.session.access_token);
    }
  }
  async logout(): Promise<void> {
    this.signingOut = true;
    this.generation++;
    this.publish({session: null, message: ''});
    try {
      await this.deps.writePending(true);
      await this.wire('/api/auth/logout', 'POST');
      await this.deps.writePending(false);
    } catch { this.publish({message: 'Signed out on this device. Server logout could not be confirmed.'}); }
    finally {
      try { await this.deps.clearCookie(); }
      catch { this.publish({message: 'Secure session could not be cleared. Retry logout before closing the app.'}); }
      this.signingOut = false; this.nextRefresh = 0;
    }
  }
}
