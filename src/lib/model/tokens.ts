import { z } from "zod";
import { findDuplicate, Id, SchemaVersion } from "./common";

export const TOKEN_TYPES = [
  "color",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "spacing",
  "radius",
  "border",
  "shadow",
  "zIndex",
  "duration",
  "size",
] as const;
export type TokenType = (typeof TOKEN_TYPES)[number];

export const DesignToken = z.object({
  id: Id,
  /** Becomes --{prefix}-{name}. */
  name: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/, "Use lowercase kebab-case, e.g. color-primary"),
  type: z.enum(TOKEN_TYPES),
  /** CSS-ready value used in output, e.g. "#1a2b3c" or "16px". */
  value: z.string().min(1).max(500),
  /** Value as extracted from Figma; kept when the admin overrides it. */
  originalValue: z.string().max(500),
  source: z
    .object({ fileKey: z.string(), nodeId: z.string(), nodeName: z.string().optional() })
    .optional(),
  status: z.enum(["auto", "accepted", "overridden", "excluded"]),
});
export type DesignToken = z.infer<typeof DesignToken>;

export const TokenFile = z
  .object({ schemaVersion: SchemaVersion, tokens: z.array(DesignToken) })
  .superRefine((file, ctx) => {
    const dupId = findDuplicate(file.tokens.map((t) => t.id));
    if (dupId) ctx.addIssue({ code: "custom", message: `Duplicate token id "${dupId}"` });
    const dupName = findDuplicate(file.tokens.map((t) => t.name));
    if (dupName) ctx.addIssue({ code: "custom", message: `Duplicate token name "${dupName}"` });
  });
export type TokenFile = z.infer<typeof TokenFile>;
