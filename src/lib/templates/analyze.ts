import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

/** Facts about a stylesheet, used by tests now and by the quality gates later. */
export type CssFacts = {
  classes: Set<string>;
  /** Custom properties referenced with var(--name), without the leading dashes. */
  usedVariables: Set<string>;
  /** Custom properties declared anywhere, without the leading dashes. */
  declaredVariables: Set<string>;
  hasTransitionOrAnimation: boolean;
  hasReducedMotionQuery: boolean;
  hasFocusVisible: boolean;
};

export function analyzeCss(css: string): CssFacts {
  const root = postcss.parse(css);
  const facts: CssFacts = {
    classes: new Set(),
    usedVariables: new Set(),
    declaredVariables: new Set(),
    hasTransitionOrAnimation: false,
    hasReducedMotionQuery: false,
    hasFocusVisible: false,
  };

  root.walkRules((rule) => {
    if (rule.selector.includes(":focus-visible")) facts.hasFocusVisible = true;
    selectorParser((selectors) => {
      selectors.walkClasses((c) => {
        facts.classes.add(c.value);
      });
    }).processSync(rule.selector);
  });
  root.walkAtRules("media", (at) => {
    if (/prefers-reduced-motion:\s*reduce/.test(at.params)) facts.hasReducedMotionQuery = true;
  });
  root.walkDecls((decl) => {
    if (decl.prop.startsWith("--")) facts.declaredVariables.add(decl.prop.slice(2));
    for (const m of decl.value.matchAll(/var\(\s*--([a-zA-Z0-9_-]+)/g))
      facts.usedVariables.add(m[1]);
    if (/^(transition|animation)/.test(decl.prop) && !/^(none|0s)$/.test(decl.value)) {
      const insideReduced =
        decl.parent?.parent?.type === "atrule" &&
        /prefers-reduced-motion/.test((decl.parent.parent as postcss.AtRule).params);
      if (!insideReduced) facts.hasTransitionOrAnimation = true;
    }
  });
  return facts;
}

/** Properties that carry design values and must read them from variables. */
export const DESIGN_PROPERTIES = new Set([
  "color",
  "background",
  "background-color",
  "border",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-color",
  "border-width",
  "border-radius",
  "outline",
  "outline-color",
  "outline-offset",
  "box-shadow",
  "font",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "gap",
  "row-gap",
  "column-gap",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "top",
  "right",
  "bottom",
  "left",
  "z-index",
  "transition",
  "transition-duration",
  "animation-duration",
]);

/** Literal values that are structural rather than design decisions. */
export const ALLOWED_LITERALS = new Set([
  "0",
  "auto",
  "none",
  "inherit",
  "initial",
  "unset",
  "transparent",
  "currentcolor",
  "100%",
  "0s",
  "0 auto",
]);

/** Declarations that put a literal design value into a regular property (custom properties are exempt). */
export function literalDesignValues(css: string): string[] {
  const found: string[] = [];
  postcss.parse(css).walkDecls((decl) => {
    if (decl.prop.startsWith("--") || !DESIGN_PROPERTIES.has(decl.prop)) return;
    const value = decl.value.trim().toLowerCase();
    if (value.includes("var(") || ALLOWED_LITERALS.has(value)) return;
    const selector = decl.parent?.type === "rule" ? (decl.parent as postcss.Rule).selector : "?";
    found.push(`${selector} { ${decl.prop}: ${decl.value} }`);
  });
  return found;
}
