import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import type { CssTemplateId, Project, SelectorMapping } from "@/lib/model";
import type { ComponentManifest } from "@/lib/templates/manifest";

/** A template part that can be mapped: block, element or modifier class without the prefix. */
export type MappablePart = {
  componentId: CssTemplateId;
  part: string;
  kind: "block" | "element" | "modifier";
};

/** Where one template class goes: the site class, optionally inside the block's site class. */
export type Target = { cls: string; scope?: string };

/** Template part ("accordion__trigger") → its site class. */
export type ClassMap = { prefix: string; targets: Map<string, Target> };

/** The block a part belongs to: "isi-bar__toggle" → "isi-bar", "btn--primary" → "btn". */
export const blockOf = (part: string) => part.split("__")[0].split("--")[0];

/** Every mappable part of the manifests, in manifest order. */
export function mappableParts(manifests: Record<string, ComponentManifest>): MappablePart[] {
  const parts: MappablePart[] = [];
  for (const m of Object.values(manifests)) {
    for (const s of m.selectors) {
      if (s.type !== "block" && s.type !== "element" && s.type !== "modifier") continue;
      parts.push({
        componentId: m.id,
        part: s.selector.replace(/^\.\{\{prefix\}\}-/, ""),
        kind: s.type,
      });
    }
  }
  return parts;
}

export type MappingProblem = { part?: string; message: string };

/**
 * Check confirmed mappings before they are saved or used. Any problem blocks
 * generation, since a bad mapping would make the CSS and docs disagree.
 */
export function validateMappings(
  mappings: readonly SelectorMapping[],
  parts: readonly MappablePart[],
  prefix: string,
): MappingProblem[] {
  const problems: MappingProblem[] = [];
  const byPart = new Map(parts.map((p) => [p.part, p]));
  const templateClasses = new Set(parts.map((p) => `${prefix}-${p.part}`));
  const seen = new Set<string>();
  const confirmed = new Map<string, SelectorMapping>();

  for (const m of mappings) {
    const part = byPart.get(m.part);
    if (!part || part.componentId !== m.componentId) {
      problems.push({ part: m.part, message: `"${m.part}" is not a part of ${m.componentId}.` });
      continue;
    }
    if (seen.has(m.part)) {
      problems.push({ part: m.part, message: `.${prefix}-${m.part} is mapped more than once.` });
      continue;
    }
    seen.add(m.part);
    if (m.state !== "confirmed") continue;
    const cls = m.selector!.slice(1);
    if (templateClasses.has(cls))
      problems.push({
        part: m.part,
        message: `${m.selector} is a template class; choose the class the site uses.`,
      });
    if (m.scoped && part.kind !== "element")
      problems.push({
        part: m.part,
        message:
          "Only elements can be limited to their block; blocks and variants are the block itself.",
      });
    confirmed.set(m.part, m);
  }

  // Scoped elements need their block mapped, and the same site class may only
  // stand for two parts when their full selectors still differ.
  const fullSelector = new Map<string, string>();
  for (const [part, m] of confirmed) {
    let scope = "";
    if (m.scoped) {
      const block = confirmed.get(blockOf(part));
      if (!block) {
        problems.push({
          part,
          message: `Confirm a site class for .${prefix}-${blockOf(part)} first, or don't limit this one to its block.`,
        });
        continue;
      }
      scope = `${block.selector} `;
    }
    const full = `${scope}${m.selector}`;
    const other = fullSelector.get(full);
    if (other)
      problems.push({
        part,
        message: `${full} is also used for .${prefix}-${other}. Limit both to their blocks, or choose different classes.`,
      });
    else fullSelector.set(full, part);
  }
  return problems;
}

/** The class map to apply, or null when site selectors are off or nothing is confirmed. */
export function classMapFor(project: Pick<Project, "prefix" | "siteSelectors">): ClassMap | null {
  const settings = project.siteSelectors;
  if (!settings?.enabled) return null;
  const confirmed = settings.mappings.filter((m) => m.state === "confirmed" && m.selector);
  if (confirmed.length === 0) return null;
  const byPart = new Map(confirmed.map((m) => [m.part, m]));
  const targets = new Map<string, Target>();
  for (const m of confirmed) {
    const scope = m.scoped ? byPart.get(blockOf(m.part))?.selector?.slice(1) : undefined;
    targets.set(m.part, { cls: m.selector!.slice(1), ...(scope ? { scope } : {}) });
  }
  return { prefix: project.prefix, targets };
}

/** Site classes the map introduces, for the output lint rules. */
export const mappedClasses = (map: ClassMap | null) =>
  map ? [...new Set([...map.targets.values()].map((t) => t.cls))].sort() : [];

/* ---------- applying the map ---------- */

/**
 * Rewrite class selectors in CSS. A scoped element gets its block's site class
 * as an ancestor, unless the selector already has it before that element:
 * `.ak-header__logo:hover` → `.cmp-xf--header .cmp-image:hover`.
 */
export function mapCss(css: string, map: ClassMap): string {
  const byClass = new Map(
    [...map.targets].map(([part, target]) => [`${map.prefix}-${part}`, target]),
  );
  const processor = selectorParser((selectors) => {
    selectors.each((selector) => {
      const classes: selectorParser.ClassName[] = [];
      selector.walkClasses((c) => {
        classes.push(c);
      });
      for (const c of classes) {
        const target = byClass.get(c.value);
        if (!target) continue;
        c.value = target.cls;
        // Only top-level compounds are scoped; classes inside :not()/:is() stay as they are.
        if (!target.scope || c.parent !== selector) continue;
        const index = selector.index(c);
        const before = selector.nodes.slice(0, index);
        if (before.some((n) => n.type === "class" && n.value === target.scope)) continue;
        let start = index;
        while (start > 0 && selector.nodes[start - 1].type !== "combinator") start--;
        // The scope takes over the whitespace before the compound (", " in a list).
        const first = selector.nodes[start];
        const scope = selectorParser.className({ value: target.scope });
        scope.spaces.before = first.spaces.before;
        first.spaces.before = "";
        selector.insertBefore(first, selectorParser.combinator({ value: " " }));
        selector.insertBefore(selector.nodes[start], scope);
      }
    });
  });
  const root = postcss.parse(css);
  root.walkRules((rule) => {
    rule.selector = processor.processSync(rule.selector);
  });
  return root.toString();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Replace whole template class names in any text (HTML class attributes, JS
 * strings, Markdown). `prefixToken` is the project prefix, or "{{prefix}}" for
 * manifest text. Never touches custom properties such as --ak-btn-padding.
 */
export function mapText(text: string, map: ClassMap, prefixToken = map.prefix): string {
  if (map.targets.size === 0) return text;
  const lookup = new Map([...map.targets].map(([part, t]) => [`${prefixToken}-${part}`, t.cls]));
  const alternatives = [...lookup.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
  const re = new RegExp(`(?<![A-Za-z0-9_-])(?:${alternatives.join("|")})(?![A-Za-z0-9_-])`, "g");
  return text.replace(re, (m) => lookup.get(m)!);
}

/**
 * The manifests as this project's package documents them: site classes in
 * selectors, states, examples and HTL, and the scope on scoped elements.
 */
export function mapManifests(
  manifests: Record<CssTemplateId, ComponentManifest>,
  map: ClassMap | null,
): Record<CssTemplateId, ComponentManifest> {
  if (!map) return manifests;
  const out = {} as Record<CssTemplateId, ComponentManifest>;
  for (const [id, m] of Object.entries(manifests) as [CssTemplateId, ComponentManifest][]) {
    const mapped = JSON.parse(mapText(JSON.stringify(m), map, "{{prefix}}")) as ComponentManifest;
    mapped.selectors = mapped.selectors.map((s, i) => {
      const original = m.selectors[i];
      if (original.type === "html-element") return s;
      const target = map.targets.get(original.selector.replace(/^\.\{\{prefix\}\}-/, ""));
      return target?.scope ? { ...s, scope: `.${target.scope}` } : s;
    });
    out[id] = mapped;
  }
  return out;
}
