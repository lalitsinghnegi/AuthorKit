/**
 * In-memory login throttle: after MAX_FAILURES failures for one key (email +
 * IP) within WINDOW_MS, further attempts are refused until the window passes.
 * Kept on globalThis so it survives module reloads in development.
 */
export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;

type Entry = { failures: number; first: number };
const store: Map<string, Entry> = ((
  globalThis as { __akLoginThrottle?: Map<string, Entry> }
).__akLoginThrottle ??= new Map());

export function isLocked(key: string, now = Date.now()): boolean {
  const entry = store.get(key);
  if (!entry) return false;
  if (now - entry.first > WINDOW_MS) {
    store.delete(key);
    return false;
  }
  return entry.failures >= MAX_FAILURES;
}

export function recordFailure(key: string, now = Date.now()): void {
  const entry = store.get(key);
  if (!entry || now - entry.first > WINDOW_MS) store.set(key, { failures: 1, first: now });
  else entry.failures++;
}

export function clearFailures(key: string): void {
  store.delete(key);
}

/** For tests. */
export function resetThrottle(): void {
  store.clear();
}
