import { z } from "zod";

/** Built-in CSS templates. The Handlebars sources and manifests arrive in Prompt 5. */
export const CSS_TEMPLATE_IDS = [
  "tokens",
  "global",
  "header",
  "footer",
  "isi",
  "modals",
  "cta",
  "accordion",
] as const;

export const CssTemplateId = z.enum(CSS_TEMPLATE_IDS);
export type CssTemplateId = z.infer<typeof CssTemplateId>;

export const CssTemplate = z.object({
  id: CssTemplateId,
  name: z.string().min(1),
  fileName: z.string().regex(/^[a-z0-9-]+\.css$/),
  source: z.string(),
  variables: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)),
});
export type CssTemplate = z.infer<typeof CssTemplate>;
