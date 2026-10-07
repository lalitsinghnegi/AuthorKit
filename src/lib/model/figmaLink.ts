import { z } from "zod";
import { CssTemplateId } from "./cssTemplate";
import { Id } from "./common";

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
  })
  .superRefine((link, ctx) => {
    if (link.scope === "page" && !link.pageName) {
      ctx.addIssue({ code: "custom", path: ["pageName"], message: "Page links need a page name" });
    }
  });
export type FigmaLink = z.infer<typeof FigmaLink>;
