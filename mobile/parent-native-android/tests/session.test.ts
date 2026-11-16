import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ApiError, SessionManager} from '../src/sessionCore.ts';
import type {SessionResponse} from '../src/contracts.ts';

const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {status, headers: {'Content-Type': 'application/json'}});
const sessionValue = (id = 1): SessionResponse => ({success: true, user: {id, role: 'user', full_name: 'Parent'}, access_token: `header.${Buffer.from(JSON.stringify({tokenType: 'session', exp: Math.floor(Date.now() / 1000) + 1800, id})).toString('base64url')}.signature`});

test('multipart proof uploads retain the boundary and RAM bearer through one refresh without JSON conversion', async () => {
  const requests: RequestInit[] = [];
  const {manager} = setup(async (path, init) => {
    if (path.startsWith('/api/auth/')) return response(sessionValue());
    requests.push(init);
    return requests.length === 1 ? response({detail: 'Expired'}, 401) : response({photo_id: 'a'.repeat(32)});
  });
  await manager.restore();
  const body = new FormData(); body.append('file', 'isolated multipart fixture');
  await manager.request('/api/eccd/parent/home-photos/7/45/PRE', 'POST', body);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.body, body);
    assert.equal((request.headers as Record<string,string>)['Content-Type'], undefined);
    assert.ok((request.headers as Record<string,string>).Authorization.startsWith('Bearer '));
  }
});
test('protected JSON payloads survive a single 401 refresh; only numeric local queries are allowed', async () => {
  const calls: Array<{url: string; init: RequestInit}> = []; let denied = true;
  const manager = new SessionManager({baseUrl: 'https://api.ameskinder.com', readPending: async () => false, writePending: async () => {}, clearCookie: async () => {},
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({url, init});
      if (url.includes('/api/auth/')) return response(sessionValue());
      if (denied) {denied = false; return response({detail: 'Expired'}, 401);}
      return response({success: true});
    }) as typeof fetch});
  await manager.restore();
  await manager.request('/api/parents/children/7', 'PUT', {address: 'New Home'});
  const puts = calls.filter(c => c.init.method === 'PUT'); assert.equal(puts.length, 2);
  assert.equal(puts[0].init.body, JSON.stringify({address: 'New Home'})); assert.equal(puts[1].init.body, puts[0].init.body);
  await manager.request('/api/messages/history?teacher_id=9&parent_id=88');
  await assert.rejects(manager.request('https://example.com/api/messages/history'), /Invalid API path/);
  await assert.rejects(manager.request('/api/messages/history?token=secret'), /Invalid API path/);
  await assert.rejects(manager.request('/api/../settings'), /Invalid API path/);
});
function setup(handler: (path: string, init: RequestInit) => Promise<Response>) {
  let pending = false; let cleared = 0;
  const manager = new SessionManager({baseUrl: 'https://api.ameskinder.com', fetch: ((url: string, init: RequestInit) => handler(new URL(url).pathname, init)) as typeof fetch,
    readPending: async () => pending, writePending: async value => {pending = value;}, clearCookie: async () => {cleared++;}});
  return {manager, cleared: () => cleared, pending: () => pending};
}
test('startup restores RAM session with a bodyless cookie refresh', async () => {
  const {manager} = setup(async (path, init) => { assert.equal(path, '/api/auth/refresh'); assert.equal(init.method, 'POST'); assert.equal(init.body, undefined); assert.equal(init.credentials, 'include'); assert.equal((init.headers as Record<string, string>).Authorization, undefined); return response(sessionValue()); });
  await manager.restore(); assert.equal(manager.snapshot().session?.user.id, 1); assert.equal(manager.snapshot().loading, false);
});
test('session decoding works on Hermes without browser atob and rejects refresh tokens', async () => {
  const saved = globalThis.atob;
  globalThis.atob = () => {throw new Error('No browser atob');};
  try {
    const {manager} = setup(async () => response(sessionValue()));
    await manager.restore(); assert.ok(manager.snapshot().session);
    const invalid = setup(async () => response({...sessionValue(), access_token: `a.${Buffer.from(JSON.stringify({tokenType: 'refresh', exp: 9999999999})).toString('base64url')}.z`}));
    await invalid.manager.restore(); assert.equal(invalid.manager.snapshot().session, null);
  } finally {globalThis.atob = saved;}
});
test('concurrent expired protected requests share one renewal and retry once with the live token', async () => {
  let refreshes = 0; let calls = 0;
  const original = sessionValue(); const successor = sessionValue(2);
  const {manager} = setup(async (path, init) => {
    if (path === '/api/auth/login') return response(original);
    if (path === '/api/auth/refresh') {refreshes++; await new Promise(resolve => setTimeout(resolve, 10)); return response(successor);}
    calls++; return (init.headers as Record<string, string>).Authorization === `Bearer ${original.access_token}` ? response({code: 'TOKEN_EXPIRED', detail: 'Expired'}, 401) : response({ok: true});
  });
  await manager.authenticate('/api/auth/login', {});
  const results = await Promise.all([manager.request('/api/students/my-child'), manager.request('/api/students/my-child')]);
  assert.equal(refreshes, 1); assert.equal(calls, 4); assert.deepEqual(results, [{ok: true}, {ok: true}]);
});
test('revocation never refreshes; an ordinary permission denial preserves the session', async () => {
  let mode = 'permission'; let refreshes = 0;
  const fixture = setup(async path => {
    if (path === '/api/auth/login') return response(sessionValue());
    if (path === '/api/auth/refresh') refreshes++;
    return mode === 'permission' ? response({detail: 'Adviser locked this'}, 403) : response({code: 'SESSION_REVOKED', detail: 'Session revoked'}, 401);
  });
  await fixture.manager.authenticate('/api/auth/login', {});
  await assert.rejects(fixture.manager.request('/api/ml/parent/readiness/1'), ApiError);
  assert.ok(fixture.manager.snapshot().session);
  mode = 'revoked'; await assert.rejects(fixture.manager.request('/api/ml/parent/readiness/1'), ApiError);
  assert.equal(fixture.manager.snapshot().session, null); assert.equal(refreshes, 0); assert.equal(fixture.cleared(), 1);
});
test('network renewal failures preserve RAM and apply one shared cooldown', async () => {
  let refreshes = 0;
  const {manager} = setup(async path => {if (path === '/api/auth/login') return response(sessionValue()); refreshes++; throw new TypeError('Network request failed');});
  await manager.authenticate('/api/auth/login', {});
  await assert.rejects(manager.refresh()); await assert.rejects(manager.refresh(), ApiError);
  assert.ok(manager.snapshot().session); assert.equal(refreshes, 1);
});
test('late refresh cannot restore a logged-out session; failed logout is remembered', async () => {
  let finish: (r: Response) => void = () => {};
  const fixture = setup(async path => {
    if (path === '/api/auth/login') return response(sessionValue());
    if (path === '/api/auth/refresh') return new Promise(resolve => {finish = resolve;});
    throw new TypeError('Offline');
  });
  await fixture.manager.authenticate('/api/auth/login', {});
  const refresh = fixture.manager.refresh(); await fixture.manager.logout(); finish(response(sessionValue())); await refresh;
  assert.equal(fixture.manager.snapshot().session, null); assert.equal(fixture.pending(), true); assert.equal(fixture.cleared(), 1);
});
test('protected HTTP retry is bounded and prediction sends no body', async () => {
  let calls = 0;
  const {manager} = setup(async (path, init) => {
    if (path.startsWith('/api/auth/')) return response(sessionValue());
    assert.equal(init.body, undefined); calls++; return response({detail: 'Expired'}, 401);
  });
  await manager.authenticate('/api/auth/login', {});
  await assert.rejects(manager.request('/api/ml/parent/predict/1', 'POST')); assert.equal(calls, 2);
});
