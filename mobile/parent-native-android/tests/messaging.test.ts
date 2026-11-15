import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mergeMessages, MessagingClient} from '../src/messagingCore.ts';
import type {ChatSocket, Request} from '../src/messagingCore.ts';
import type {Message} from '../src/contracts.ts';

const message = (message_id: number, changes: Partial<Message> = {}): Message => ({message_id, parent_id: 88, teacher_id: 9, sender_role: 'teacher', subject: null,
  body: `Message ${message_id}`, is_read: false, is_archived: false, created_at: `2026-11-15T08:00:${String(message_id).padStart(2, '0')}+08:00`, ...changes});
class FakeSocket extends EventEmitter {
  connected = false; disconnected = 0; connects = 0;
  connect() {this.connects++; this.connected = true; super.emit('connect'); return this;}
  disconnect() {this.disconnected++; this.connected = false; super.emit('disconnect'); return this;}
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture() {
  const calls: Array<{path: string; method?: string; data?: unknown}> = [];
  const sockets: FakeSocket[] = []; const tokens: string[] = [];
  let history = [message(1)]; let eligible = true;
  const request: Request = async <T>(path: string, method?: string, data?: unknown): Promise<T> => {
    calls.push({path, method, data});
    if (path === '/api/messages/contacts') return {myId: 88, contacts: eligible ? [{id: 9, name: 'Teacher', latest_message_time: null}] : []} as T;
    if (path === '/api/messages/unread-count') return {unreadCount: 1} as T;
    if (path.startsWith('/api/messages/history')) return history as T;
    if (path === '/api/messages/read') return {success: true} as T;
    if (path === '/api/messages/send') return message(2, {sender_role: 'parent', body: 'Hello'}) as T;
    throw new Error('Unexpected request');
  };
  const client = new MessagingClient(request, token => {tokens.push(token); const socket = new FakeSocket(); sockets.push(socket); return socket as unknown as ChatSocket;});
  return {calls, sockets, tokens, client, setHistory: (value: Message[]) => {history = value;}, revoke: () => {eligible = false;}};
}
test('messaging uses contacts myId for history/read/send, never an account ID', async () => {
  const f = fixture();
  try {
    f.client.authenticate('access-account-123'); await tick(); f.client.setViewing(true);
    await f.client.open(9); await tick(); await f.client.send('  Hello  ');
    assert.ok(f.calls.some(c => c.path === '/api/messages/history?teacher_id=9&parent_id=88'));
    assert.deepEqual(f.calls.find(c => c.path === '/api/messages/read')?.data, {teacher_id: 9, parent_id: 88});
    assert.deepEqual(f.calls.find(c => c.path === '/api/messages/send')?.data, {teacher_id: 9, parent_id: 88, body: 'Hello', sender_role: 'parent'});
    assert.equal(f.client.snapshot().messages.filter(m => m.message_id === 2).length, 1);
    await assert.rejects(f.client.send(' '.repeat(4)), /1 and 5000/);
    await assert.rejects(f.client.send('a'.repeat(5001)), /1 and 5000/);
  } finally {f.client.dispose();}
});
test('REST, push, and delayed history merge by message ID without undoing read receipts', () => {
  const merged = mergeMessages([message(2, {is_read: true}), message(1)], [message(2), message(3), message(4, {is_archived: true})]);
  assert.deepEqual(merged.map(m => m.message_id), [1, 2, 3]); assert.equal(merged[1].is_read, true);
});
test('token renewal disconnects/reconnects and recovers contacts/history/unread without losing thread', async () => {
  const f = fixture();
  try {
    f.client.authenticate('first-session-token'); await tick(); await f.client.open(9);
    const before = f.calls.length;
    f.client.authenticate('refreshed-session-token'); await tick();
    assert.deepEqual(f.tokens, ['first-session-token', 'refreshed-session-token']);
    assert.equal(f.sockets[0].disconnected, 1); assert.equal(f.client.snapshot().teacher, 9);
    const recovery = f.calls.slice(before).map(c => c.path);
    assert.ok(recovery.includes('/api/messages/contacts')); assert.ok(recovery.includes('/api/messages/unread-count'));
    assert.ok(recovery.includes('/api/messages/history?teacher_id=9&parent_id=88'));
    f.client.authenticate(''); assert.equal(f.sockets[1].disconnected, 1); assert.equal(f.client.snapshot().contacts.myId, null);
    assert.equal(f.sockets[1].listenerCount('receive_message'), 0);
  } finally {f.client.dispose();}
});
test('pushes deduplicate, read receipts target confirmed IDs, recovery closes ineligible threads', async () => {
  const f = fixture();
  try {
    f.client.authenticate('session'); await tick(); await f.client.open(9);
    f.sockets[0].emit('receive_message', message(2, {sender_role: 'parent'}));
    f.sockets[0].emit('receive_message', message(2, {sender_role: 'parent'}));
    assert.equal(f.client.snapshot().messages.length, 2);
    f.sockets[0].emit('messages_read', {teacher_id: 9, parent_id: 88, reader_role: 'teacher', message_ids: [2]});
    assert.equal(f.client.snapshot().messages.find(m => m.message_id === 2)?.is_read, true);
    f.setHistory([message(1), message(2, {sender_role: 'parent'})]); await f.client.loadHistory();
    assert.equal(f.client.snapshot().messages.find(m => m.message_id === 2)?.is_read, true);
    f.revoke(); await f.client.refresh(); assert.equal(f.client.snapshot().teacher, null); assert.deepEqual(f.client.snapshot().messages, []);
  } finally {f.client.dispose();}
});
test('a delayed history from a previous thread cannot populate a new selection', async () => {
  let finish: (value: Message[]) => void = () => {};
  const socket = new FakeSocket();
  const client = new MessagingClient(async <T>(path: string) => {
    if (path.endsWith('contacts')) return {myId: 88, contacts: [{id: 9}, {id: 10}]} as T;
    if (path.endsWith('unread-count')) return {unreadCount: 0} as T;
    if (path.includes('teacher_id=9')) return new Promise<Message[]>(resolve => {finish = resolve;}) as Promise<T>;
    return [message(3, {teacher_id: 10})] as T;
  }, () => socket as unknown as ChatSocket);
  try {
    client.authenticate('session'); await tick(); const old = client.open(9); await tick();
    await client.open(10); finish([message(1)]); await old;
    assert.deepEqual(client.snapshot().messages.map(m => m.teacher_id), [10]);
  } finally {client.dispose();}
});
