/**
 * Tiny in-memory cache shared across requests within a single server process.
 *
 * A Letterboxd slug -> TMDB metadata mapping never changes, so resolved film
 * info is cached for the lifetime of the process. The cache resets on restart,
 * which is fine: the first lookup after a restart simply re-resolves.
 */
const store = new Map<string, unknown>();

export function cacheGet<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function cacheSet<T>(key: string, value: T): void {
  store.set(key, value);
}
