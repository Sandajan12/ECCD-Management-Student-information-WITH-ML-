export interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export interface Draft<T> {
  owner_id: number; values: T; revision: string; is_pending_sync: boolean;
  baseline?: T; error?: string;
  request?: {path: string; method: 'post' | 'put'; data: unknown};
}
export const OFFLINE_MESSAGE = 'Your draft is saved on this device. Reconnect and submit again.';
// Revisions identify edits, never credentials. No browser crypto API is required by Hermes.
export const revision = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
  const value = Math.floor(Math.random() * 16); return (char === 'x' ? value : (value & 3) | 8).toString(16);
});
export function draft<T>(owner: number, values: T, baseline?: T): Draft<T> {
  return {owner_id: owner, values, revision: revision(), is_pending_sync: false, ...(baseline === undefined ? {} : {baseline})};
}

/** Storage only: intentionally has no network dependency, queue replay, or reconnect listener. */
export class DraftStore {
  private memory = new Map<string, Draft<unknown> | null>();
  private queues = new Map<string, Promise<void>>();
  private listeners = new Set<() => void>();
  private failures = new Map<string, string>();
  constructor(private storage: Storage) {}
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => {this.listeners.delete(fn);}; };
  private emit() { this.listeners.forEach(fn => fn()); }
  peek<T>(key: string, owner: number): Draft<T> | null {
    const value = this.memory.get(key); return value?.owner_id === owner ? value as Draft<T> : null;
  }
  error(key: string): string { return this.failures.get(key) || ''; }
  async load<T>(key: string, owner: number): Promise<Draft<T> | null> {
    if (this.memory.has(key)) return this.peek<T>(key, owner);
    try {
      const raw = await this.storage.getItem(key);
      if (!this.memory.has(key)) {
        const value: unknown = raw ? JSON.parse(raw) : null;
        if (value !== null && (typeof value !== 'object' || !('owner_id' in value) || !('revision' in value) ||
          !('values' in value) || !value.values || typeof value.values !== 'object' || Array.isArray(value.values) ||
          !('is_pending_sync' in value) || typeof value.is_pending_sync !== 'boolean' || typeof value.owner_id !== 'number' ||
          typeof value.revision !== 'string')) throw new Error('Invalid draft');
        this.memory.set(key, value as Draft<unknown> | null);
      }
    } catch {
      this.failures.set(key, 'Draft storage could not be read. Reload this screen before editing; saved data was preserved.');
      this.emit(); throw new Error(this.error(key));
    }
    return this.peek<T>(key, owner);
  }
  private persist(key: string, value: Draft<unknown> | null): Promise<void> {
    this.memory.set(key, value); this.emit();
    const previous = this.queues.get(key) || Promise.resolve();
    const task = previous.catch(() => {}).then(() => value === null ? this.storage.removeItem(key) : this.storage.setItem(key, JSON.stringify(value)))
      .then(() => {this.failures.delete(key); this.emit();})
      .catch(() => {this.failures.set(key, 'Draft could not be saved on this device. Keep the app open; these edits are in memory only.'); this.emit(); throw new Error(this.error(key));});
    this.queues.set(key, task);
    void task.finally(() => {if (this.queues.get(key) === task) this.queues.delete(key);}).catch(() => {});
    return task;
  }
  put<T>(key: string, value: Draft<T>): Promise<void> { return this.persist(key, value); }
  async confirm<T>(key: string, owner: number, expected: string, change?: (current: Draft<T>) => Draft<T> | null): Promise<void> {
    await this.load<T>(key, owner);
    const current = this.peek<T>(key, owner);
    if (!current || current.revision !== expected) return;
    await this.persist(key, change ? change(current) : null);
  }
}
