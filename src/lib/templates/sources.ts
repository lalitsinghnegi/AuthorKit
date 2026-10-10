import {
  CSS_TEMPLATE_IDS,
  CSS_TEMPLATE_LABELS,
  type Breakpoint,
  type CssTemplateId,
  type DesignToken,
  type ResponsiveEntry,
  type ResponsiveFile,
} from "@/lib/model";
import { validateTokenValue } from "@/lib/tokens/validateValue";
import type { Approach, Values } from "./cascade";
import { cascade } from "./cascade";
import { contrastRatio } from "./contrast";
import { TEMPLATE_DEFAULTS, type TemplateDefaults } from "./defaults";

export type SourceKind = "figma-token" | "override" | "responsive" | "responsive-fluid" | "default";

export type SourceRow = {
  kind: "token" | "component";
  /** Variable name without "--" and prefix. */
  name: string;
  /** File the variable lives in, e.g. "tokens.css" or "header.css". */
  file: string;
  source: SourceKind;
  /** Value at the base breakpoint (may contain {{prefix}}). */
  value: string;
};

export type Attention = { message: string; screen?: "tokens" | "mapping" | "responsive" };

export type GenerationReport = {
  rows: SourceRow[];
  attention: Attention[];
};

/** Values for every breakpoint, ready for cascade(). */
export type ResolvedValues = {
  /** Template token names in template order. */
  tokenNames: string[];
  tokensFor: (breakpointId: string) => Values;
  /** component → block/element suffix → variable → value, for one breakpoint. */
  componentFor: (id: CssTemplateId, breakpointId: string) => Record<string, Values>;
};

export type SourceInput = {
  breakpoints: readonly Breakpoint[];
  approach: Approach;
  tokens?: readonly DesignToken[];
  responsive?: ResponsiveFile | null;
  defaults?: TemplateDefaults;
};

/** Foreground/background pairs checked on the final colors. */
export const CONTRAST_PAIRS: [fg: string, bg: string, min: number][] = [
  ["color-text", "color-background", 4.5],
  ["color-heading", "color-background", 4.5],
  ["color-text-muted", "color-background", 4.5],
  ["color-link", "color-background", 4.5],
  ["color-link-hover", "color-background", 4.5],
  ["color-on-primary", "color-primary", 4.5],
  ["color-on-primary", "color-primary-hover", 4.5],
  ["color-primary", "color-background", 4.5],
  ["color-footer-text", "color-footer-background", 4.5],
  ["color-footer-link", "color-footer-background", 4.5],
  ["color-isi-text", "color-isi-background", 4.5],
  ["color-focus", "color-background", 3],
  ["color-focus-inverse", "color-footer-background", 3],
];

const ACTIVE = new Set<DesignToken["status"]>(["accepted", "overridden"]);
const fileOf = (id: CssTemplateId) => `${id}.css`;
const label = (t: string) =>
  t === "typography" ? "Typography" : (CSS_TEMPLATE_LABELS[t as CssTemplateId] ?? t);

function responsiveSource(entry: ResponsiveEntry, variable: string): SourceKind {
  const sources = Object.values(entry.values).map((v) => v[variable]?.source);
  return sources.includes("frame") || sources.includes("inferred")
    ? "responsive"
    : "responsive-fluid";
}

/**
 * Decide every value the templates use, per breakpoint, and explain where it
 * came from. Priority:
 * - tokens: responsive typography > accepted/overridden token > default (+ large-screen default)
 * - component variables: responsive value > default (+ large-screen default)
 * A token taken from Figma applies at every breakpoint and drops the built-in
 * large-screen override, so the design value is not silently changed.
 */
export function resolveDesignValues(input: SourceInput): {
  resolved: ResolvedValues;
  report: GenerationReport;
} {
  const defaults = input.defaults ?? TEMPLATE_DEFAULTS;
  const { breakpoints } = input;
  const attention: Attention[] = [];
  const rows: SourceRow[] = [];
  const isLarge = (id: string) => {
    const b = breakpoints.find((x) => x.id === id);
    return b?.minWidth !== undefined && b.minWidth >= defaults.largeScreen.minWidth;
  };
  const base =
    cascade(breakpoints, input.approach, () => ({})).steps[0]?.breakpointId ?? breakpoints[0]?.id;

  // ---- Tokens ----
  const templateNames = defaults.tokens.map((t) => t.name);
  const templateSet = new Set(templateNames);
  const defaultValue: Values = Object.fromEntries(defaults.tokens.map((t) => [t.name, t.value]));

  const fromFigma = new Map<string, DesignToken>();
  for (const token of input.tokens ?? []) {
    if (!ACTIVE.has(token.status)) continue;
    const error = validateTokenValue(token.type, token.value);
    if (error) {
      attention.push({
        message: `${token.name}: the saved value “${token.value}” is not valid (${error}); the default is used.`,
        screen: "tokens",
      });
      continue;
    }
    // Only template tokens reach the CSS; anything else is reported and left out.
    if (!templateSet.has(token.name)) {
      attention.push({
        message: `${token.name} is not a template token, so it is not used.`,
        screen: "tokens",
      });
      continue;
    }
    fromFigma.set(token.name, token);
    if (token.meta?.missing) {
      attention.push({
        message: `${token.name} is no longer found in Figma but is still used.`,
        screen: "tokens",
      });
    }
    if (token.meta?.reasons.some((r) => /different values for/.test(r))) {
      attention.push({
        message: `${token.name}: Figma has several values for this token; check that ${token.value} is the right one.`,
        screen: "tokens",
      });
    }
  }
  const waiting = (input.tokens ?? []).filter((t) => t.status === "auto").length;
  if (waiting) {
    attention.push({
      message: `${waiting} token${waiting === 1 ? " is" : "s are"} waiting for review and not used yet.`,
      screen: "tokens",
    });
  }

  const typography = input.responsive?.typography;
  const typographyVars = new Set(
    typography ? Object.values(typography.values).flatMap((v) => Object.keys(v)) : [],
  );
  for (const name of typographyVars) {
    if (!templateSet.has(name)) continue;
    const token = fromFigma.get(name);
    if (!token || !typography) continue;
    const measured = new Set(
      Object.values(typography.values)
        .map((v) => v[name]?.value)
        .filter(Boolean),
    );
    if (!measured.has(token.value)) {
      attention.push({
        message: `${name} is ${token.value} in Tokens but Responsive measured ${[...measured].join(" / ")}; the responsive values are used.`,
        screen: "responsive",
      });
    }
  }

  const tokensFor = (bp: string): Values => {
    const out: Values = {};
    for (const name of templateNames) {
      const responsive = typographyVars.has(name)
        ? typography!.values[bp]?.[name]?.value
        : undefined;
      if (responsive) out[name] = responsive;
      else if (fromFigma.has(name)) out[name] = fromFigma.get(name)!.value;
      else
        out[name] =
          isLarge(bp) && defaults.largeScreen.tokens[name]
            ? defaults.largeScreen.tokens[name]
            : defaultValue[name];
    }
    return out;
  };

  for (const name of templateNames) {
    const source: SourceKind = typographyVars.has(name)
      ? responsiveSource(typography!, name)
      : fromFigma.has(name)
        ? fromFigma.get(name)!.status === "overridden"
          ? "override"
          : "figma-token"
        : "default";
    rows.push({
      kind: "token",
      name,
      file: "tokens.css",
      source,
      value: base ? tokensFor(base)[name] : defaultValue[name],
    });
  }

  // ---- Component variables ----
  const suffixOf = new Map<string, string>(); // "component\0variable" → suffix
  for (const id of CSS_TEMPLATE_IDS) {
    for (const [suffix, vars] of Object.entries(defaults.components[id] ?? {})) {
      for (const name of Object.keys(vars)) suffixOf.set(`${id}\u0000${name}`, suffix);
    }
  }
  for (const [id, entry] of Object.entries(input.responsive?.components ?? {})) {
    for (const name of new Set(Object.values(entry!.values).flatMap((v) => Object.keys(v)))) {
      if (!suffixOf.has(`${id}\u0000${name}`)) {
        attention.push({
          message: `${label(id)}: “${name}” is not a variable of this template and was ignored.`,
          screen: "responsive",
        });
      }
    }
  }

  const componentFor = (id: CssTemplateId, bp: string): Record<string, Values> => {
    const out: Record<string, Values> = {};
    const entry = input.responsive?.components[id];
    for (const [suffix, vars] of Object.entries(defaults.components[id] ?? {})) {
      out[suffix] = {};
      for (const [name, value] of Object.entries(vars)) {
        const responsive = entry?.values[bp]?.[name]?.value;
        const large = isLarge(bp)
          ? defaults.largeScreen.components[id]?.[suffix]?.[name]
          : undefined;
        out[suffix][name] = responsive ?? large ?? value;
      }
    }
    return out;
  };

  for (const id of CSS_TEMPLATE_IDS) {
    const entry = input.responsive?.components[id];
    for (const [suffix, vars] of Object.entries(defaults.components[id] ?? {})) {
      for (const name of Object.keys(vars)) {
        const responsive = entry && Object.values(entry.values).some((v) => v[name]);
        rows.push({
          kind: "component",
          name,
          file: fileOf(id),
          source: responsive ? responsiveSource(entry, name) : "default",
          value: base ? componentFor(id, base)[suffix][name] : vars[name],
        });
      }
    }
  }

  // ---- Notes from the responsive extraction ----
  const entries: [string, ResponsiveEntry | undefined][] = [
    ["typography", input.responsive?.typography],
    ...Object.entries(input.responsive?.components ?? {}),
  ];
  for (const [target, entry] of entries) {
    for (const note of entry?.notes ?? [])
      attention.push({ message: `${label(target)}: ${note}`, screen: "responsive" });
  }

  // ---- Contrast on the final base colors ----
  if (base) {
    const final = tokensFor(base);
    for (const [fg, bg, min] of CONTRAST_PAIRS) {
      const a = final[fg];
      const b = final[bg];
      if (!a?.startsWith("#") || !b?.startsWith("#")) continue;
      if (!fromFigma.has(fg) && !fromFigma.has(bg)) continue; // defaults are checked by the template tests
      try {
        const ratio = contrastRatio(a, b);
        if (ratio < min) {
          attention.push({
            message: `${fg} on ${bg} has contrast ${ratio.toFixed(2)}:1 (needs ${min}:1).`,
            screen: "tokens",
          });
        }
      } catch {
        // Non-hex colors (e.g. rgb()) are not checked.
      }
    }
  }

  return {
    resolved: {
      tokenNames: templateNames,
      tokensFor,
      componentFor,
    },
    report: { rows, attention },
  };
}
