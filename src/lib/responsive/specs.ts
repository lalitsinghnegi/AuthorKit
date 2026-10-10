import type { FigmaNode, FigmaStyleMeta } from "@/lib/figma/types";
import type { CssTemplateId } from "@/lib/model";
import { textRole } from "@/lib/tokens/naming";

/**
 * A measured value. Lengths stay in px until the end, so fluid values can be
 * interpolated; `scales` says whether a single frame may become a fluid clamp(). Written as px.
 */
export type Measured = { px: number; scales: boolean } | { keyword: string };
export type Measurements = Record<string, Measured>;

const size = (px: number | undefined): Measured | undefined =>
  typeof px === "number" && px >= 0 ? { px, scales: true } : undefined;
const kw = (keyword: string): Measured => ({ keyword });

const visible = (n: FigmaNode) => n.visible !== false;
const height = (n: FigmaNode) => n.absoluteBoundingBox?.height;
const width = (n: FigmaNode) => n.absoluteBoundingBox?.width;
const hasLayout = (n: FigmaNode) => Boolean(n.layoutMode && n.layoutMode !== "NONE");

/** Depth-first search of visible descendants (not the node itself). */
function find(
  node: FigmaNode,
  test: (n: FigmaNode) => boolean,
  maxDepth = 4,
): FigmaNode | undefined {
  const visit = (n: FigmaNode, depth: number): FigmaNode | undefined => {
    for (const child of n.children ?? []) {
      if (!visible(child)) continue;
      if (test(child)) return child;
      if (depth < maxDepth) {
        const hit = visit(child, depth + 1);
        if (hit) return hit;
      }
    }
    return undefined;
  };
  return visit(node, 1);
}

const named = (pattern: RegExp) => (n: FigmaNode) => pattern.test(n.name);
const firstText = (n: FigmaNode) => find(n, (c) => c.type === "TEXT" && Boolean(c.style?.fontSize));

/** Drop undefined entries. */
function clean(entries: Record<string, Measured | undefined>): Measurements {
  return Object.fromEntries(
    Object.entries(entries).filter((e): e is [string, Measured] => e[1] !== undefined),
  );
}

const DRAWER: Measurements = {
  "header-toggle-display": kw("inline-flex"),
  "header-nav-display": kw("none"),
  "header-nav-position": kw("absolute"),
  "header-nav-padding": kw("var(--{{prefix}}-space-4) var(--{{prefix}}-size-gutter)"),
  "header-nav-shadow": kw("var(--{{prefix}}-shadow-md)"),
  "header-list-direction": kw("column"),
};
const INLINE: Measurements = {
  "header-toggle-display": kw("none"),
  "header-nav-display": kw("block"),
  "header-nav-position": kw("static"),
  "header-nav-padding": kw("0"),
  "header-nav-shadow": kw("none"),
  "header-list-direction": kw("row"),
};

/** How to read each component's responsive variables from one mapped frame. */
export const SPECS: Partial<Record<CssTemplateId, (frame: FigmaNode) => Measurements>> = {
  header(f) {
    // A visible menu button means the navigation is collapsed into a drawer at this size.
    const toggle = find(f, named(/\b(menu|hamburger|burger|toggle)\b/i), 2);
    const nav = find(f, named(/\b(nav|navigation)\b/i), 2);
    const layout = toggle ? DRAWER : nav ? INLINE : {};
    return {
      ...clean({
        "header-padding-x": hasLayout(f) ? size(f.paddingLeft) : undefined,
        "header-gap": hasLayout(f) ? size(f.itemSpacing) : undefined,
        "header-min-height": size(height(f)),
      }),
      ...layout,
    };
  },
  footer(f) {
    return clean({
      "footer-padding-y": hasLayout(f) ? size(f.paddingTop) : undefined,
      "footer-gap": hasLayout(f) ? size(f.itemSpacing) : undefined,
      "footer-direction":
        f.layoutMode === "HORIZONTAL"
          ? kw("row")
          : f.layoutMode === "VERTICAL"
            ? kw("column")
            : undefined,
    });
  },
  cta(f) {
    const isButton = (n: FigmaNode) =>
      hasLayout(n) && (typeof n.cornerRadius === "number" || /\b(button|btn|cta)\b/i.test(n.name));
    const button =
      isButton(f) && f.type !== "FRAME" ? f : (find(f, isButton) ?? (isButton(f) ? f : undefined));
    if (!button) return {};
    const label = firstText(button);
    const radius = button.cornerRadius;
    return clean({
      "btn-padding-y": size(button.paddingTop),
      "btn-padding-x": size(button.paddingLeft),
      "btn-font-size": size(label?.style?.fontSize),
      "btn-radius":
        typeof radius === "number"
          ? radius >= 500
            ? { px: 999, scales: false }
            : { px: radius, scales: false }
          : undefined,
    });
  },
  modals(f) {
    return clean({
      "modal-width": size(width(f)),
      "modal-padding": hasLayout(f) ? size(f.paddingTop) : undefined,
    });
  },
  accordion(f) {
    const item =
      hasLayout(f) && f.paddingTop ? f : find(f, (n) => hasLayout(n) && Boolean(n.paddingTop), 2);
    return clean({
      "accordion-padding-y": size(item?.paddingTop),
      "accordion-title-size": size(firstText(f)?.style?.fontSize),
    });
  },
  isi(f) {
    return clean({ "isi-padding-y": hasLayout(f) ? size(f.paddingTop) : undefined });
  },
};

/** Font-size tokens from text layers recognised as headings or body text (by layer or text style name). */
export function readTypography(
  frame: FigmaNode,
  styles: Record<string, FigmaStyleMeta> = {},
): Measurements {
  const out: Measurements = {};
  const visit = (n: FigmaNode) => {
    if (!visible(n)) return;
    if (n.type === "TEXT" && n.style?.fontSize) {
      const styleName = n.styles?.text ? styles[n.styles.text]?.name : undefined;
      const role = textRole(n.name) ?? (styleName ? textRole(styleName) : null);
      const name =
        role?.kind === "heading"
          ? `font-size-h${role.level}`
          : role?.kind === "body"
            ? "font-size-base"
            : null;
      if (name && !out[name]) out[name] = { px: n.style.fontSize, scales: true };
    }
    for (const child of n.children ?? []) visit(child);
  };
  visit(frame);
  return out;
}
