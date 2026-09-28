import type { AxiosInstance } from 'axios';

export interface EccdDraftPayload {
  student_lrn: string;
  testing_period: string; // 'PRE' | 'MID' | 'POST'
  domain_id: number | string;
  evaluation_date: string;
  answers: Record<string, string>; // Maps question_id to "KAYA" | "DI-KAYA"
  is_pending_sync: boolean;
  updated_at: string;
}

const DRAFT_PREFIX = 'eccd_draft_';

/**
 * Generate isolated composite localStorage key for a specific student, period, and domain.
 * Format: eccd_draft_${studentLrn}_${testingPeriod}_${domainId}
 */
export const getDraftKey = (studentLrn: string, period: string, domainId: number | string): string => {
  return `${DRAFT_PREFIX}${studentLrn}_${period}_${domainId}`;
};

/**
 * Save draft payload to localStorage under its composite key.
 */
export const saveDraft = (draft: EccdDraftPayload): void => {
  try {
    const key = getDraftKey(draft.student_lrn, draft.testing_period, draft.domain_id);
    localStorage.setItem(key, JSON.stringify(draft));
  } catch (err) {
    console.error('Failed to save ECCD draft to localStorage:', err);
  }
};

/**
 * Retrieve cached draft from localStorage.
 */
export const getDraft = (
  studentLrn: string,
  period: string,
  domainId: number | string
): EccdDraftPayload | null => {
  try {
    const key = getDraftKey(studentLrn, period, domainId);
    const item = localStorage.getItem(key);
    if (!item) return null;
    return JSON.parse(item) as EccdDraftPayload;
  } catch (err) {
    console.error('Failed to load ECCD draft from localStorage:', err);
    return null;
  }
};

/**
 * Safely remove an individual draft by its composite components.
 * Adheres strictly to the Zero-Assumption rule: Never clear unrelated items.
 */
export const removeDraft = (
  studentLrn: string,
  period: string,
  domainId: number | string
): void => {
  try {
    const key = getDraftKey(studentLrn, period, domainId);
    localStorage.removeItem(key);
  } catch (err) {
    console.error('Failed to remove ECCD draft from localStorage:', err);
  }
};

/**
 * Safely remove an individual draft by its exact key.
 */
export const removeDraftByKey = (key: string): void => {
  try {
    if (key.startsWith(DRAFT_PREFIX)) {
      localStorage.removeItem(key);
    }
  } catch (err) {
    console.error('Failed to remove ECCD draft by key:', err);
  }
};

/**
 * Query all cached drafts marked with is_pending_sync === true.
 */
export const getPendingSyncDrafts = (): { key: string; draft: EccdDraftPayload }[] => {
  const pending: { key: string; draft: EccdDraftPayload }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(DRAFT_PREFIX)) {
        const item = localStorage.getItem(key);
        if (item) {
          try {
            const draft = JSON.parse(item) as EccdDraftPayload;
            if (draft.is_pending_sync === true) {
              pending.push({ key, draft });
            }
          } catch {
            // Ignore malformed entries
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to query pending sync drafts:', err);
  }
  return pending;
};

/**
 * Returns the count of pending sync drafts.
 */
export const getPendingCount = (): number => {
  return getPendingSyncDrafts().length;
};

/**
 * Background synchronizer that flushes all pending ECCD evaluation drafts to FastAPI.
 * Removes each successfully synced draft individually upon HTTP 200/201.
 */
export const syncPendingDrafts = async (
  apiClient: AxiosInstance
): Promise<{ successCount: number; failCount: number; errors: string[] }> => {
  const pendingList = getPendingSyncDrafts();
  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  for (const { key, draft } of pendingList) {
    const evaluationsPayload = Object.entries(draft.answers).map(([questionIdStr, answer]) => ({
      question_id: parseInt(questionIdStr, 10),
      testing_period: draft.testing_period,
      answer,
    }));

    const payload = {
      student_lrn: draft.student_lrn,
      testing_period: draft.testing_period,
      assessment_date: draft.evaluation_date,
      evaluations: evaluationsPayload,
    };

    try {
      const res = await apiClient.post('/api/eccd/evaluate', payload);
      if (res.status === 200 || res.status === 201) {
        removeDraftByKey(key);
        successCount++;
      } else {
        failCount++;
      }
    } catch (err: any) {
      failCount++;
      const msg = err.response?.data?.detail || err.message || 'Network sync error';
      errors.push(`LRN ${draft.student_lrn} (${draft.testing_period}): ${msg}`);
      console.error(`Failed to sync pending draft ${key}:`, err);
    }
  }

  return { successCount, failCount, errors };
};
