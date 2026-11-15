import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AppState, Linking, Text, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {session} from './session';
import {messageOf, transient} from './sessionCore';
import type {Assessment, Child, Dashboard, Period, Prediction, Readiness, User} from './contracts';
import {PERIODS} from './contracts';
import {canPredict, released, VIEW_FLAGS, visibleMark} from './policy';
import {Button, Card, Copy, Label, Loading, Notice, Title, styles} from './ui';

function useResource<T>(path: string, revision = '') {
  const [state, setState] = useState<{data: T | null; error: string; loading: boolean}>({data: null, error: '', loading: true});
  const version = useRef(0);
  const load = useCallback(async () => {
    const request = ++version.current;
    try { const data = await session.request<T>(path); if (version.current === request) setState({data, error: '', loading: false}); }
    catch (e) { if (version.current === request) setState(old => ({data: transient(e) ? old.data : null, error: messageOf(e), loading: false})); }
  }, [path]);
  useEffect(() => {
    setState({data: null, error: '', loading: true}); void load();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void load(); }, 20000);
    const listener = AppState.addEventListener('change', value => { if (value === 'active') void load(); });
    return () => { version.current++; clearInterval(timer); listener.remove(); };
  }, [load, revision]);
  return {...state, reload: load};
}
function Feedback({error, loading, reload}: {error: string; loading: boolean; reload: () => Promise<void>}) {
  return <>{loading && <Loading/>}{!!error && <Notice error>{error}<Text onPress={() => void reload()}> Tap Refresh to retry.</Text></Notice>}
    <Button secondary title="Refresh" disabled={loading} onPress={() => void reload()}/></>;
}
function DashboardTab({child}: {child: Child}) {
  const state = useResource<Dashboard>(`/api/eccd/parent/dashboard-stats/${child.student_id}`, JSON.stringify(child));
  const data = state.data;
  const phase = data?.latestPhase || data?.currentPhase;
  const allowed = phase === 'PRE' || phase === 'MID' || phase === 'POST' ? child[VIEW_FLAGS[phase]] && data?.is_published : false;
  return <><Card><Title>Learning dashboard</Title><Feedback {...state}/>{data && <><Label>Current phase: {data.currentPhase}</Label>
    {!allowed ? <Notice>Results Pending Adviser Release</Notice> : <><Label>{data.overallStatus}</Label><Copy>{data.interpretation}</Copy>
      <Copy>Excels in: {data.excelsIn}</Copy><Copy>Needs support in: {data.needsSupportIn}</Copy>
      <Copy>KAYA: {data.totalKaya ?? '—'} · DI-KAYA: {data.totalDiKaya ?? '—'}</Copy>
      {data.assessmentMastered && <Notice>All indicators in this assessment have been mastered.</Notice>}</>}
  </>}</Card>{allowed && data?.domainCards.map(domain => <Card key={domain.domain_id}><Label>{domain.domain_name}</Label><Copy>{domain.scoreText} · {domain.progress ?? '—'}%</Copy><Copy>{domain.statusText}</Copy></Card>)}</>;
}
function ResultsTab({child}: {child: Child}) {
  const state = useResource<Assessment>(`/api/eccd/parent/assessment/${child.student_id}`, JSON.stringify(child));
  const [period, setPeriod] = useState<Period>('PRE');
  const [expanded, setExpanded] = useState<number | null>(null);
  const data = state.data;
  const summary = data?.summary[period];
  const isReleased = data ? released(child, data, period) : false;
  return <><Card><Title>ECCD results</Title><Feedback {...state}/><View style={styles.row}>{PERIODS.map(p => <Button key={p} title={p} secondary={p !== period} onPress={() => setPeriod(p)}/>)}</View>
    {data && summary && (isReleased ? <><Label>{summary.interpretation || 'Not yet evaluated'}</Label>
      <Copy>Assessment date: {summary.assessmentDate ?? '—'}</Copy><Copy>Decimal age: {summary.decimalAge ?? '—'}</Copy>
      <Copy>Standard score: {summary.standardScore ?? '—'}</Copy><Copy>Sum of scaled scores: {summary.sumOfScaledScores ?? '—'}</Copy>
      {Object.keys(summary.rawScores || {}).map(code => <Copy key={code}>{code} · Raw {summary.rawScores?.[code] ?? '—'} · Scaled {summary.scaledScores?.[code] ?? '—'}</Copy>)}
    </> : <Notice>Results Pending Adviser Release</Notice>)}
  </Card>{data && <><Card><Label>Scaled scores by period</Label>{data.matrix.map(row => <View key={row.domain_id}><Label>{row.domain_name}</Label>
    <Copy>{PERIODS.map(p => `${p}: ${released(child, data, p) ? row.scores[p] ?? '—' : 'Pending release'}`).join('  ·  ')}</Copy></View>)}</Card>
    <Card><Label>Adviser access</Label>
      <Copy>Student information: {child.allow_parent_view_student_info && data.permissions.allow_parent_view_student_info ? 'Available' : 'Locked'}</Copy>
      <Copy>Profile editing: {child.allow_parent_edit_student_info && data.permissions.allow_parent_edit_student_info ? 'Allowed by adviser' : 'Locked by adviser'}</Copy>
      <Copy>Home observations: {child.allow_parent_edit_home_based_eccd && data.permissions.allow_parent_edit_home_based_eccd && data.can_edit_home_based ? 'Enabled in open period windows' : 'Read-only / locked'}</Copy>
      <Copy>Prediction access: {child.allow_parent_predictions && data.permissions.allow_parent_predictions ? 'Enabled; PRE readiness and release also required' : 'Locked'}</Copy>
      <Copy>Recorded marks: {child.allow_parent_view_eccd_marks && data.permissions.allow_parent_view_eccd_marks && data.allow_parent_view_eccd_marks ? 'Available independently of score release' : 'Restricted; only your own eligible home observations may appear'}</Copy>
      <Copy>This release displays results. Profile and home-observation editing arrive in Phase 2.</Copy>
    </Card>
    {data.domains.map(domain => <Card key={domain.domain_id}><Button secondary title={`${expanded === domain.domain_id ? 'Hide' : 'Show'} ${domain.domain_name} indicators (${domain.questions.length})`} onPress={() => setExpanded(expanded === domain.domain_id ? null : domain.domain_id)}/>
      {expanded === domain.domain_id && [...domain.questions].sort((a, b) => a.sequence_order - b.sequence_order).map(q => {
        const visible = visibleMark(child, data, q, period);
        return <View key={q.question_id} style={{gap: 4}}><Label>{q.sequence_order}. {q.question_text}</Label><Copy>{q.is_home_based ? 'Home-based indicator' : 'School indicator'}</Copy>
          <Copy>{visible ? `${q.answers[period] ?? 'Not yet marked'}${q.evaluator_roles[period] ? ` · ${q.evaluator_roles[period]}` : ''}` : 'Recorded answer withheld by adviser'}</Copy>
          {visible && q.parent_submitted_at[period] && <Copy>Parent submitted: {q.parent_submitted_at[period]}</Copy>}
          {visible && q.teacher_marked_at[period] && <Copy>Teacher saved: {q.teacher_marked_at[period]}</Copy>}
        </View>;
      })}
    </Card>)}</>}</>;
}
function InsightsTab({child}: {child: Child}) {
  const state = useResource<Readiness>(`/api/ml/parent/readiness/${child.student_id}`, JSON.stringify(child));
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const version = useRef(0);
  useEffect(() => () => { mounted.current = false; version.current++; }, []);
  const allowed = state.data ? canPredict(child, state.data) : false;
  useEffect(() => { version.current++; setPrediction(null); }, [allowed, child.student_id]);
  const predict = async () => {
    if (!allowed || busy) return;
    const request = ++version.current; setBusy(true); setError('');
    try { const result = await session.request<Prediction>(`/api/ml/parent/predict/${child.student_id}`, 'POST'); if (mounted.current && request === version.current) setPrediction(result); }
    catch (e) { if (mounted.current && request === version.current) setError(messageOf(e)); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <><Card><Title>ML insights</Title><Feedback {...state}/>{state.data && <Copy>{state.data.readiness_note}</Copy>}
    {!allowed && <Notice>Insights require adviser prediction permission, released PRE results, and complete teacher-confirmed PRE data.</Notice>}
    <Button title={busy ? 'Generating insights…' : 'Generate insights'} disabled={!allowed || busy} onPress={() => void predict()}/>{!!error && <Notice error>{error}</Notice>}
  </Card>{allowed && prediction && <><Card><Label>Predicted POST interpretation</Label><Title>{prediction.predicted_post_interpretation ?? 'Unavailable'}</Title>
    {Object.entries(prediction.confidence_percentages).map(([label, value]) => <Copy key={label}>{label}: {value.toFixed(1)}%</Copy>)}
    <Notice>{prediction.interpretation_note}</Notice><Notice>{prediction.research_notice}</Notice>
  </Card><Card><Label>PRE baseline</Label>{prediction.baseline_domains.map(d => <Copy key={d.domain}>{d.name}: {d.pre_scaled_score} · {d.tier}</Copy>)}</Card>
    {prediction.interventions.map((d, index) => <Card key={`${d.domain}_${index}`}><Label>{d.name} · {d.tier}</Label><Copy>Goal: {d.goal}</Copy>
      <Copy>At home: {d.home_activity}</Copy><Copy>Practice: {d.practice}</Copy><Copy>Support: {d.scaffolding}</Copy>
      <Copy>Review after {d.review_days} days</Copy><Copy>Success check: {d.success_check}</Copy>
      {d.source_url.startsWith('https://') && <Button secondary title="Read activity source" onPress={() => { void Linking.openURL(d.source_url).catch(e => setError(messageOf(e))); }}/>}</Card>)}
  </>}</>;
}
export function ChildPortal({user}: {user: User}) {
  const state = useResource<Child[]>('/api/students/my-child');
  const [selected, setSelected] = useState<number>(0);
  const [tab, setTab] = useState<'Dashboard' | 'ECCD Results' | 'ML Insights'>('Dashboard');
  const [storageError, setStorageError] = useState('');
  const [selectionReady, setSelectionReady] = useState(false);
  const storageVersion = useRef(0);
  const key = `ames_child_${user.id}`;
  useEffect(() => {
    const version = ++storageVersion.current;
    void AsyncStorage.getItem(key).then(value => { if (version === storageVersion.current) setSelected(Number(value) || 0); }).catch(() => setStorageError('Child selection could not be restored on this device.')).finally(() => { if (version === storageVersion.current) setSelectionReady(true); });
    return () => { storageVersion.current++; };
  }, [key]);
  const children = state.data || [];
  const child = selectionReady ? children.find(c => c.student_id === selected) || children[0] : undefined;
  useEffect(() => {
    if (!child) return;
    if (selected !== child.student_id) setSelected(child.student_id);
    void AsyncStorage.setItem(key, String(child.student_id)).catch(() => setStorageError('Child selection will last for this session only.'));
  }, [key, child?.student_id, selected]);
  const select = (id: number) => {
    storageVersion.current++; setSelected(id);
    void AsyncStorage.setItem(key, String(id)).catch(() => setStorageError('Child selection will last for this session only.'));
  };
  return <><Card><Title>My children</Title><Copy>Hello, {user.full_name || 'Parent'}</Copy><Feedback {...state}/>{!!storageError && <Notice>{storageError}</Notice>}
    {!state.loading && !children.length && <Notice>No eligible linked children are available. Ask your child’s adviser to confirm the family link and active section assignment.</Notice>}
    {children.map(c => <View key={c.student_id} style={{gap: 8}}><Button disabled={!selectionReady} title={`${child?.student_id === c.student_id ? '✓ ' : ''}${c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || `Child ${c.student_id}`}`} secondary={child?.student_id !== c.student_id} onPress={() => select(c.student_id)}/>
      <Copy>Section: {c.section_name || c.class_name || '—'} · School year: {c.school_year || '—'}</Copy>
      <Copy>Adviser: {c.adviser_name || `${c.teacher_fname || ''} ${c.teacher_lname || ''}`.trim() || '—'} · {c.is_active ? 'Active' : 'Inactive'}</Copy>
      {child?.student_id === c.student_id && (c.allow_parent_view_student_info ? <Copy>Birth date: {c.date_of_birth ?? '—'} · Gender: {c.gender ?? '—'} · LRN: {c.masked_lrn}</Copy> : <Notice>Student information is locked by the adviser.</Notice>)}
    </View>)}
  </Card>{child && <><View style={styles.row}>{(['Dashboard', 'ECCD Results', 'ML Insights'] as const).map(t => <Button key={t} title={t} secondary={tab !== t} onPress={() => setTab(t)}/>)}</View>
    <View key={`${user.id}_${child.student_id}_${tab}`} style={{gap: 16}}>{tab === 'Dashboard' ? <DashboardTab child={child}/> : tab === 'ECCD Results' ? <ResultsTab child={child}/> : <InsightsTab child={child}/>}</View>
  </>}</>;
}
