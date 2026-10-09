import { z } from "zod";
import { CssTemplateId } from "./cssTemplate";
import { Id, SchemaVersion } from "./common";

/** frame = measured in Figma; inferred = copied from the nearest measured breakpoint; fluid = estimated clamp(). */
export const ValueSource = z.enum(["frame", "inferred", "fluid"]);

export const ResponsiveValue = z.object({
  /** CSS value; may contain the {{prefix}} placeholder. */
  value: z.string().min(1).max(300),
  source: ValueSource,
});
export type ResponsiveValue = z.infer<typeof ResponsiveValue>;

export const ResponsiveEntry = z.object({
  /** breakpoints = measured on 2+ breakpoints; fluid = one frame, estimated; none = no usable frames. */
  mode: z.enum(["breakpoints", "fluid", "none"]),
  frames: z
    .array(
      z.object({
        linkId: Id,
        nodeId: z.string().max(64),
        nodeName: z.string().max(300),
        /** Breakpoint the frame was used for (untagged links use the base breakpoint). */
        breakpointId: Id,
        tagged: z.boolean(),
      }),
    )
    .max(200),
  /** breakpoint id → variable (without -- and prefix) → value */
  values: z.record(Id, z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), ResponsiveValue)),
  notes: z.array(z.string().max(500)).max(200),
});
export type ResponsiveEntry = z.infer<typeof ResponsiveEntry>;

/** Per-breakpoint values read from mapped Figma frames (Prompt 10); used by the generator later. */
export const ResponsiveFile = z.object({
  schemaVersion: SchemaVersion,
  components: z.partialRecord(CssTemplateId, ResponsiveEntry),
  /** Font-size tokens per breakpoint, from frames mapped to global styles. */
  typography: ResponsiveEntry.optional(),
});
export type ResponsiveFile = z.infer<typeof ResponsiveFile>;
