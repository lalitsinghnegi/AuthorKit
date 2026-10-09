/**
 * Fixed-window request budgets per user for actions that call paid or
 * rate-limited services (Figma, the AI provider). In memory, per server.
 */
export type Budget = { name: string; max: number; windowMs: number; message: string };

export const FIGMA_BUDGET: Budget = {
  name: "figma",
  max: 30,
  windowMs: 60_000,
  message: "Too many Figma requests in the last minute. Wait a moment and try again.",
};

export const AI_BUDGET: Budget = {
  name: "ai",
  max: 10,
  windowMs: 10 * 60_000,
  message: "Too many AI suggestion requests. Wait a few minutes and try again.",
};

/** Reading the project's public site (up to 21 pages per use). */
export const SITE_BUDGET: Budget = {
  name: "site",
  max: 10,
  windowMs: 10 * 60_000,
  message: "Too many site reads. Wait a few minutes and try again.",
};

type Window = { start: number; count: number };
const windows: Map<string, Window> = ((
  globalThis as { __akBudgets?: Map<string, Window> }
).__akBudgets ??= new Map());

/** Count one use. Returns null when allowed, or the message to show when over budget. */
export function spend(budget: Budget, userId: string, now = Date.now()): string | null {
  const key = `${budget.name}|${userId}`;
  const w = windows.get(key);
  if (!w || now - w.start >= budget.windowMs) {
    windows.set(key, { start: now, count: 1 });
    return null;
  }
  if (w.count >= budget.max) return budget.message;
  w.count++;
  return null;
}

/** For tests. */
export function resetBudgets(): void {
  windows.clear();
}
