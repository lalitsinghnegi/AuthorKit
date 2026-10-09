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

/** Where an extracted token came from and how sure the extractor is about it. */
export const TokenMeta = z.object({
  /** Stable identity across re-extractions: style key, variable id, or a scan key. */
  sourceKey: z.string().min(1).max(300),
  figmaName: z.string().max(300),
  origin: z.enum(["variable", "style", "scan"]),
  /** How many nodes in the linked frames use this value. */
  usage: z.int().min(0),
  confidence: z.enum(["high", "low"]),
  reasons: z.array(z.string().max(300)),
  /** True when the name matches a template token, so it will fill the generated CSS. */
  mapped: z.boolean(),
  /** No longer found in Figma on the latest extraction. */
  missing: z.boolean().optional(),
  /** Change notice from the latest extraction, e.g. a value that changed in Figma. */
  note: z.string().max(300).optional(),
});
export type TokenMeta = z.infer<typeof TokenMeta>;

/** Far above any real design system; keeps files and review screens bounded. */
export const MAX_TOKENS = 2000;

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
    .object({
      fileKey: z.string().max(64),
      nodeId: z.string().max(64),
      nodeName: z.string().max(300).optional(),
    })
    .optional(),
  /** auto = extracted and awaiting review. */
  status: z.enum(["auto", "accepted", "overridden", "excluded"]),
  meta: TokenMeta.optional(),
});
export type DesignToken = z.infer<typeof DesignToken>;

export const TokenFile = z
  .object({ schemaVersion: SchemaVersion, tokens: z.array(DesignToken).max(MAX_TOKENS) })
  .superRefine((file, ctx) => {
    const dupId = findDuplicate(file.tokens.map((t) => t.id));
    if (dupId) ctx.addIssue({ code: "custom", message: `Duplicate token id "${dupId}"` });
    // Excluded tokens never reach the CSS, so they may share a name with the one in use.
    const active = file.tokens.filter((t) => t.status !== "excluded");
    const dupName = findDuplicate(active.map((t) => t.name));
    if (dupName) ctx.addIssue({ code: "custom", message: `Duplicate token name "${dupName}"` });
    const dupSource = findDuplicate(file.tokens.flatMap((t) => (t.meta ? [t.meta.sourceKey] : [])));
    if (dupSource)
      ctx.addIssue({ code: "custom", message: `Duplicate token source "${dupSource}"` });
  });
export type TokenFile = z.infer<typeof TokenFile>;
