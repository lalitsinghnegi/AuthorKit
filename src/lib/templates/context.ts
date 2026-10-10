import {
  CSS_TEMPLATE_IDS,
  type Breakpoint,
  type CssTemplateId,
  type DesignToken,
  type ResponsiveFile,
} from "@/lib/model";
import { cascade, type Approach, type Values } from "./cascade";
import type { TemplateDefaults } from "./defaults";
import { withPrefix } from "./manifest";
import { resolveDesignValues, type GenerationReport } from "./sources";

export type Declaration = { property: string; value: string };
export type Rule = { selector: string; declarations: Declaration[] };
/** One non-base breakpoint's media query and the overrides it carries. */
export type Hook = { name: string; range: string; condition: string; rules: Rule[] };

export type TemplateContext = {
  brandName: string;
  prefix: string;
  approach: Approach;
  /** Template token base values, in declaration order. */
  tokens: { name: string; value: string }[];
  tokenHooks: Hook[];
  /** component → block/element suffix → variable → base value */
  componentBase: Record<CssTemplateId, Record<string, Values>>;
  componentHooks: Record<CssTemplateId, Hook[]>;
};

export type ContextInput = {
  brandName: string;
  prefix: string;
  approach: Approach;
  breakpoints: readonly Breakpoint[];
  defaults?: TemplateDefaults;
  /** Accepted/overridden tokens from the Tokens screen. */
  tokens?: readonly DesignToken[];
  /** Per-breakpoint values from the Responsive screen. */
  responsive?: ResponsiveFile | null;
};

/** Brand names go into CSS comments; make sure they cannot close one. */
export const commentSafe = (text: string) => text.replaceAll("*/", "* /").replace(/[\r\n]+/g, " ");

const KEY_SEP = "\u0000";

/**
 * Build the render context. resolveDesignValues decides every value per
 * breakpoint (Figma tokens, responsive values, defaults); cascade() then
 * reduces them to base values plus minimal media-query hooks.
 */
export function buildTemplateContext(input: ContextInput): TemplateContext {
  return buildTemplateContextWithReport(input).context;
}

/** Same as buildTemplateContext, plus the report of where every value came from. */
export function buildTemplateContextWithReport(input: ContextInput): {
  context: TemplateContext;
  report: GenerationReport;
} {
  const { prefix, approach, breakpoints } = input;
  const { resolved, report } = resolveDesignValues(input);
  const resolve = (value: string) => withPrefix(value, prefix);

  // Tokens
  const tokenCascade = cascade(breakpoints, approach, resolved.tokensFor);
  const tokens = resolved.tokenNames.map((name) => ({
    name,
    value: resolve(tokenCascade.base[name]),
  }));
  const tokenHooks = toHooks(tokenCascade.steps, () => ":root", prefix, resolve);

  // Components: flatten "suffix\0variable" so one cascade covers all selectors.
  const flatten = (values: Record<string, Values>): Values => {
    const out: Values = {};
    for (const [suffix, vars] of Object.entries(values)) {
      for (const [name, value] of Object.entries(vars)) out[`${suffix}${KEY_SEP}${name}`] = value;
    }
    return out;
  };

  const componentBase = {} as TemplateContext["componentBase"];
  const componentHooks = {} as TemplateContext["componentHooks"];
  for (const id of CSS_TEMPLATE_IDS) {
    const result = cascade(breakpoints, approach, (bpId) =>
      flatten(resolved.componentFor(id, bpId)),
    );
    const grouped: Record<string, Values> = {};
    for (const [key, value] of Object.entries(result.base)) {
      const [suffix, name] = key.split(KEY_SEP);
      (grouped[suffix] ??= {})[name] = resolve(value);
    }
    componentBase[id] = grouped;
    componentHooks[id] = toHooks(
      result.steps,
      (key) => `.${prefix}-${key.split(KEY_SEP)[0]}`,
      prefix,
      resolve,
      (key) => key.split(KEY_SEP)[1],
    );
  }

  return {
    context: {
      brandName: commentSafe(input.brandName),
      prefix,
      approach,
      tokens,
      tokenHooks,
      componentBase,
      componentHooks,
    },
    report,
  };
}

function toHooks(
  steps: ReturnType<typeof cascade>["steps"],
  selectorFor: (key: string) => string,
  prefix: string,
  resolve: (v: string) => string,
  nameFor: (key: string) => string = (key) => key,
): Hook[] {
  return steps
    .filter((s) => s.condition !== null)
    .map((step) => {
      const rules = new Map<string, Declaration[]>();
      for (const [key, value] of Object.entries(step.changed)) {
        const selector = selectorFor(key);
        if (!rules.has(selector)) rules.set(selector, []);
        rules
          .get(selector)!
          .push({ property: `--${prefix}-${nameFor(key)}`, value: resolve(value) });
      }
      return {
        name: step.name,
        range: step.range,
        condition: step.condition!,
        rules: [...rules].map(([selector, declarations]) => ({ selector, declarations })),
      };
    });
}
