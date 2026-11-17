import type {Answer, Assessment, Child, HomePayload, Period} from './contracts.ts';
import {homeLock} from './policy.ts';
import {ApiError, messageOf} from './sessionCore.ts';
import {draft, DraftStore, OFFLINE_MESSAGE} from './draftStore.ts';
import type {Draft} from './draftStore.ts';
export interface HomePhoto {uri: string; type: string; name: string; photo_id?: string;}
export interface HomeValues { answers: Record<string, Answer>; photos?: Record<string, HomePhoto>; }
export interface HomeSubmission { questionIds: number[]; cleanupWarning?: string; }
export const homeKey = (student: number, period: Period, domain: number, owner: number) => `eccd_draft_${student}_${period}_${domain}_home_${owner}`;
export class HomeObservations {
  constructor(private store: DraftStore, private owner: number, private student: number,
    private post: (payload: HomePayload) => Promise<unknown>,
    private upload?: (question: number, period: Period, photo: HomePhoto) => Promise<string>,
    private isCurrentOwner: () => boolean = () => true) {}
  async load(assessment: Assessment, period: Period) {
    await Promise.all(assessment.domains.map(d => this.store.load<HomeValues>(homeKey(this.student, period, d.domain_id, this.owner), this.owner)));
  }
  change(domain: number, period: Period, question: number, answer: Answer | null): Promise<void> {
    const key = homeKey(this.student, period, domain, this.owner);
    const previous = this.store.peek<HomeValues>(key, this.owner)?.values;
    const answers = {...previous?.answers};
    if (answer === null) delete answers[String(question)]; else answers[String(question)] = answer;
    return this.store.put(key, draft(this.owner, {...previous, answers}));
  }
  photo(domain: number, period: Period, question: number, photo: HomePhoto | null): Promise<void> {
    const key = homeKey(this.student, period, domain, this.owner);
    const previous = this.store.peek<HomeValues>(key, this.owner)?.values;
    const photos = {...previous?.photos};
    if (photo) photos[String(question)] = photo; else delete photos[String(question)];
    return this.store.put(key, draft(this.owner, {...previous, answers: {...previous?.answers}, photos}));
  }
  /** Called only from the Submit button; loading or reconnecting never calls this method. */
  async submit(child: Child, assessment: Assessment, period: Period, confirmed: readonly number[] = []): Promise<HomeSubmission> {
    await this.load(assessment, period);
    const snapshots: Array<{key: string; snapshot: Draft<HomeValues>; answers: Record<string, Answer>}> = [];
    const payload: HomePayload = {student_id: this.student, testing_period: period, evaluations: []};
    for (const domain of assessment.domains) {
      const key = homeKey(this.student, period, domain.domain_id, this.owner);
      const stored = this.store.peek<HomeValues>(key, this.owner);
      const answers: Record<string, Answer> = {};
      for (const question of domain.questions) {
        const answer = question.carry_forward?.[period] === 'locked' ? 'KAYA' : stored?.values.answers[String(question.question_id)];
        if (answer && !confirmed.includes(question.question_id) && !homeLock(child, assessment, question, period)) {
          answers[String(question.question_id)] = answer;
          payload.evaluations.push({question_id: question.question_id, testing_period: period, answer});
        }
      }
      if (Object.keys(answers).length) {
        // Capture the actual explicit request while retaining conflicting local work until confirmation.
        const snapshot = stored || draft(this.owner, {answers});
        snapshots.push({key, snapshot, answers});
      }
    }
    if (!payload.evaluations.length || payload.evaluations.length > 1000) throw new Error('Choose between 1 and 1000 unlocked home observations for this period. Locked drafts remain saved.');
    // Persist every request snapshot before HTTP so a process death cannot lose the attempted answers.
    await Promise.all(snapshots.map(({key, snapshot}) => this.store.put(key, {...snapshot, is_pending_sync: true,
      error: undefined, request: {path: '/api/eccd/parent/evaluate', method: 'post', data: payload}})));
    let uploadingPhoto = false;
    try {
      for (const {key, snapshot} of snapshots) {
        for (const row of payload.evaluations) {
          if (!this.isCurrentOwner()) throw new ApiError('Account changed. Your original draft is preserved; sign in to that account to submit it.', 409);
          const photo = snapshot.values.photos?.[String(row.question_id)];
          if (!photo) continue;
          const question = assessment.domains.flatMap(d => d.questions).find(q => q.question_id === row.question_id);
          if (question?.photo_eligible?.[period] !== true) throw new ApiError('An earlier KAYA now carries forward. Remove its optional photo before submitting.', 409);
          uploadingPhoto = !photo.photo_id;
          if (!this.upload) throw new ApiError('Photo upload is unavailable.', 503);
          const photoId = photo.photo_id || await this.upload(row.question_id, period, photo);
          uploadingPhoto = false;
          await this.store.confirm<HomeValues>(key, this.owner, snapshot.revision, current => ({...current,
            values: {...current.values, photos: {...current.values.photos, [row.question_id]: {...photo, photo_id: photoId}}}}));
          payload.photo_ids = {...payload.photo_ids, [row.question_id]: photoId};
        }
      }
      if (!this.isCurrentOwner()) throw new ApiError('Account changed. Your original draft is preserved; sign in to that account to submit it.', 409);
      await this.post(payload);
    } catch (error) {
      const network = !(error instanceof ApiError) || [408, 425].includes(error.status) || error.status >= 500;
      if (!network) await Promise.all(snapshots.map(({key, snapshot}) => this.store.confirm<HomeValues>(key, this.owner, snapshot.revision,
        current => ({...current, is_pending_sync: false, error: messageOf(error)}))));
      const message = uploadingPhoto && error instanceof ApiError
        ? `${messageOf(error)} Your answers and photo are saved on this device. Submit again when photo uploads are available.`
        : network ? OFFLINE_MESSAGE : messageOf(error);
      throw new Error(message);
    }
    const cleanup = await Promise.allSettled(snapshots.map(({key, snapshot, answers}) => this.store.confirm<HomeValues>(key, this.owner, snapshot.revision, current => {
      const remaining = {...current.values.answers};
      const photos = {...current.values.photos};
      for (const [question, answer] of Object.entries(answers)) if (remaining[question] === answer) delete remaining[question];
      for (const question of Object.keys(answers)) delete photos[question];
      return Object.keys(remaining).length || Object.keys(photos).length ? {...current, values: {answers: remaining, photos}, is_pending_sync: false, request: undefined, error: undefined} : null;
    })));
    // A local cleanup failure must not turn a confirmed server save into a retry.
    return {questionIds: payload.evaluations.map(item => item.question_id),
      ...(cleanup.some(result => result.status === 'rejected')
        ? {cleanupWarning: 'Observations saved. Local draft cleanup could not be completed on this device.'} : {})};
  }
}
