import type { Breakpoint } from "@/lib/model";
import { sortBreakpoints } from "./validate";

export type QueryMode = "mobile-first" | "desktop-first" | "range";

export type BreakpointQuery = {
  breakpointId: string;
  name: string;
  /** Media condition such as "(min-width: 768px)", or null for base styles. */
  condition: string | null;
};

/**
 * Media queries in cascade order (base styles first). Assumes a valid set; see validateBreakpoints.
 *
 * - mobile-first: smallest is the base, then min-width queries ascending.
 * - desktop-first: largest is the base, then max-width queries descending.
 * - range: one min-and-max query per breakpoint, smallest first.
 */
export function mediaQueries(list: readonly Breakpoint[], mode: QueryMode): BreakpointQuery[] {
  const sorted = sortBreakpoints(list);

  if (mode === "mobile-first") {
    return sorted.map((b, i) => ({
      breakpointId: b.id,
      name: b.name,
      condition: i === 0 || b.minWidth === undefined ? null : `(min-width: ${b.minWidth}px)`,
    }));
  }

  if (mode === "desktop-first") {
    return sorted.reverse().map((b, i) => ({
      breakpointId: b.id,
      name: b.name,
      condition: i === 0 || b.maxWidth === undefined ? null : `(max-width: ${b.maxWidth}px)`,
    }));
  }

  return sorted.map((b) => {
    const parts = [
      b.minWidth !== undefined && `(min-width: ${b.minWidth}px)`,
      b.maxWidth !== undefined && `(max-width: ${b.maxWidth}px)`,
    ].filter(Boolean);
    return {
      breakpointId: b.id,
      name: b.name,
      condition: parts.length ? parts.join(" and ") : null,
    };
  });
}

/** Human-readable width range, e.g. "768px – 1023px", "≤ 767px", "≥ 1024px". */
export function describeRange(b: Pick<Breakpoint, "minWidth" | "maxWidth">): string {
  if (b.minWidth !== undefined && b.maxWidth !== undefined)
    return `${b.minWidth}px – ${b.maxWidth}px`;
  if (b.maxWidth !== undefined) return `≤ ${b.maxWidth}px`;
  if (b.minWidth !== undefined) return `≥ ${b.minWidth}px`;
  return "all widths";
}
