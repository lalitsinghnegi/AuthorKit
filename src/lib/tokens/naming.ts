import type { TokenType } from "@/lib/model";
import { TEMPLATE_DEFAULTS } from "@/lib/templates/defaults";
import { slug } from "./normalize";

/** Token names the CSS templates read. A token with one of these names fills the generated CSS. */
export const TEMPLATE_TOKENS: ReadonlyMap<string, TokenType> = new Map(
  TEMPLATE_DEFAULTS.tokens.map((t) => [t.name, t.type]),
);

export const isTemplateToken = (name: string) => TEMPLATE_TOKENS.has(name);

export const templateTokensOfType = (type: TokenType) =>
  [...TEMPLATE_TOKENS].filter(([, t]) => t === type).map(([name]) => name);

const words = (name: string) => ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
const has = (w: string, ...terms: string[]) => terms.some((t) => w.includes(` ${t} `));

/**
 * Suggest a template color token from a Figma style, variable or layer name.
 * Order matters: more specific roles are checked first.
 */
export function suggestColorName(figmaName: string): string {
  const w = words(figmaName);
  const hover = has(w, "hover", "dark", "darker", "pressed", "active");
  if (has(w, "on primary", "primary text", "on brand", "inverse text")) return "color-on-primary";
  if (has(w, "focus")) return "color-focus";
  if (has(w, "overlay", "scrim", "backdrop")) return "color-overlay";
  if (has(w, "isi")) return has(w, "text") ? "color-isi-text" : "color-isi-background";
  if (has(w, "footer"))
    return has(w, "text", "link") ? "color-footer-text" : "color-footer-background";
  if (has(w, "header", "navbar") && !has(w, "text", "link")) return "color-header-background";
  if (has(w, "link")) return hover ? "color-link-hover" : "color-link";
  if (has(w, "primary", "brand")) return hover ? "color-primary-hover" : "color-primary";
  if (has(w, "heading", "headline", "title")) return "color-heading";
  if (has(w, "muted", "subtle", "secondary text", "caption")) return "color-text-muted";
  if (has(w, "text", "body", "foreground", "copy", "ink")) return "color-text";
  if (has(w, "surface", "card", "panel")) return "color-surface";
  if (has(w, "background", "bg", "page", "canvas")) return "color-background";
  if (has(w, "border", "divider", "stroke", "outline", "rule")) return "color-border";
  if (has(w, "disabled"))
    return has(w, "text") ? "color-disabled-text" : "color-disabled-background";
  return `color-${slug(figmaName) || "unnamed"}`;
}

export type TextRole =
  { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6 } | { kind: "body" } | { kind: "small" };

/** Recognise heading levels and body text in a text style name. */
export function textRole(figmaName: string): TextRole | null {
  const lower = figmaName.toLowerCase();
  const heading = /\b(?:h|heading|headline)\s*-?\s*([1-6])\b/.exec(lower);
  if (heading) return { kind: "heading", level: Number(heading[1]) as 1 | 2 | 3 | 4 | 5 | 6 };
  if (/\b(body|paragraph|regular|base|copy)\b/.test(lower)) return { kind: "body" };
  if (/\b(small|caption|footnote|legal)\b/.test(lower)) return { kind: "small" };
  return null;
}
