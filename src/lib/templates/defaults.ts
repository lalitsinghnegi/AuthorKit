import { z } from "zod";
import { CssTemplateId, DesignToken } from "@/lib/model";
import raw from "@/templates/defaults/tokens.json";

const Values = z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), z.string().min(1));
/** component id → BEM block/element suffix (e.g. "header", "header__nav") → variable → value */
const ComponentValues = z.partialRecord(
  CssTemplateId,
  z.record(z.string().regex(/^[a-z0-9_-]+$/), Values),
);

export const TemplateDefaults = z.object({
  tokens: z.array(DesignToken.pick({ name: true, type: true, value: true })),
  components: ComponentValues,
  largeScreen: z.object({
    minWidth: z.int().min(0),
    tokens: Values,
    components: ComponentValues,
  }),
});
export type TemplateDefaults = z.infer<typeof TemplateDefaults>;
export type ComponentValues = z.infer<typeof ComponentValues>;

export const TEMPLATE_DEFAULTS: TemplateDefaults = TemplateDefaults.parse(raw);
