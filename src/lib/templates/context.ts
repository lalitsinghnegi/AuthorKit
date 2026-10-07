import { CSS_TEMPLATE_IDS, type Breakpoint, type CssTemplateId } from "@/lib/model";
import { cascade, type Approach, type Values } from "./cascade";
import { TEMPLATE_DEFAULTS, type ComponentValues, type TemplateDefaults } from "./defaults";
import { withPrefix } from "./manifest";

export type Declaration = { property: string; value: string };
export type Rule = { selector: string; declarations: Declaration[] };
/** One non-base breakpoint's media query and the overrides it carries. */
export type Hook = { name: string; range: string; condition: string; rules: Rule[] };

export type TemplateContext = {
  brandName: string;
  prefix: string;
  approach: Approach;
  /** Token base values, in declaration order. */
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
};

/** Brand names go into CSS comments; make sure they cannot close one. */
export const commentSafe = (text: string) => text.replaceAll("*/", "* /").replace(/[\r\n]+/g, " ");

const KEY_SEP = "\u0000";

/**
 * Build the render context from defaults: every breakpoint gets the base values,
 * and breakpoints whose min-width reaches `largeScreen.minWidth` also get the
 * large-screen overrides. Values are then reduced to base + minimal hooks.
 */
export function buildTemplateContext(input: ContextInput): TemplateContext {
  const defaults = input.defaults ?? TEMPLATE_DEFAULTS;
  const { prefix, approach, breakpoints } = input;
  const isLarge = (id: string) => {
    const b = breakpoints.find((x) => x.id === id);
    return b?.minWidth !== undefined && b.minWidth >= defaults.largeScreen.minWidth;
  };
  const resolve = (value: string) => withPrefix(value, prefix);

  // Tokens
  const baseTokens: Values = Object.fromEntries(defaults.tokens.map((t) => [t.name, t.value]));
  const tokenCascade = cascade(breakpoints, approach, (id) =>
    isLarge(id) ? { ...baseTokens, ...defaults.largeScreen.tokens } : baseTokens,
  );
  const tokens = defaults.tokens.map((t) => ({
    name: t.name,
    value: resolve(tokenCascade.base[t.name]),
  }));
  const tokenHooks = toHooks(tokenCascade.steps, () => ":root", prefix, resolve);

  // Components: flatten "suffix\0variable" so one cascade covers all selectors.
  const flatten = (values: ComponentValues[CssTemplateId] | undefined): Values => {
    const out: Values = {};
    for (const [suffix, vars] of Object.entries(values ?? {})) {
      for (const [name, value] of Object.entries(vars)) out[`${suffix}${KEY_SEP}${name}`] = value;
    }
    return out;
  };

  const componentBase = {} as TemplateContext["componentBase"];
  const componentHooks = {} as TemplateContext["componentHooks"];
  for (const id of CSS_TEMPLATE_IDS) {
    const base = flatten(defaults.components[id]);
    const large = { ...base, ...flatten(defaults.largeScreen.components[id]) };
    const result = cascade(breakpoints, approach, (bpId) => (isLarge(bpId) ? large : base));

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
    brandName: commentSafe(input.brandName),
    prefix,
    approach,
    tokens,
    tokenHooks,
    componentBase,
    componentHooks,
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
