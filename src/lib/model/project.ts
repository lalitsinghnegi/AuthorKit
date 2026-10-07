import { z } from "zod";
import { BreakpointSet } from "./breakpoints";
import { findDuplicate, IsoDate, SchemaVersion } from "./common";
import { FigmaLink } from "./figmaLink";
import { ScaffoldTree, treeIdsAreUnique } from "./scaffold";
import { DesignToken } from "./tokens";

/** Prefix for every class and custom property: "ak" → .ak-btn, --ak-color-primary. */
export const Prefix = z
  .string()
  .regex(
    /^[a-z][a-z0-9]{1,9}$/,
    "2–10 characters: lowercase letters and digits, starting with a letter",
  );

/** Fields the admin sets when creating a project. */
export const ProjectInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  brandName: z.string().trim().min(1, "Brand name is required").max(80),
  prefix: Prefix,
  description: z.string().trim().max(500).optional(),
  approach: z.enum(["mobile-first", "desktop-first"]),
});
export type ProjectInput = z.infer<typeof ProjectInput>;

export const Project = ProjectInput.extend({
  schemaVersion: SchemaVersion,
  id: z.uuid(),
  breakpoints: BreakpointSet,
  scaffold: ScaffoldTree,
  figmaLinks: z.array(FigmaLink),
  createdAt: IsoDate,
  updatedAt: IsoDate,
}).superRefine((project, ctx) => {
  if (!treeIdsAreUnique(project.scaffold)) {
    ctx.addIssue({
      code: "custom",
      path: ["scaffold"],
      message: "Scaffold node ids must be unique",
    });
  }
  const dupLink = findDuplicate(project.figmaLinks.map((l) => l.id));
  if (dupLink) {
    ctx.addIssue({
      code: "custom",
      path: ["figmaLinks"],
      message: `Duplicate link id "${dupLink}"`,
    });
  }
  const breakpointIds = new Set(project.breakpoints.breakpoints.map((b) => b.id));
  project.figmaLinks.forEach((link, i) => {
    if (link.breakpointId && !breakpointIds.has(link.breakpointId)) {
      ctx.addIssue({
        code: "custom",
        path: ["figmaLinks", i, "breakpointId"],
        message: `Link "${link.label}" refers to unknown breakpoint "${link.breakpointId}"`,
      });
    }
  });
});
export type Project = z.infer<typeof Project>;

/** Portable file the admin can download and import elsewhere. */
export const ProjectExport = z.object({
  schemaVersion: SchemaVersion,
  kind: z.literal("authorkit-project"),
  project: Project,
  tokens: z.array(DesignToken),
});
export type ProjectExport = z.infer<typeof ProjectExport>;
