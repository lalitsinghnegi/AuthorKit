import { STANDARD_TEMPLATE_BREAKPOINTS, type Breakpoint } from "@/lib/model";

export type BreakpointValues = Omit<Breakpoint, "id">;

/** Breakpoints without their ids, e.g. to offer a template's set. */
export const withoutIds = (list: readonly Breakpoint[]): BreakpointValues[] =>
  list.map(({ name, minWidth, maxWidth }) => ({
    name,
    ...(minWidth !== undefined && { minWidth }),
    ...(maxWidth !== undefined && { maxWidth }),
  }));

/** The standard set (mobile, tablet, desktop) that built-in templates carry. */
export const STANDARD_BREAKPOINTS: readonly BreakpointValues[] = withoutIds(
  STANDARD_TEMPLATE_BREAKPOINTS.breakpoints,
);

/**
 * Take a template's breakpoints into a project. Ids are reused by name from
 * `current` (so Figma links tagged "desktop" still point at "desktop");
 * other breakpoints get a new id from `newId`.
 */
export function takeBreakpoints(
  values: readonly BreakpointValues[],
  newId: () => string,
  current: readonly Breakpoint[] = [],
): Breakpoint[] {
  const idByName = new Map(current.map((b) => [b.name, b.id]));
  return values.map(({ name, minWidth, maxWidth }) => ({
    id: idByName.get(name) ?? newId(),
    name,
    ...(minWidth !== undefined && { minWidth }),
    ...(maxWidth !== undefined && { maxWidth }),
  }));
}
