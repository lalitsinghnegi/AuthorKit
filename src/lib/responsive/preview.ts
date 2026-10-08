import type { Breakpoint, CssTemplateId, ResponsiveEntry } from "@/lib/model";
import { cascade } from "@/lib/templates/cascade";
import { withPrefix } from "@/lib/templates/manifest";

/** Selector whose custom properties each component's responsive variables live on. */
export const RESPONSIVE_SELECTOR: Partial<Record<CssTemplateId | "typography", string>> = {
  header: ".{{prefix}}-header",
  footer: ".{{prefix}}-footer",
  cta: ".{{prefix}}-btn",
  modals: ".{{prefix}}-modal",
  accordion: ".{{prefix}}-accordion",
  isi: ".{{prefix}}-isi",
  typography: ":root",
};

/**
 * The CSS these values produce: base declarations for the first breakpoint,
 * then a media query per breakpoint holding only what changes there.
 */
export function renderResponsiveCss(
  target: CssTemplateId | "typography",
  entry: ResponsiveEntry,
  options: {
    prefix: string;
    approach: "mobile-first" | "desktop-first";
    breakpoints: readonly Breakpoint[];
  },
): string {
  const selector = withPrefix(
    RESPONSIVE_SELECTOR[target] ?? `.{{prefix}}-${target}`,
    options.prefix,
  );
  const flat = (bp: string) =>
    Object.fromEntries(
      Object.entries(entry.values[bp] ?? {}).map(([k, v]) => [
        k,
        withPrefix(v.value, options.prefix),
      ]),
    );
  const { steps } = cascade(options.breakpoints, options.approach, flat);

  const block = (decls: Record<string, string>, indent: string) =>
    `${indent}${selector} {\n${Object.entries(decls)
      .map(([k, v]) => `${indent}  --${options.prefix}-${k}: ${v};`)
      .join("\n")}\n${indent}}`;

  const parts: string[] = [];
  for (const step of steps) {
    if (Object.keys(step.changed).length === 0) continue;
    if (step.condition === null)
      parts.push(`/* ${step.name} (${step.range}): base */\n${block(step.changed, "")}`);
    else
      parts.push(
        `/* ${step.name} (${step.range}) */\n@media ${step.condition} {\n${block(step.changed, "  ")}\n}`,
      );
  }
  return parts.join("\n\n");
}
