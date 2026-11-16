import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessmentFixture} from './assessment-fixture.ts';
import {HomeObservations, homeKey} from '../src/homeObservations.ts';
import type {HomeValues} from '../src/homeObservations.ts';
import {homeLock} from '../src/policy.ts';
import {ApiError} from '../src/sessionCore.ts';

test('partial submission sends optional photo reference and preserves photo-only/unrelated drafts', async () => {
  const f = assessmentFixture();
  f.assessment.domains[0].questions[0].photo_eligible = {PRE: true};
  const photo = {uri: 'file:///private/local-proof.jpg', type: 'image/jpeg', name: 'proof.jpg'};
  let posts = 0, uploads = 0;
  const service = new HomeObservations(f.store, 123, 7, async payload => {
    posts++;
    assert.deepEqual(payload.evaluations, [{question_id: 45, testing_period: 'PRE', answer: 'KAYA'}]);
    assert.equal(payload.photo_ids?.[45], 'a'.repeat(32));
  }, async (question, period, selected) => {
    uploads++;
    assert.equal(question, 45); assert.equal(period, 'PRE'); assert.equal(selected.uri, photo.uri);
    return 'a'.repeat(32);
  });
  await service.photo(2, 'PRE', 45, photo);
  await service.photo(3, 'PRE', 48, photo);
  await service.change(2, 'PRE', 45, 'KAYA');
  await service.load(f.assessment, 'PRE');
  assert.equal(posts, 0); assert.equal(uploads, 0);
  const result = await service.submit(f.child, f.assessment, 'PRE');
  assert.deepEqual(result.questionIds, [45]);
  assert.equal(posts, 1); assert.equal(uploads, 1);
  assert.ok(f.store.peek<HomeValues>(homeKey(7, 'PRE', 3, 123), 123)?.values.photos?.['48']);
  assert.equal(f.store.peek(homeKey(7, 'PRE', 2, 123), 123), null);
  assert.equal([...f.records.values()].some(record => record.includes('base64')), false);
});

test('photo upload and parent submission require manual retries; stale carry conflicts retain URI and answers', async () => {
  const f = assessmentFixture();
  const question = f.assessment.domains[0].questions[0];
  question.photo_eligible = {PRE: true};
  let fail = true, uploads = 0, posts = 0;
  const service = new HomeObservations(f.store, 123, 7, async () => {posts++; if (fail) throw new ApiError('offline', 503);}, async () => {uploads++; return 'a'.repeat(32);});
  await service.photo(2, 'PRE', 45, {uri: 'file:///local.jpg', type:'image/jpeg', name:'local.jpg'});
  await service.change(2, 'PRE', 45, 'DI-KAYA');
  await assert.rejects(service.submit(f.child, f.assessment, 'PRE'), /draft is saved/);
  const key = homeKey(7, 'PRE', 2, 123);
  assert.equal(f.store.peek<HomeValues>(key, 123)?.values.photos?.['45'].uri, 'file:///local.jpg');
  assert.equal(uploads, 1);
  await service.load(f.assessment, 'PRE');
  assert.equal(posts, 1);
  question.photo_eligible.PRE = false;
  await assert.rejects(service.submit(f.child, f.assessment, 'PRE'), /earlier KAYA/);
  assert.equal(posts, 1);
  question.photo_eligible.PRE = true; fail = false;
  await service.submit(f.child, f.assessment, 'PRE');
  assert.equal(uploads, 1);
  assert.equal(posts, 2);
});

test('pending and declined observations lock parents without supplying an official answer', () => {
  const f = assessmentFixture();
  const question = f.assessment.domains[0].questions[0];
  for (const status of ['pending', 'declined'] as const) {
    question.home_observations = {PRE: {status, answer: 'KAYA', submitted_at: '2026-11-16T12:00:00+08:00'}};
    assert.ok(homeLock(f.child, f.assessment, question, 'PRE'));
    assert.equal(question.answers.PRE, null);
    assert.equal(question.carry_forward?.MID, undefined);
  }
});

test('account changes during an upload cannot submit the old draft under the replacement account', async () => {
  const f = assessmentFixture();
  f.assessment.domains[0].questions[0].photo_eligible = {PRE: true};
  let owner = 123, posts = 0;
  const service = new HomeObservations(f.store, 123, 7, async () => {posts++;}, async () => {
    owner = 456;
    return 'a'.repeat(32);
  }, () => owner === 123);
  await service.change(2, 'PRE', 45, 'KAYA');
  await service.photo(2, 'PRE', 45, {uri:'file:///original.jpg', type:'image/jpeg', name:'original.jpg'});
  await assert.rejects(service.submit(f.child, f.assessment, 'PRE'), /Account changed/);
  assert.equal(posts, 0);
  const original = f.store.peek<HomeValues>(homeKey(7, 'PRE', 2, 123), 123);
  assert.equal(original?.values.answers['45'], 'KAYA');
  assert.equal(original?.values.photos?.['45'].uri, 'file:///original.jpg');
  assert.equal(f.store.peek(homeKey(7, 'PRE', 2, 123), 456), null);
});
