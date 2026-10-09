import "server-only";
import { createHash } from "node:crypto";
import type { Project } from "@/lib/model";
import { buildPackage, type BuiltPackage } from "./build";
import type { GenerationInputs } from "./generate";
import { loadGenerationInputs } from "./load";

/**
 * Bounds the work done by package builds:
 * - identical inputs share one build (in flight or finished in the last
 *   CACHE_MS), keyed by a hash of the project and inputs, so a change always
 *   builds afresh and the style guide's many sub-requests cost one build;
 * - at most MAX_RUNNING different builds run at once; others wait up to
 *   QUEUE_MS, then fail with BusyError;
 * - one user can have at most MAX_PER_USER different builds running or queued.
 * Kept in memory only (nothing is stored), which suits a single server.
 */
export const MAX_RUNNING = 2;
export const MAX_PER_USER = 2;
export const QUEUE_MS = 10_000;
export const CACHE_MS = 60_000;
const CACHE_ENTRIES = 16;

export class BusyError extends Error {
  constructor() {
    super("AuthorKit is busy building other packages. Try again in a few seconds.");
    this.name = "BusyError";
  }
}

type State = {
  running: number;
  waiting: (() => void)[];
  perUser: Map<string, number>;
  cache: Map<string, { at: number; result: Promise<BuiltPackage> }>;
};
const state: State = ((globalThis as { __akBuildLimit?: State }).__akBuildLimit ??= {
  running: 0,
  waiting: [],
  perUser: new Map(),
  cache: new Map(),
});

function acquire(): Promise<void> {
  if (state.running < MAX_RUNNING) {
    state.running++;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const go = () => {
      clearTimeout(timer);
      state.running++;
      resolve();
    };
    const timer = setTimeout(() => {
      state.waiting = state.waiting.filter((w) => w !== go);
      reject(new BusyError());
    }, QUEUE_MS);
    state.waiting.push(go);
  });
}

function release(): void {
  state.running--;
  state.waiting.shift()?.();
}

export const buildKey = (project: Project, inputs: GenerationInputs) =>
  createHash("sha256")
    .update(JSON.stringify([project, inputs]))
    .digest("hex");

export async function buildPackageLimited(
  project: Project,
  inputs: GenerationInputs,
  userId: string,
  build: typeof buildPackage = buildPackage,
): Promise<BuiltPackage> {
  const key = buildKey(project, inputs);
  const now = Date.now();
  for (const [k, v] of state.cache) if (now - v.at > CACHE_MS) state.cache.delete(k);
  const hit = state.cache.get(key);
  if (hit) return hit.result;

  const mine = state.perUser.get(userId) ?? 0;
  if (mine >= MAX_PER_USER) throw new BusyError();
  state.perUser.set(userId, mine + 1);

  const result = (async () => {
    try {
      await acquire();
      try {
        return await build(project, inputs);
      } finally {
        release();
      }
    } finally {
      const left = (state.perUser.get(userId) ?? 1) - 1;
      if (left > 0) state.perUser.set(userId, left);
      else state.perUser.delete(userId);
    }
  })();
  state.cache.set(key, { at: now, result });
  // Failures are not cached; the next request tries again.
  result.catch(() => state.cache.delete(key));
  while (state.cache.size > CACHE_ENTRIES) state.cache.delete(state.cache.keys().next().value!);
  return result;
}

/** For tests. */
export function resetBuildLimits(): void {
  state.running = 0;
  state.waiting = [];
  state.perUser.clear();
  state.cache.clear();
}

/** Load the saved tokens and responsive values, then build within the limits. */
export async function buildForUser(project: Project, userId: string): Promise<BuiltPackage> {
  return buildPackageLimited(project, await loadGenerationInputs(project.id), userId);
}
