import { mediaQueries } from "@/lib/breakpoints";
import { describeRange } from "@/lib/breakpoints/mediaQueries";
import type { Breakpoint } from "@/lib/model";

export type Approach = "mobile-first" | "desktop-first";
export type Values = Record<string, string>;

export type CascadeStep = {
  breakpointId: string;
  name: string;
  range: string;
  /** null for the base breakpoint (no media query). */
  condition: string | null;
  /** Only the values that differ from what the cascade already provides at this point. */
  changed: Values;
};

/**
 * Turn per-breakpoint values into base values plus minimal media-query overrides.
 *
 * Queries cascade (mobile-first min-width queries also match every larger
 * breakpoint), so each step is compared with the running result of all
 * earlier steps, not with the base.
 */
export function cascade(
  breakpoints: readonly Breakpoint[],
  approach: Approach,
  valuesFor: (breakpointId: string) => Values,
): { base: Values; steps: CascadeStep[] } {
  const queries = mediaQueries(breakpoints, approach);
  const byId = new Map(breakpoints.map((b) => [b.id, b]));
  let running: Values = {};
  const steps: CascadeStep[] = queries.map((q, i) => {
    const values = valuesFor(q.breakpointId);
    const changed: Values = {};
    for (const [key, value] of Object.entries(values)) {
      if (i === 0 || running[key] !== value) changed[key] = value;
    }
    running = { ...running, ...changed };
    return {
      breakpointId: q.breakpointId,
      name: q.name,
      range: describeRange(byId.get(q.breakpointId)!),
      condition: q.condition,
      changed,
    };
  });
  return { base: steps[0]?.changed ?? {}, steps };
}
