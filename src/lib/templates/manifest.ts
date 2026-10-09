import { z } from "zod";
import { CssTemplateId } from "@/lib/model";

/** Selector strings use the {{prefix}} placeholder, e.g. ".{{prefix}}-btn--primary". */
const PrefixedClass = z
  .string()
  .regex(/^\.\{\{prefix\}\}-[a-z0-9_-]+$/, "Class selectors look like .{{prefix}}-name");

export const ManifestSelector = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(["block", "element", "modifier", "utility"]),
    selector: PrefixedClass,
    purpose: z.string().min(1),
    /** Set only in a project's mapped manifests: the block class this element is scoped to. */
    scope: z.string().optional(),
  }),
  z.object({
    type: z.literal("html-element"),
    selector: z.string().regex(/^(:root|[a-z*][a-z0-9, *]*)$/, "Bare element selector, e.g. h1"),
    purpose: z.string().min(1),
  }),
]);

export const ComponentManifest = z.object({
  id: CssTemplateId,
  name: z.string().min(1),
  description: z.string().min(1),
  fileName: z.string().regex(/^[a-z0-9-]+\.css$/),
  selectors: z.array(ManifestSelector).min(1),
  states: z.array(
    z.object({
      name: z.string().min(1),
      trigger: z.string().min(1),
      appliesTo: z.string().min(1),
      description: z.string().min(1),
    }),
  ),
  examples: z.array(z.object({ title: z.string().min(1), html: z.string().min(1) })).min(1),
  accessibility: z.array(z.string().min(1)).min(1),
  keyboard: z.array(z.object({ keys: z.string(), action: z.string() })).optional(),
  hooks: z.array(z.object({ attribute: z.string(), purpose: z.string() })).optional(),
  htl: z.string().optional(),
  /** Custom properties referenced via var(), without "--" and prefix, e.g. "color-primary". */
  variables: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).min(1),
});
export type ComponentManifest = z.infer<typeof ComponentManifest>;

/** Replace the {{prefix}} placeholder in manifest text. */
export const withPrefix = (text: string, prefix: string) => text.replaceAll("{{prefix}}", prefix);

/** Class names (without dot) a manifest documents, for a given prefix. */
export function manifestClasses(manifest: ComponentManifest, prefix: string): string[] {
  return manifest.selectors
    .filter((s) => s.type !== "html-element")
    .map((s) => withPrefix(s.selector, prefix).slice(1));
}
