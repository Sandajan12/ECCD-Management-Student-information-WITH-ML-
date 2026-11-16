import {test} from 'node:test';
import assert from 'node:assert/strict';
import {draft, DraftStore, OFFLINE_MESSAGE} from '../src/draftStore.ts';
import type {Storage} from '../src/draftStore.ts';
import {homeKey, HomeObservations} from '../src/homeObservations.ts';
import type {HomeValues} from '../src/homeObservations.ts';
import type {Assessment, Child, HomePayload} from '../src/contracts.ts';
import {ApiError} from '../src/sessionCore.ts';

function fixture() {
  const records = new Map<string, string>();
  const storage: Storage = {getItem: async key => records.get(key) || null, setItem: async (key, value) => {records.set(key, value);}, removeItem: async key => {records.delete(key);}};
  const store = new DraftStore(storage);
  const child = {student_id: 7, allow_parent_edit_home_based_eccd: true} as Child;
  const assessment = {can_edit_home_based: true, permissions: {allow_parent_edit_home_based_eccd: true},
    parent_assessment_access: {pre_test_parent_editable: true, mid_test_parent_editable: false, post_test_parent_editable: false},
    domains: [{domain_id: 2, domain_name: 'Motor', questions: [45, 46].map(question_id => ({question_id, is_home_based: true, parent_locked: {PRE: false}}))}]} as Assessment;
  return {records, storage, store, child, assessment};
}

test('inherited-only home answers remain visible and unsaved until manual confirmation', async () => {
  const f = fixture();
  f.assessment.parent_assessment_access.mid_test_parent_editable = true;
  f.assessment.domains[0].questions[0].carry_forward = {MID: 'locked'};
  let release: () => void = () => {}; let called: () => void = () => {};
  const started = new Promise<void>(resolve => {called = resolve;});
  const service = new HomeObservations(f.store, 123, 7, async payload => {
    assert.deepEqual(payload.evaluations, [{question_id: 45, testing_period: 'MID', answer: 'KAYA'}]);
    called(); await new Promise<void>(resolve => {release = resolve;});
  });
  await service.load(f.assessment, 'MID');
  assert.equal(f.records.size, 0);
  const sending = service.submit(f.child, f.assessment, 'MID');
  await started;
  const key = homeKey(7, 'MID', 2, 123);
  assert.equal(f.store.peek<HomeValues>(key, 123)?.is_pending_sync, true);
  // A newer answer must survive the old confirmation.
  await service.change(2, 'MID', 46, 'DI-KAYA');
  release();
  assert.deepEqual((await sending).questionIds, [45]);
  assert.equal(f.store.peek<HomeValues>(key, 123)?.values.answers['46'], 'DI-KAYA');
});

test('carry lock overrides stale DI-KAYA drafts; hidden carry restrictions cannot submit', async () => {
  const f = fixture();
  f.assessment.parent_assessment_access.post_test_parent_editable = true;
  const question = f.assessment.domains[0].questions[0];
  question.carry_forward = {POST: 'locked'};
  let sends = 0;
  const service = new HomeObservations(f.store, 123, 7, async payload => {
    sends++; assert.equal(payload.evaluations[0].answer, 'KAYA'); throw new TypeError('offline');
  });
  await service.change(2, 'POST', 45, 'DI-KAYA');
  await assert.rejects(service.submit(f.child, f.assessment, 'POST'), /Reconnect/);
  const key = homeKey(7, 'POST', 2, 123);
  assert.equal(f.store.peek<HomeValues>(key, 123)?.values.answers['45'], 'DI-KAYA');
  question.carry_forward.POST = 'restricted';
  await assert.rejects(service.submit(f.child, f.assessment, 'POST'), /unlocked/);
  assert.equal(sends, 1);
});
test('home envelope survives reconstruction and loading pending drafts never replays them', async () => {
  const f = fixture(); let sends = 0;
  const service = new HomeObservations(f.store, 123, 7, async () => {sends++;});
  await service.load(f.assessment, 'PRE'); await service.change(2, 'PRE', 45, 'KAYA');
  const key = homeKey(7, 'PRE', 2, 123);
  const saved = JSON.parse(f.records.get(key)!);
  assert.deepEqual(Object.keys(saved).sort(), ['owner_id', 'values', 'revision', 'is_pending_sync'].sort());
  assert.equal(saved.owner_id, 123); assert.deepEqual(saved.values, {answers: {'45': 'KAYA'}});
  assert.match(saved.revision, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  await f.store.put(key, {...saved, is_pending_sync: true});
  const restarted = new HomeObservations(new DraftStore(f.storage), 123, 7, async () => {sends++;});
  await restarted.load(f.assessment, 'PRE'); await restarted.load(f.assessment, 'PRE');
  assert.equal(sends, 0); assert.ok(f.records.has(key));
});
test('manual home submit persists exact request before HTTP and confirms only matching revision', async () => {
  const f = fixture(); const key = homeKey(7, 'PRE', 2, 123);
  let finish: () => void = () => {}; let called: () => void = () => {};
  const started = new Promise<void>(resolve => {called = resolve;});
  const post = async (payload: HomePayload) => {
    assert.deepEqual(payload, {student_id: 7, testing_period: 'PRE', evaluations: [{question_id: 45, testing_period: 'PRE', answer: 'KAYA'}]});
    const stored = JSON.parse(f.records.get(key)!); assert.equal(stored.is_pending_sync, true);
    assert.deepEqual(stored.request, {path: '/api/eccd/parent/evaluate', method: 'post', data: payload});
    called(); await new Promise<void>(resolve => {finish = resolve;});
  };
  const service = new HomeObservations(f.store, 123, 7, post);
  await service.load(f.assessment, 'PRE'); await service.change(2, 'PRE', 45, 'KAYA');
  const otherKey = homeKey(7, 'PRE', 2, 999); await f.store.put(otherKey, draft(999, {answers: {'45': 'DI-KAYA'}}));
  const sending = service.submit(f.child, f.assessment, 'PRE'); await started;
  await service.change(2, 'PRE', 46, 'DI-KAYA'); finish(); await sending;
  assert.deepEqual(f.store.peek<HomeValues>(key, 123)?.values.answers, {'45': 'KAYA', '46': 'DI-KAYA'});
  assert.ok(f.records.has(otherKey));
  await f.store.confirm(key, 999, f.store.peek<HomeValues>(key, 123)!.revision); assert.ok(f.records.has(key));
});
test('confirmed home cleanup retains locked unsubmitted values and other owners', async () => {
  const f = fixture(); f.assessment.domains[0].questions[1].parent_locked.PRE = true;
  const service = new HomeObservations(f.store, 123, 7, async payload => {assert.equal(payload.evaluations.length, 1);});
  await service.load(f.assessment, 'PRE'); await service.change(2, 'PRE', 45, 'KAYA'); await service.change(2, 'PRE', 46, 'DI-KAYA');
  await service.submit(f.child, f.assessment, 'PRE');
  assert.deepEqual(f.store.peek<HomeValues>(homeKey(7, 'PRE', 2, 123), 123)?.values.answers, {'46': 'DI-KAYA'});
});
test('network failures retain pending home draft; rejection retains answers and records error', async () => {
  const f = fixture(); let failure: Error = new TypeError('Network request failed');
  const service = new HomeObservations(f.store, 123, 7, async () => {throw failure;});
  await service.load(f.assessment, 'PRE'); await service.change(2, 'PRE', 45, 'KAYA');
  await assert.rejects(service.submit(f.child, f.assessment, 'PRE'), {message: OFFLINE_MESSAGE});
  const key = homeKey(7, 'PRE', 2, 123); assert.equal(f.store.peek<HomeValues>(key, 123)?.is_pending_sync, true);
  for (const status of [403, 409, 422]) {
    failure = new ApiError('Adviser locked this observation', status);
    await assert.rejects(service.submit(f.child, f.assessment, 'PRE'), /Adviser locked/);
    assert.equal(f.store.peek<HomeValues>(key, 123)?.is_pending_sync, false);
    assert.equal(f.store.peek<HomeValues>(key, 123)?.error, failure.message);
    assert.deepEqual(f.store.peek<HomeValues>(key, 123)?.values.answers, {'45': 'KAYA'});
  }
});
test('closed window/global permission/question lock never makes a home request', async () => {
  for (const gate of ['window', 'global', 'question']) {
    const f = fixture(); let sends = 0;
    const service = new HomeObservations(f.store, 123, 7, async () => {sends++;});
    await service.load(f.assessment, 'PRE'); await service.change(2, 'PRE', 45, 'KAYA');
    if (gate === 'window') f.assessment.parent_assessment_access.pre_test_parent_editable = false;
    if (gate === 'global') f.assessment.permissions.allow_parent_edit_home_based_eccd = false;
    if (gate === 'question') f.assessment.domains[0].questions[0].parent_locked.PRE = true;
    await assert.rejects(service.submit(f.child, f.assessment, 'PRE'), /unlocked/); assert.equal(sends, 0);
    assert.ok(f.records.has(homeKey(7, 'PRE', 2, 123)));
  }
});
test('storage writes and revision confirmation cannot race newer edits; corrupt storage is preserved', async () => {
  const f = fixture(); const key = 'ames_draft_123_parent_link';
  const older = draft(123, {lrn_number: '123456789012'}), newer = draft(123, {lrn_number: '222222222222'});
  const first = f.store.put(key, older); const second = f.store.put(key, newer);
  await Promise.all([first, second]); await f.store.confirm(key, 123, older.revision);
  assert.equal(JSON.parse(f.records.get(key)!).revision, newer.revision);
  f.records.set('corrupt', '{invalid'); await assert.rejects(f.store.load('corrupt', 123)); assert.equal(f.records.get('corrupt'), '{invalid');
});
test('full home confirmation removes only that domain; failed storage retains RAM and prevents submission', async () => {
  const f = fixture(); let sends = 0;
  const service = new HomeObservations(f.store, 123, 7, async () => {sends++;});
  await service.load(f.assessment, 'PRE'); await service.change(2, 'PRE', 45, 'KAYA');
  await service.submit(f.child, f.assessment, 'PRE');
  assert.equal(sends, 1); assert.equal(f.records.has(homeKey(7, 'PRE', 2, 123)), false);
  const unavailable = new DraftStore({...f.storage, setItem: async () => {throw new Error('Disk unavailable');}});
  const offline = new HomeObservations(unavailable, 123, 7, async () => {sends++;});
  await offline.load(f.assessment, 'PRE');
  await assert.rejects(offline.change(2, 'PRE', 45, 'KAYA'), /memory only/);
  assert.deepEqual(unavailable.peek<HomeValues>(homeKey(7, 'PRE', 2, 123), 123)?.values.answers, {'45': 'KAYA'});
  await assert.rejects(offline.submit(f.child, f.assessment, 'PRE'), /memory only/); assert.equal(sends, 1);
});
