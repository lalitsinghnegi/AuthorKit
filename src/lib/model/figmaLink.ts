import { z } from "zod";
import { CssTemplateId } from "./cssTemplate";
import { findDuplicate, Id } from "./common";

/** Figma node ids as the API returns them, e.g. "12:34" or instance ids "I1:2;3:4". */
export const NodeId = z.string().regex(/^I?\d+:\d+(;\d+:\d+)*$/, "Not a Figma node id");

/** Which component a frame inside a linked Figma node represents. */
export const FrameMapping = z.object({
  nodeId: NodeId,
  nodeName: z.string().max(300),
  /** Readable location, e.g. "Home / Desktop › Header". */
  path: z.string().max(600),
  componentId: CssTemplateId.nullable(),
  state: z.enum(["suggested", "confirmed", "ignored"]),
  source: z.enum(["pattern", "ai", "manual"]),
  confidence: z.enum(["high", "low"]).optional(),
  reason: z.string().max(500).optional(),
  /** Not found in Figma on the latest detection. */
  missing: z.boolean().optional(),
});
export type FrameMapping = z.infer<typeof FrameMapping>;

export const FigmaLink = z
  .object({
    id: Id,
    label: z.string().min(1).max(120),
    scope: z.enum(["global", "page", "component"]),
    pageName: z.string().min(1).max(120).optional(),
    url: z.url({ protocol: /^https$/, hostname: /^(www\.)?figma\.com$/ }),
    fileKey: z.string().regex(/^[A-Za-z0-9]{10,64}$/),
    nodeId: z.string().max(64).optional(),
    breakpointId: Id.optional(),
    componentId: CssTemplateId.optional(),
    mappings: z.array(FrameMapping).max(500).optional(),
  })
  .superRefine((link, ctx) => {
    if (link.scope === "page" && !link.pageName) {
      ctx.addIssue({ code: "custom", path: ["pageName"], message: "Page links need a page name" });
    }
    const dup = findDuplicate((link.mappings ?? []).map((m) => m.nodeId));
    if (dup)
      ctx.addIssue({ code: "custom", path: ["mappings"], message: `Frame ${dup} is mapped twice` });
  });
export type FigmaLink = z.infer<typeof FigmaLink>;
