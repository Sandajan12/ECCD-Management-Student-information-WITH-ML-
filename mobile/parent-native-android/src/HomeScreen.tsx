import React, {useMemo, useState} from 'react';
import {View} from 'react-native';
import type {Assessment, Child, Period, User} from './contracts';
import {PERIODS} from './contracts';
import {session} from './session';
import {messageOf} from './sessionCore';
import {drafts, useDraft} from './drafts';
import {homeKey, HomeObservations} from './homeObservations';
import type {HomeValues} from './homeObservations';
import {homeLock, visibleMark, WINDOWS} from './policy';
import {Feedback, useResource} from './resources';
import {Button, Card, Copy, Label, Notice, Title, styles} from './ui';

function HomeDomain({domain, child, user, assessment, period, service, busy}: {
  domain: Assessment['domains'][number]; child: Child; user: User; assessment: Assessment; period: Period; service: HomeObservations; busy: boolean;
}) {
  const {snapshot, ready, storageError} = useDraft<HomeValues>(homeKey(child.student_id, period, domain.domain_id, user.id), user.id);
  const [expanded, setExpanded] = useState(false);
  const questions = domain.questions.filter(q => q.is_home_based).sort((a, b) => a.sequence_order - b.sequence_order);
  if (!questions.length) return null;
  return <Card><Button secondary title={`${expanded ? 'Hide' : 'Show'} ${domain.domain_name} (${questions.length})`} onPress={() => setExpanded(!expanded)}/>
    {!!storageError && <Notice error>{storageError}</Notice>}
    {snapshot?.is_pending_sync && <Notice>A previous submission is unconfirmed. Drafts never send automatically. Refresh the saved answers, then submit eligible observations manually.</Notice>}
    {!!snapshot?.error && <Notice error>{snapshot.error}</Notice>}
    {expanded && questions.map(question => {
      const lock = homeLock(child, assessment, question, period);
      const value = snapshot?.values.answers[String(question.question_id)];
      const saved = visibleMark(child, assessment, question, period) ? question.answers[period] : null;
      return <View key={question.question_id} style={{gap: 8, paddingVertical: 8}}><Label>{question.sequence_order}. {question.question_text}</Label>
        {saved && <Copy>Saved observation: {saved}</Copy>}{!!lock && <Notice>{lock}</Notice>}
        <Copy>Local draft: {value || 'Not answered'}</Copy>
        <View style={styles.row}>{(['KAYA', 'DI-KAYA'] as const).map(answer => <Button key={answer} title={answer} secondary={value !== answer}
          disabled={!ready || !!lock || busy} onPress={() => {void service.change(domain.domain_id, period, question.question_id, answer).catch(() => {});}}/>)}
          {!!value && <Button secondary title="Remove local answer" disabled={!ready || busy} onPress={() => {void service.change(domain.domain_id, period, question.question_id, null).catch(() => {});}}/>}
        </View>
      </View>;
    })}
  </Card>;
}
export function HomeScreen({child, user, changed}: {child: Child; user: User; changed: () => void}) {
  const state = useResource<Assessment>(`/api/eccd/parent/assessment/${child.student_id}`, JSON.stringify(child));
  const [period, setPeriod] = useState<Period>('PRE');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const service = useMemo(() => new HomeObservations(drafts, user.id, child.student_id,
    payload => session.request('/api/eccd/parent/evaluate', 'POST', payload)), [user.id, child.student_id]);
  const submit = async () => {
    if (busy || !state.data) return;
    setBusy(true); setNotice('');
    try {
      await service.submit(child, state.data, period);
      setNotice('Observations saved. Confirmed answers are now locked.');
      changed();
      const refreshed = await Promise.allSettled([state.reload(), session.request(`/api/eccd/parent/dashboard-stats/${child.student_id}`)]);
      if (refreshed.some(result => result.status === 'rejected')) setNotice('Observations saved. Reconnect and refresh to load the latest dashboard.');
    } catch (error) {setNotice(messageOf(error));}
    finally {setBusy(false);}
  };
  return <><Card><Title>Home observations</Title><Feedback {...state}/>
    <Copy>Choose KAYA or DI-KAYA for home-based indicators. You may edit or remove local answers before submitting. Saved school observations cannot be changed here.</Copy>
    <Notice>Drafts stay on this device across logout and connection loss. Every submission requires a tap on Submit Observations.</Notice>
    {state.data && (!child.allow_parent_edit_home_based_eccd || !state.data.permissions.allow_parent_edit_home_based_eccd || !state.data.can_edit_home_based ?
      <Notice>Home observations are locked by the Class Adviser.</Notice> : !state.data.parent_assessment_access[WINDOWS[period]] ?
        <Notice>The {period} editing window is closed by the teacher.</Notice> : null)}
    <View style={styles.row}>{PERIODS.map(p => <Button key={p} title={p} disabled={busy} secondary={period !== p} onPress={() => {setPeriod(p); setNotice('');}}/>)}</View>
    {!!notice && <Notice>{notice}</Notice>}
    <Button title={busy ? 'Submitting…' : 'Submit Observations'} disabled={busy || !state.data || !child.allow_parent_edit_home_based_eccd || !state.data.permissions.allow_parent_edit_home_based_eccd || !state.data.can_edit_home_based || !state.data.parent_assessment_access[WINDOWS[period]]}
      onPress={() => void submit()}/>
  </Card>{state.data?.domains.map(domain => <HomeDomain key={`${domain.domain_id}_${period}`} domain={domain} child={child} user={user} assessment={state.data!} period={period} service={service} busy={busy}/>)}</>;
}
