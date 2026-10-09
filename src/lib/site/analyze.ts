import { parse, type DefaultTreeAdapterMap } from "parse5";
import type { CssTemplateId, SitePart, SiteSuggestion } from "@/lib/model";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

/** One class from a template that can be matched to a class on the site. */
export type PartDef = {
  componentId: CssTemplateId;
  /** Template class without the prefix, e.g. "accordion__trigger". */
  part: string;
  kind: SitePart["kind"];
};

type ManifestLike = { id: string; selectors: { type: string; selector?: string }[] };

/** Block, element and modifier classes of every component manifest (global and tokens have none). */
export function partsFromManifests(manifests: Record<string, ManifestLike>): PartDef[] {
  const parts: PartDef[] = [];
  for (const m of Object.values(manifests)) {
    for (const s of m.selectors) {
      if (s.type !== "block" && s.type !== "element" && s.type !== "modifier") continue;
      const part = s.selector?.replace(/^\.\{\{prefix\}\}-/, "");
      if (!part || part === s.selector) continue;
      parts.push({ componentId: m.id as CssTemplateId, part, kind: s.type });
    }
  }
  return parts;
}

/* ---------- vocabulary ---------- */

/** Words that name each template block on real sites. */
const BLOCK_WORDS: Record<string, string[]> = {
  accordion: ["accordion", "faq", "faqs", "collapsible", "expander"],
  btn: ["button", "btn", "cta"],
  header: ["header", "masthead"],
  footer: ["footer"],
  isi: ["isi", "safety"],
  "isi-bar": ["isi", "safety"],
  "isi-bar-spacer": ["isi", "safety"],
  modal: ["modal", "dialog", "popup", "interstitial", "lightbox"],
};
const BAR_WORDS = ["bar", "tray", "sticky", "fixed", "drawer", "floating", "flyout"];
const SPACER_WORDS = ["spacer", "placeholder"];

/** Words that name each template element. */
const ELEMENT_WORDS: Record<string, string[]> = {
  item: ["item"],
  heading: ["header", "heading", "head"],
  trigger: ["button", "trigger", "toggle"],
  icon: ["icon", "chevron", "arrow", "caret"],
  panel: ["panel", "content", "body", "collapse"],
  inner: ["inner", "container", "wrapper", "wrap"],
  logo: ["logo", "brand", "image"],
  links: ["links", "list", "menu", "nav"],
  link: ["link", "anchor"],
  legal: ["legal", "disclaimer", "disclosure"],
  copyright: ["copyright"],
  toggle: ["toggle", "hamburger", "burger", "menu-toggle"],
  nav: ["nav", "navigation"],
  list: ["list", "group", "menu"],
  content: ["content", "body", "text"],
  title: ["title", "heading", "headline"],
  section: ["section"],
  header: ["header", "head", "top"],
  close: ["close", "dismiss"],
  body: ["body", "content"],
  footer: ["footer", "actions", "buttons"],
};

const MODIFIER_WORDS: Record<string, string[]> = {
  primary: ["primary"],
  secondary: ["secondary"],
  tertiary: ["tertiary", "text", "link"],
  block: ["block", "full", "wide", "full-width"],
  sticky: ["sticky", "fixed"],
  expanded: ["expanded", "open", "active"],
  interstitial: ["interstitial", "leaving", "exit", "external"],
};

/** Prefixes and helpers that carry no meaning: cmp-, js-, is-, has-… */
const NOISE = new Set(["cmp", "c", "js", "is", "has", "aem", "xf", "o", "m", "l", "u"]);

const CLASS_RE = /^-?[_a-zA-Z][_a-zA-Z0-9-]*$/;

type ClassName = { block: string[]; element: string; elementWords: string[]; modifier: string[] };

function splitClass(name: string): ClassName {
  const [main, ...mods] = name.toLowerCase().split("--");
  const [block, ...elements] = main.split("__");
  const element = elements.join("-");
  return {
    block: block.split(/[-_]/).filter((w) => w && !NOISE.has(w)),
    element,
    elementWords: element.split(/[-_]/).filter(Boolean),
    modifier: mods.join("-").split(/[-_]/).filter(Boolean),
  };
}

const hasAny = (words: string[], wanted: string[]) => words.some((w) => wanted.includes(w));

/** Every word a class may use to name the template block on its own. */
function blockVocabulary(templateBlock: string): string[] {
  const base = BLOCK_WORDS[templateBlock] ?? [templateBlock];
  if (templateBlock === "isi-bar") return [...base, ...BAR_WORDS];
  if (templateBlock === "isi-bar-spacer") return [...base, ...BAR_WORDS, ...SPACER_WORDS];
  return base;
}

/** Does a class's block name the template block (telling the ISI block, bar and spacer apart)? */
function blockMatches(templateBlock: string, words: string[]): boolean {
  if (!hasAny(words, BLOCK_WORDS[templateBlock] ?? [templateBlock])) return false;
  if (templateBlock === "isi") return !hasAny(words, [...BAR_WORDS, ...SPACER_WORDS]);
  if (templateBlock === "isi-bar") return hasAny(words, BAR_WORDS) && !hasAny(words, SPACER_WORDS);
  if (templateBlock === "isi-bar-spacer") return hasAny(words, SPACER_WORDS);
  return true;
}

/* ---------- reading the DOM ---------- */

type ClassStats = {
  count: number;
  pages: Set<number>;
  sample: Element;
  /** Classes and landmark tags/roles of ancestors, over all occurrences (capped). */
  context: Set<string>;
};

type PageScan = { title?: string; elements: number; scripts: number };

const SKIP = new Set(["script", "style", "noscript", "template"]);
const CONTEXT_CAP = 400;
/** Deeper markup is ignored, so a hostile page cannot exhaust the stack. */
const MAX_DEPTH = 256;

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function attr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

function scanPage(html: string, pageIndex: number, stats: Map<string, ClassStats>): PageScan {
  const doc = parse(html);
  const scan: PageScan = { elements: 0, scripts: 0 };

  const visit = (node: Node, context: string[], depth: number) => {
    if (!("childNodes" in node) || depth > MAX_DEPTH) return;
    for (const child of node.childNodes) {
      if (!isElement(child)) continue;
      const tag = child.tagName;
      if (tag === "script") scan.scripts++;
      if (tag === "title" && scan.title === undefined) {
        const text = child.childNodes.map((n) => ("value" in n ? n.value : "")).join("");
        scan.title = text.replace(/\s+/g, " ").trim().slice(0, 300) || undefined;
      }
      if (SKIP.has(tag)) continue;
      scan.elements++;

      const classes = (attr(child, "class") ?? "")
        .split(/\s+/)
        .filter((c) => c.length <= 200 && CLASS_RE.test(c));
      for (const c of new Set(classes)) {
        let s = stats.get(c);
        if (!s) {
          s = { count: 0, pages: new Set(), sample: child, context: new Set() };
          stats.set(c, s);
        }
        s.count++;
        s.pages.add(pageIndex);
        for (const k of context) if (s.context.size < CONTEXT_CAP) s.context.add(k);
      }

      const role = attr(child, "role");
      const own = [
        ...classes.map((c) => `.${c}`),
        ...(["header", "footer", "nav", "dialog"].includes(tag) ? [`<${tag}>`] : []),
        ...(role ? [`[role=${role}]`] : []),
      ];
      visit(child, own.length ? [...context, ...own] : context, depth + 1);
    }
  };
  visit(doc, [], 0);
  return scan;
}

/* ---------- samples ---------- */

const SAMPLE_ATTRS = [
  "class",
  "id",
  "role",
  "type",
  "href",
  "hidden",
  "aria-expanded",
  "aria-controls",
];
const SAMPLE_MAX = 1200;

/** Simplified markup of an element: a few attributes, two levels of children, short text. */
export function sampleOf(el: Element): string {
  const lines: string[] = [];
  const write = (node: Element, depth: number) => {
    const pad = "  ".repeat(depth);
    const attrs = node.attrs
      .filter((a) => SAMPLE_ATTRS.includes(a.name) || a.name.startsWith("data-cmp-"))
      .map((a) => {
        const v = a.value.replace(/\s+/g, " ").trim();
        return a.value === "" ? a.name : `${a.name}="${v.length > 80 ? `${v.slice(0, 79)}…` : v}"`;
      });
    lines.push(`${pad}<${[node.tagName, ...attrs].join(" ")}>`);
    const text = node.childNodes
      .map((n) => ("value" in n && n.nodeName === "#text" ? n.value : ""))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (text) lines.push(`${pad}  ${text.length > 40 ? `${text.slice(0, 39)}…` : text}`);
    const children = node.childNodes.filter(isElement).filter((c) => !SKIP.has(c.tagName));
    if (depth < 2) {
      for (const c of children.slice(0, 5)) write(c, depth + 1);
      if (children.length > 5) lines.push(`${pad}  … ${children.length - 5} more`);
    } else if (children.length) lines.push(`${pad}  …`);
  };
  write(el, 0);
  const out = lines.join("\n");
  return out.length > SAMPLE_MAX ? `${out.slice(0, SAMPLE_MAX - 2)}\n…` : out;
}

/* ---------- scoring ---------- */

type Scored = { selector: string; score: number; reason: string };

/** Is a class used inside the component (its block class, or the matching landmark)? */
function insideComponent(templateBlock: string, context: Set<string>): boolean {
  for (const k of context) {
    if (k.startsWith(".") && blockMatches(templateBlock, splitClass(k.slice(1)).block)) return true;
  }
  if (templateBlock === "header") return context.has("<header>");
  if (templateBlock === "footer") return context.has("<footer>");
  if (templateBlock === "modal") return context.has("<dialog>") || context.has("[role=dialog]");
  return false;
}

function scorePart(def: PartDef, name: string, stats: ClassStats): Scored | null {
  const [mainPart, modPart = ""] = def.part.split("--");
  const [templateBlock, templateElement = ""] = mainPart.split("__");
  const site = splitClass(name);
  const selector = `.${name}`;
  const aem = name.startsWith("cmp-") ? " (AEM Core Components)" : "";

  if (def.kind === "block") {
    if (site.element) return null;
    const blockMatch = blockMatches(templateBlock, site.block);
    if (site.modifier.length === 0 && blockMatch) {
      // "cmp-isi-tray" is the ISI bar itself; "footer-link" only mentions the footer.
      const exact = site.block.every((w) => blockVocabulary(templateBlock).includes(w));
      return exact
        ? { selector, score: 4, reason: `Named after the component${aem}` }
        : { selector, score: 2, reason: "Mentions the component in a longer name" };
    }
    if (site.modifier.length && !blockMatch && blockMatches(templateBlock, site.modifier))
      return { selector, score: 2, reason: "A variant class that names the component" };
    return null;
  }

  if (def.kind === "element") {
    // Classes with a modifier (cmp-accordion__button--expanded) are states or variants.
    if (site.modifier.length) return null;
    const synonyms = ELEMENT_WORDS[templateElement] ?? [templateElement];
    if (site.element) {
      const partMatch = synonyms.includes(site.element)
        ? 2
        : hasAny(site.elementWords, synonyms)
          ? 1
          : 0;
      if (!partMatch) return null;
      if (blockMatches(templateBlock, site.block))
        return { selector, score: 2 + partMatch, reason: `Component and part both match${aem}` };
      if (insideComponent(templateBlock, stats.context))
        return { selector, score: 2, reason: "Part name matches, inside the component" };
      return null;
    }
    if (hasAny(site.block, synonyms)) {
      if (insideComponent(templateBlock, stats.context))
        return { selector, score: 2, reason: "Matching name inside the component" };
      return null;
    }
    return null;
  }

  // Modifier: a variant such as btn--primary.
  const variant = MODIFIER_WORDS[modPart] ?? [modPart];
  if (
    site.modifier.length &&
    hasAny(site.modifier, variant) &&
    blockMatches(templateBlock, site.block)
  )
    return { selector, score: 3, reason: `Component and variant both match${aem}` };
  if (
    !site.modifier.length &&
    !site.element &&
    blockMatches(templateBlock, site.block) &&
    hasAny(site.block, variant)
  )
    return { selector, score: 2, reason: "Component and variant named together" };
  return null;
}

const confidenceOf = (score: number): SiteSuggestion["confidence"] =>
  score >= 3 ? "high" : score === 2 ? "medium" : "low";

/* ---------- entry point ---------- */

export type AnalyzedPage = { url: string; html: string };
export type PageSummary = { url: string; title?: string; elements: number };
export type SiteAnalysis = {
  pages: PageSummary[];
  parts: SitePart[];
  classes: { name: string; count: number }[];
  notes: string[];
};

/**
 * Find, for each template part, the classes on the site that most likely play
 * the same role. Pure and deterministic: the same pages always give the same
 * suggestions, ranked by score, then how often the class is used, then name.
 */
export function analyzeSite(pages: AnalyzedPage[], parts: PartDef[]): SiteAnalysis {
  const stats = new Map<string, ClassStats>();
  const summaries: PageSummary[] = [];
  const notes: string[] = [];

  pages.forEach((page, i) => {
    const scan = scanPage(page.html, i, stats);
    summaries.push({ url: page.url, title: scan.title, elements: scan.elements });
    if (scan.elements < 40 && scan.scripts > 0)
      notes.push(
        `${page.url} has very little markup and uses scripts, so it may be built in the browser. AuthorKit reads the HTML as served, so components added by scripts are not seen.`,
      );
  });

  const names = [...stats.keys()].sort();
  const result: SitePart[] = parts.map((def) => {
    const scored: (Scored & { count: number; stats: ClassStats })[] = [];
    for (const name of names) {
      const s = stats.get(name)!;
      const hit = scorePart(def, name, s);
      if (hit) scored.push({ ...hit, count: s.count, stats: s });
    }
    // Ties prefer AEM Core Components classes (.cmp-button) over component wrappers (.button).
    const aem = (selector: string) => (selector.startsWith(".cmp-") ? 1 : 0);
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        aem(b.selector) - aem(a.selector) ||
        b.count - a.count ||
        (a.selector < b.selector ? -1 : a.selector > b.selector ? 1 : 0),
    );
    return {
      componentId: def.componentId,
      part: def.part,
      kind: def.kind,
      suggestions: scored.slice(0, 3).map((h) => ({
        selector: h.selector,
        count: h.count,
        pages: [...h.stats.pages].sort((a, b) => a - b).slice(0, 50),
        confidence: confidenceOf(h.score),
        reason: h.reason,
        sample: sampleOf(h.stats.sample),
      })),
    };
  });

  if (pages.length > 0 && !names.some((n) => n.startsWith("cmp-")))
    notes.push(
      "No AEM Core Components classes (cmp-…) were found, so suggestions rely on class names alone. Check them carefully.",
    );
  const missing = result.filter((p) => p.kind !== "modifier" && p.suggestions.length === 0).length;
  if (missing > 0)
    notes.push(
      `${missing} part${missing === 1 ? " has" : "s have"} no match. Add pages that show those components, or choose the class yourself in the next step.`,
    );

  const classes = names
    .map((name) => ({ name, count: stats.get(name)!.count }))
    .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1))
    .slice(0, 2000);

  return { pages: summaries, parts: result, classes, notes };
}
