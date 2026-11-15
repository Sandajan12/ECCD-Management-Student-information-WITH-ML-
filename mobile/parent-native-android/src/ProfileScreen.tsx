import React, {useState} from 'react';
import {View} from 'react-native';
import type {Child, ChildProfile, LinkResponse, User} from './contracts';
import {session} from './session';
import {messageOf, transient} from './sessionCore';
import {draft, OFFLINE_MESSAGE} from './draftStore';
import {drafts, useDraft} from './drafts';
import {linkError, PROFILE_FIELDS, profilePayload, profileValues, validateProfile} from './profile';
import type {ProfileField, ProfileValues} from './profile';
import {Feedback, useResource} from './resources';
import {Button, Card, Copy, Input, Label, Notice, Title, styles} from './ui';

interface LinkValues { lrn_number: string; relationship_type: string; }
export function LinkChild({user, linked, close}: {user: User; linked: (id: number) => Promise<void>; close: () => void}) {
  const key = `ames_draft_${user.id}_parent_link`;
  const {snapshot, ready, storageError} = useDraft<LinkValues>(key, user.id);
  const values = snapshot?.values || {lrn_number: '', relationship_type: 'Guardian'};
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const change = (next: LinkValues) => {void drafts.put(key, draft(user.id, next)).catch(() => {});};
  const submit = async () => {
    if (!ready || busy) return;
    const error = linkError(values.lrn_number); if (error) {setNotice(error); return;}
    setBusy(true); setNotice('');
    try {
      const saved = draft(user.id, values); await drafts.put(key, saved);
      const response = await session.request<LinkResponse>('/api/parents/children/link', 'POST', {
        lrn_number: values.lrn_number.trim(), relationship_type: values.relationship_type.trim() || 'Guardian',
      });
      await drafts.confirm(key, user.id, saved.revision);
      setNotice(response.status === 'PENDING' ? `Pending adviser approval. ${response.message}` : response.message);
      if (response.status === 'SYNCED') await linked(response.student_id);
    } catch (error) {setNotice(transient(error) ? OFFLINE_MESSAGE : messageOf(error));}
    finally {setBusy(false);}
  };
  return <Card><Title>Link child</Title><Copy>Enter the child’s 12-digit LRN supplied by the school. Requests may require adviser approval.</Copy>
    {!!storageError && <Notice error>{storageError}</Notice>}
    <Input label="12-digit LRN" value={values.lrn_number} keyboardType="number-pad" editable={ready && !busy} onChangeText={lrn_number => change({...values, lrn_number})}/>
    <Input label="Relationship (optional)" value={values.relationship_type} editable={ready && !busy} onChangeText={relationship_type => change({...values, relationship_type})}/>
    {!!notice && <Notice>{notice}</Notice>}
    <Button title={busy ? 'Linking…' : 'Link Child'} disabled={!ready || busy} onPress={() => void submit()}/>
    <Button secondary title="Close (keep draft)" onPress={close}/>
  </Card>;
}
export function ProfileScreen({user, child, changed}: {user: User; child: Child; changed: () => Promise<void>}) {
  const state = useResource<ChildProfile>(`/api/students/${child.student_id}`, JSON.stringify(child));
  const key = `ames_draft_${user.id}_parent_profile_${child.student_id}`;
  const {snapshot, ready, storageError} = useDraft<ProfileValues>(key, user.id);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const record = state.data;
  const visible = child.allow_parent_view_student_info && record?.allow_parent_view_student_info;
  const editable = visible && child.allow_parent_edit_student_info && record?.allow_parent_edit_student_info;
  const values = snapshot?.values || profileValues(record || undefined);
  const baseline = snapshot?.baseline || profileValues(record || undefined);
  const change = (field: ProfileField, value: string) => {void drafts.put(key, draft(user.id, {...values, [field]: value}, baseline)).catch(() => {});};
  const save = async () => {
    if (!editable || !ready || busy || !record) return;
    const error = validateProfile(values, baseline) || validateProfile(values, profileValues(record));
    if (error) {setNotice(error); return;}
    const payload = profilePayload(values, baseline);
    if (!Object.keys(payload).length) {setNotice('No changed fields to save.'); return;}
    setBusy(true); setNotice('');
    const saved = draft(user.id, values, baseline);
    try {
      await drafts.put(key, {...saved, is_pending_sync: true, request: {path: `/api/parents/children/${child.student_id}`, method: 'put', data: payload}});
      await session.request(`/api/parents/children/${child.student_id}`, 'PUT', payload);
      await drafts.confirm(key, user.id, saved.revision);
      const newer = drafts.peek<ProfileValues>(key, user.id);
      if (newer) await drafts.put(key, {...newer, baseline: values});
      state.update({...record, ...payload} as ChildProfile);
      setNotice('Profile changes saved.'); await Promise.all([state.reload(), changed()]);
    } catch (error) {
      if (!transient(error)) await drafts.confirm<ProfileValues>(key, user.id, saved.revision,
        current => ({...current, is_pending_sync: false, error: messageOf(error)})).catch(() => {});
      setNotice(transient(error) ? OFFLINE_MESSAGE : messageOf(error));
    } finally {setBusy(false);}
  };
  return <><Card><Title>Child profile</Title><Feedback {...state}/>
    {!visible ? <Notice>Student information is restricted by the adviser. Saved drafts are preserved on this device.</Notice> : record && <>
      <Label>{record.full_name || 'Child'}</Label><Copy>LRN: {record.masked_lrn}</Copy>
      <Copy>Birth date: {record.date_of_birth ?? '—'} · Gender: {record.gender ?? '—'} · Age: {record.age ?? '—'}</Copy>
      <Copy>Section: {record.section_name ?? '—'} · School year: {record.school_year ?? '—'}</Copy>
      <Copy>Adviser: {record.adviser_name ?? '—'} · Profile completeness: {record.profile_completeness}%</Copy>
    </>}
  </Card>{visible && <Card><Title>Household information</Title>
    {!editable && <Notice>Profile editing is locked by the adviser.</Notice>}
    {!!storageError && <Notice error>{storageError}</Notice>}
    {PROFILE_FIELDS.map(field => field === 'handedness' ? <View key={field} style={{gap: 8}}><Label>Handedness: {values.handedness || 'Not supplied'}</Label><View style={styles.row}>
      {(['', 'Left', 'Right'] as const).map(value => <Button key={value} title={value || 'Not supplied'} secondary={values.handedness !== value} disabled={!editable || !ready || busy} onPress={() => change(field, value)}/>)}</View></View> :
      <Input key={field} label={field.replaceAll('_', ' ')} value={values[field]} editable={Boolean(editable && ready && !busy)}
        keyboardType={field.endsWith('_age') || field === 'num_of_siblings' || field === 'emergency_contact' ? 'number-pad' : 'default'}
        onChangeText={value => change(field, value)}/>)}
    {!!snapshot && <Copy>Draft saved separately from school records. Save changes manually when online.</Copy>}
    {!!notice && <Notice>{notice}</Notice>}
    <Button title={busy ? 'Saving…' : 'Save profile changes'} disabled={!editable || !ready || busy} onPress={() => void save()}/>
  </Card>}</>;
}
