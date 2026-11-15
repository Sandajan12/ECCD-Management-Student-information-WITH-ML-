import type {Answer, Assessment, Child, HomePayload, Period} from './contracts.ts';
import {homeLock} from './policy.ts';
import {ApiError, messageOf} from './sessionCore.ts';
import {draft, DraftStore, OFFLINE_MESSAGE} from './draftStore.ts';
import type {Draft} from './draftStore.ts';
export interface HomeValues { answers: Record<string, Answer>; }
export interface HomeSubmission { questionIds: number[]; cleanupWarning?: string; }
export const homeKey = (student: number, period: Period, domain: number, owner: number) => `eccd_draft_${student}_${period}_${domain}_home_${owner}`;
export class HomeObservations {
  constructor(private store: DraftStore, private owner: number, private student: number,
    private post: (payload: HomePayload) => Promise<unknown>) {}
  async load(assessment: Assessment, period: Period) {
    await Promise.all(assessment.domains.map(d => this.store.load<HomeValues>(homeKey(this.student, period, d.domain_id, this.owner), this.owner)));
  }
  change(domain: number, period: Period, question: number, answer: Answer | null): Promise<void> {
    const key = homeKey(this.student, period, domain, this.owner);
    const answers = {...this.store.peek<HomeValues>(key, this.owner)?.values.answers};
    if (answer === null) delete answers[String(question)]; else answers[String(question)] = answer;
    return this.store.put(key, draft(this.owner, {answers}));
  }
  /** Called only from the Submit button; loading or reconnecting never calls this method. */
  async submit(child: Child, assessment: Assessment, period: Period, confirmed: readonly number[] = []): Promise<HomeSubmission> {
    await this.load(assessment, period);
    const snapshots: Array<{key: string; snapshot: Draft<HomeValues>; answers: Record<string, Answer>}> = [];
    const payload: HomePayload = {student_id: this.student, testing_period: period, evaluations: []};
    for (const domain of assessment.domains) {
      const key = homeKey(this.student, period, domain.domain_id, this.owner);
      const snapshot = this.store.peek<HomeValues>(key, this.owner);
      if (!snapshot) continue;
      const answers: Record<string, Answer> = {};
      for (const question of domain.questions) {
        const answer = snapshot.values.answers[String(question.question_id)];
        if (answer && !confirmed.includes(question.question_id) && !homeLock(child, assessment, question, period)) {
          answers[String(question.question_id)] = answer;
          payload.evaluations.push({question_id: question.question_id, testing_period: period, answer});
        }
      }
      if (Object.keys(answers).length) snapshots.push({key, snapshot, answers});
    }
    if (!payload.evaluations.length || payload.evaluations.length > 1000) throw new Error('Choose between 1 and 1000 unlocked home observations for this period. Locked drafts remain saved.');
    // Persist every request snapshot before HTTP so a process death cannot lose the attempted answers.
    await Promise.all(snapshots.map(({key, snapshot}) => this.store.put(key, {...snapshot, is_pending_sync: true,
      error: undefined, request: {path: '/api/eccd/parent/evaluate', method: 'post', data: payload}})));
    try {
      await this.post(payload);
    } catch (error) {
      const network = !(error instanceof ApiError) || [408, 425].includes(error.status) || error.status >= 500;
      if (!network) await Promise.all(snapshots.map(({key, snapshot}) => this.store.confirm<HomeValues>(key, this.owner, snapshot.revision,
        current => ({...current, is_pending_sync: false, error: messageOf(error)}))));
      throw new Error(network ? OFFLINE_MESSAGE : messageOf(error));
    }
    const cleanup = await Promise.allSettled(snapshots.map(({key, snapshot, answers}) => this.store.confirm<HomeValues>(key, this.owner, snapshot.revision, current => {
      const remaining = {...current.values.answers};
      for (const [question, answer] of Object.entries(answers)) if (remaining[question] === answer) delete remaining[question];
      return Object.keys(remaining).length ? {...current, values: {answers: remaining}, is_pending_sync: false, request: undefined, error: undefined} : null;
    })));
    // A local cleanup failure must not turn a confirmed server save into a retry.
    return {questionIds: payload.evaluations.map(item => item.question_id),
      ...(cleanup.some(result => result.status === 'rejected')
        ? {cleanupWarning: 'Observations saved. Local draft cleanup could not be completed on this device.'} : {})};
  }
}
