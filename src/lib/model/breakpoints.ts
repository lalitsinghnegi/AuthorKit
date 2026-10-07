import { z } from "zod";
import { findDuplicate, Id } from "./common";

const Px = z.int().min(0).max(10000);

export const Breakpoint = z.object({
  id: Id,
  name: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,31}$/, "Use lowercase letters, digits and hyphens, e.g. 'tablet'"),
  minWidth: Px.optional(),
  maxWidth: Px.optional(),
});
export type Breakpoint = z.infer<typeof Breakpoint>;

// Structural rules only. Overlap, gap and min > max checks live in the breakpoint module (Prompt 3).
export const BreakpointSet = z
  .object({ breakpoints: z.array(Breakpoint).min(1) })
  .superRefine((set, ctx) => {
    const dupId = findDuplicate(set.breakpoints.map((b) => b.id));
    if (dupId) ctx.addIssue({ code: "custom", message: `Duplicate breakpoint id "${dupId}"` });
    const dupName = findDuplicate(set.breakpoints.map((b) => b.name));
    if (dupName)
      ctx.addIssue({ code: "custom", message: `Duplicate breakpoint name "${dupName}"` });
  });
export type BreakpointSet = z.infer<typeof BreakpointSet>;
