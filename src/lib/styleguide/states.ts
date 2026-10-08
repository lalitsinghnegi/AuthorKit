import postcss, { type AtRule, type Rule } from "postcss";
import { formatCss } from "@/lib/quality/format";

/** Interactive pseudo-classes the guide can show without a pointer, and the attribute value standing in for each. */
export const PSEUDO_STATES: Record<string, string> = {
  ":hover": "hover",
  ":focus-visible": "focus",
  ":focus": "focus",
  ":active": "active",
};

const PSEUDO = /:(hover|focus-visible|focus|active)\b/g;
/** Non-global twin of PSEUDO for .test(): a global regex keeps lastIndex between calls. */
const HAS_PSEUDO = /:(hover|focus-visible|focus|active)\b/;

/** Rewrite one selector's pseudo-classes as data-sg-state attributes, e.g. ".x:hover" → '.x[data-sg-state~="hover"]'. */
export function forceStateSelector(selector: string): string {
  return selector.replace(PSEUDO, (m) => `[data-sg-state~="${PSEUDO_STATES[m]}"]`);
}

/**
 * A stylesheet that copies every rule using :hover, :focus(-visible) or
 * :active, with those pseudo-classes replaced by [data-sg-state~=…]. Loaded
 * after the package CSS in example frames, it lets the guide show states side
 * by side. Rules inside @media keep their media query; other rules are dropped.
 */
export function buildStatesCss(css: string[]): string {
  const out = postcss.root();
  for (const source of css) {
    const root = postcss.parse(source);
    const copyRule = (rule: Rule): Rule | null => {
      const selectors = rule.selectors.filter((s) => HAS_PSEUDO.test(s));
      if (selectors.length === 0) return null;
      return rule.clone({ selectors: selectors.map(forceStateSelector) });
    };
    root.each((node) => {
      if (node.type === "rule") {
        const copy = copyRule(node);
        if (copy) out.append(copy);
      } else if (node.type === "atrule" && node.name === "media") {
        const copies = (node.nodes ?? [])
          .flatMap((n) => (n.type === "rule" ? [copyRule(n)] : []))
          .filter((r): r is Rule => r !== null);
        if (copies.length) {
          const media = (node as AtRule).clone({ nodes: [] });
          media.append(...copies);
          out.append(media);
        }
      }
    });
  }
  return formatCss(`/* AuthorKit style guide: forced states (generated) */\n\n${out.toString()}`);
}
