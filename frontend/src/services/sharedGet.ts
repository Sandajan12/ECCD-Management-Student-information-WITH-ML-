import API from "./api";

export type SharedGetParams = Record<string, string | number | undefined>;

const pending = new Map<string, Promise<unknown>>();

// Providers retain loaded data. This coalesces overlapping reads (including
// Strict Mode effect replay) without caching permissions after a refresh.
// Consumers ignore superseded results independently; they must not abort a
// request another consumer is still using.
export function sharedGet<T>(
  path: string,
  params?: SharedGetParams,
): Promise<T> {
  const key = JSON.stringify([
    localStorage.getItem("token"),
    path,
    Object.entries(params || {}).sort(([a], [b]) => a.localeCompare(b)),
  ]);
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;

  const request = API.get<T>(path, { params })
    .then(({ data }) => data)
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
