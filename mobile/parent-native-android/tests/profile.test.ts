import {test} from 'node:test';
import assert from 'node:assert/strict';
import {linkError, profilePayload, profileValues, validateProfile} from '../src/profile.ts';
test('profile payload contains only normalized changed editable fields', () => {
  const baseline = {...profileValues(), father_age: '42', address: 'Home'};
  const values = {...baseline, father_age: '', num_of_siblings: '0', address: ' Home ', emergency_contact: '09123456789'};
  assert.deepEqual(profilePayload(values, baseline), {emergency_contact: '09123456789', num_of_siblings: 0, father_age: null});
  assert.deepEqual(profilePayload({...baseline, father_age: '042'}, baseline), {});
});
test('profile validates contact, nonnegative integers, lengths, handedness and guardian names', () => {
  const empty = profileValues();
  assert.equal(validateProfile({...empty, emergency_contact: '09123456789', num_of_siblings: '0'}, empty), '');
  for (const emergency_contact of ['+639123456789', '08123456789', '0912345678', '０９１２３４５６７８９'])
    assert.match(validateProfile({...empty, emergency_contact}, empty), /09/);
  for (const father_age of ['-1', '1.5', '1e2', '9007199254740992'])
    assert.match(validateProfile({...empty, father_name: 'Juan', father_age}, empty), /whole numbers/);
  for (const prefix of ['father', 'mother', 'legal_guardian'] as const) {
    assert.match(validateProfile(empty, {...empty, [`${prefix}_name`]: 'Existing Guardian'}), /name is required/);
    assert.match(validateProfile({...empty, [`${prefix}_occ`]: 'Teacher'}, empty), /name is required/);
    assert.match(validateProfile({...empty, [`${prefix}_name`]: 'Bad123'}, empty), /letters/);
  }
  assert.match(validateProfile({...empty, address: 'x'.repeat(101)}, empty), /100/);
  assert.match(validateProfile({...empty, father_name: 'Juan', father_educ: 'x'.repeat(21)}, empty), /20/);
  assert.match(validateProfile({...empty, handedness: 'Both'}, empty), /Left or Right/);
});
test('linking accepts exactly twelve ASCII digits', () => {
  assert.equal(linkError('123456789012'), '');
  for (const value of ['12345678901', '1234567890123', '１２３４５６７８９０１２', '12345678901a']) assert.ok(linkError(value));
});
