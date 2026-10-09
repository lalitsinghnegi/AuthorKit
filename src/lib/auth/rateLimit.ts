/**
 * In-memory login throttle: after MAX_FAILURES failures for one key (email +
 * IP) within WINDOW_MS, further attempts are refused until the window passes.
 * Kept on globalThis so it survives module reloads in development.
 *
 * The IP comes from x-forwarded-for, which a client can forge when no proxy
 * overwrites it, so login also checks an email-only key with the higher
 * MAX_EMAIL_FAILURES. That caps guesses per account whatever the IP, at the
 * cost that someone can lock an account out for one window.
 */
export const MAX_FAILURES = 5;
export const MAX_EMAIL_FAILURES = 20;
export const WINDOW_MS = 15 * 60 * 1000;
/** Bounds memory when many different emails or IPs fail. */
export const MAX_ENTRIES = 10_000;

type Entry = { failures: number; first: number };
const store: Map<string, Entry> = ((
  globalThis as { __akLoginThrottle?: Map<string, Entry> }
).__akLoginThrottle ??= new Map());

export function isLocked(key: string, now = Date.now(), max = MAX_FAILURES): boolean {
  const entry = store.get(key);
  if (!entry) return false;
  if (now - entry.first > WINDOW_MS) {
    store.delete(key);
    return false;
  }
  return entry.failures >= max;
}

export function recordFailure(key: string, now = Date.now()): void {
  const entry = store.get(key);
  if (entry && now - entry.first <= WINDOW_MS) {
    entry.failures++;
    return;
  }
  store.delete(key);
  if (store.size >= MAX_ENTRIES) prune(now);
  store.set(key, { failures: 1, first: now });
}

/** Drop expired entries; if still full, drop the oldest (Map keeps insertion order). */
function prune(now: number): void {
  for (const [k, v] of store) if (now - v.first > WINDOW_MS) store.delete(k);
  for (const k of store.keys()) {
    if (store.size < MAX_ENTRIES) break;
    store.delete(k);
  }
}

export function clearFailures(key: string): void {
  store.delete(key);
}

/** For tests. */
export function throttleSize(): number {
  return store.size;
}

/** For tests. */
export function resetThrottle(): void {
  store.clear();
}
