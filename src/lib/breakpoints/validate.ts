import type { Breakpoint } from "@/lib/model";

export type Severity = "error" | "warning";

export type IssueCode =
  | "min-greater-than-max"
  | "duplicate-name"
  | "overlap"
  | "gap"
  | "missing-bound"
  | "uncovered-start"
  | "uncovered-end";

/** A single edit to one breakpoint. `undefined` clears a width. */
export type Change =
  | { id: string; field: "minWidth" | "maxWidth"; value: number | undefined }
  | { id: string; field: "name"; value: string };

export type Fix = { label: string; changes: Change[] };

export type Issue = {
  code: IssueCode;
  severity: Severity;
  message: string;
  breakpointIds: string[];
  /** Suggested fixes, best first. Empty when no safe fix exists. */
  fixes: Fix[];
};

const px = (n: number) => `${n}px`;
const lo = (b: Breakpoint) => b.minWidth ?? 0;
const hi = (b: Breakpoint) => b.maxWidth ?? Infinity;

/** Smallest first: by min-width (none = 0), then by max-width (none = ∞). */
export function sortBreakpoints(list: readonly Breakpoint[]): Breakpoint[] {
  return [...list].sort((a, b) => lo(a) - lo(b) || hi(a) - hi(b));
}

export function applyFix(list: readonly Breakpoint[], fix: Fix): Breakpoint[] {
  return list.map((b) => {
    const next = { ...b };
    for (const change of fix.changes) {
      if (change.id !== b.id) continue;
      if (change.field === "name") next.name = change.value;
      else if (change.value === undefined) delete next[change.field];
      else next[change.field] = change.value;
    }
    return next;
  });
}

/** Keep only fixes whose result has no min > max on the breakpoints they touch. */
function sane(list: readonly Breakpoint[], fixes: Fix[]): Fix[] {
  return fixes.filter((fix) => {
    const after = applyFix(list, fix);
    return fix.changes.every((c) => {
      const b = after.find((x) => x.id === c.id)!;
      return lo(b) <= hi(b);
    });
  });
}

/**
 * Check a breakpoint set. Ranges are inclusive on both ends, so max 1024 and
 * min 1024 overlap at exactly 1024px. Issues come back in a stable order:
 * per-breakpoint problems first, then pairs from smallest to largest.
 */
export function validateBreakpoints(list: readonly Breakpoint[]): Issue[] {
  const issues: Issue[] = [];
  const sorted = sortBreakpoints(list);

  // Names
  const byName = new Map<string, Breakpoint[]>();
  for (const b of sorted) byName.set(b.name, [...(byName.get(b.name) ?? []), b]);
  const taken = new Set(list.map((b) => b.name));
  for (const [name, group] of byName) {
    if (group.length < 2) continue;
    const renames: Change[] = group.slice(1).map((b) => {
      let n = 2;
      while (taken.has(`${name}-${n}`)) n++;
      taken.add(`${name}-${n}`);
      return { id: b.id, field: "name", value: `${name}-${n}` };
    });
    issues.push({
      code: "duplicate-name",
      severity: "error",
      message: `${group.length} breakpoints are named "${name}"`,
      breakpointIds: group.map((b) => b.id),
      fixes: [{ label: `Rename to ${renames.map((r) => r.value).join(", ")}`, changes: renames }],
    });
  }

  // Per-breakpoint
  sorted.forEach((b, i) => {
    if (b.minWidth !== undefined && b.maxWidth !== undefined && b.minWidth > b.maxWidth) {
      issues.push({
        code: "min-greater-than-max",
        severity: "error",
        message: `${b.name}: min-width ${px(b.minWidth)} is greater than max-width ${px(b.maxWidth)}`,
        breakpointIds: [b.id],
        fixes: [
          {
            label: `Swap to ${px(b.maxWidth)}–${px(b.minWidth)}`,
            changes: [
              { id: b.id, field: "minWidth", value: b.maxWidth },
              { id: b.id, field: "maxWidth", value: b.minWidth },
            ],
          },
        ],
      });
    }

    if (sorted.length < 2) return;
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    const needsMin = i > 0 && b.minWidth === undefined;
    const needsMax = i < sorted.length - 1 && b.maxWidth === undefined;
    if (!needsMin && !needsMax) return;

    const changes: Change[] = [];
    if (needsMin && prev?.maxWidth !== undefined) {
      changes.push({ id: b.id, field: "minWidth", value: prev.maxWidth + 1 });
    }
    if (needsMax && next?.minWidth !== undefined && next.minWidth > 0) {
      changes.push({ id: b.id, field: "maxWidth", value: next.minWidth - 1 });
    }
    const missing = [needsMin && "min-width", needsMax && "max-width"]
      .filter(Boolean)
      .join(" and ");
    const where = i === 0 ? "the smallest" : i === sorted.length - 1 ? "the largest" : "a middle";
    issues.push({
      code: "missing-bound",
      severity: "error",
      message: `${b.name} is ${where} breakpoint and needs a ${missing}`,
      breakpointIds: [b.id],
      fixes:
        changes.length > 0
          ? sane(list, [
              {
                label: changes
                  .map(
                    (c) =>
                      `Set ${c.field === "minWidth" ? "min" : "max"} to ${px(c.value as number)}`,
                  )
                  .join(", "),
                changes,
              },
            ])
          : [],
    });
  });

  // Coverage at the ends
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first && first.minWidth !== undefined && first.minWidth > 0) {
    issues.push({
      code: "uncovered-start",
      severity: "warning",
      message: `Widths below ${px(first.minWidth)} are not covered by any breakpoint`,
      breakpointIds: [first.id],
      fixes: [
        {
          label: `Remove min-width from ${first.name}`,
          changes: [{ id: first.id, field: "minWidth", value: undefined }],
        },
      ],
    });
  }
  if (last && last.maxWidth !== undefined) {
    issues.push({
      code: "uncovered-end",
      severity: "warning",
      message: `Widths above ${px(last.maxWidth)} are not covered by any breakpoint`,
      breakpointIds: [last.id],
      fixes: [
        {
          label: `Remove max-width from ${last.name}`,
          changes: [{ id: last.id, field: "maxWidth", value: undefined }],
        },
      ],
    });
  }

  // Overlaps: every pair (one wide range can overlap several others).
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      const from = Math.max(lo(a), lo(b));
      const to = Math.min(hi(a), hi(b));
      if (from > to) continue;
      const span = from === to ? `${px(from)}` : `${px(from)}–${to === Infinity ? "∞" : px(to)}`;
      const fixes: Fix[] = [];
      if (hi(a) !== Infinity) {
        fixes.push({
          label: `Start ${b.name} at ${px(hi(a) + 1)}`,
          changes: [{ id: b.id, field: "minWidth", value: hi(a) + 1 }],
        });
      }
      if (lo(b) > 0) {
        fixes.push({
          label: `End ${a.name} at ${px(lo(b) - 1)}`,
          changes: [{ id: a.id, field: "maxWidth", value: lo(b) - 1 }],
        });
      }
      issues.push({
        code: "overlap",
        severity: "error",
        message: `${a.name} and ${b.name} both match ${span}`,
        breakpointIds: [a.id, b.id],
        fixes: sane(list, fixes),
      });
    }
  }

  // Gaps between neighbours
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a.maxWidth === undefined || b.minWidth === undefined) continue;
    if (b.minWidth <= a.maxWidth + 1) continue;
    const gapFrom = a.maxWidth + 1;
    const gapTo = b.minWidth - 1;
    issues.push({
      code: "gap",
      severity: "error",
      message: `No breakpoint covers ${gapFrom === gapTo ? px(gapFrom) : `${px(gapFrom)}–${px(gapTo)}`}`,
      breakpointIds: [a.id, b.id],
      fixes: [
        {
          label: `Extend ${a.name} to ${px(gapTo)}`,
          changes: [{ id: a.id, field: "maxWidth", value: gapTo }],
        },
        {
          label: `Start ${b.name} at ${px(gapFrom)}`,
          changes: [{ id: b.id, field: "minWidth", value: gapFrom }],
        },
      ],
    });
  }

  return issues;
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.severity === "error");

/**
 * Apply the first suggested fix of the first fixable issue (errors before warnings),
 * re-validating after each step. Stops when nothing fixable remains.
 */
export function fixAll(list: readonly Breakpoint[], { includeWarnings = true } = {}): Breakpoint[] {
  let current = [...list];
  for (let step = 0; step < 50; step++) {
    const issues = validateBreakpoints(current).filter(
      (i) => i.fixes.length > 0 && (includeWarnings || i.severity === "error"),
    );
    const next = issues.find((i) => i.severity === "error") ?? issues[0];
    if (!next) break;
    current = applyFix(current, next.fixes[0]);
  }
  return current;
}
