import { describeRange, mediaQueries, sortBreakpoints } from "@/lib/breakpoints";
import type { GeneratedFile } from "@/lib/generator/types";
import type { Breakpoint, CssTemplateId, Project, TokenType } from "@/lib/model";
import { contrastRatio } from "@/lib/templates/contrast";
import { TEMPLATE_DEFAULTS } from "@/lib/templates/defaults";
import { manifestClasses, withPrefix, type ComponentManifest } from "@/lib/templates/manifest";
import { PSEUDO_STATES } from "./states";
import type { VariableValue } from "./variables";

/** Escape text for HTML element content and attribute values (both quote styles). */
export const esc = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/** Order of components in the sidebar. */
export const COMPONENT_ORDER: CssTemplateId[] = [
  "global",
  "cta",
  "header",
  "footer",
  "isi",
  "modals",
  "accordion",
];

export type GuideInput = {
  project: Pick<Project, "brandName" | "prefix" | "approach" | "breakpoints">;
  manifests: Record<CssTemplateId, ComponentManifest>;
  /** Package files (paths relative to the package root). */
  files: GeneratedFile[];
  entryName: string;
  variables: Map<string, VariableValue>;
  extras: readonly string[];
};

/** A representative viewport width for showing each breakpoint. */
export function viewportWidth(b: Breakpoint): number {
  if (b.minWidth === undefined) return Math.min(375, b.maxWidth ?? 375);
  if (b.maxWidth === undefined) return Math.max(b.minWidth, 1280);
  return b.minWidth;
}

const copyButton = (value: string, label: string) =>
  `<button type="button" class="sg-copy" data-sg-copy="${esc(value)}" aria-label="${esc(label)}">Copy</button>`;

/** The document shown inside an example frame. Relative links resolve against the guide page. */
function frameDoc(html: string): string {
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<link rel="stylesheet" href="../${ENTRY_PLACEHOLDER}"><link rel="stylesheet" href="states.css">`,
    "<style>body{margin:0;padding:16px}</style>",
    `</head><body>${html}</body></html>`,
  ].join("");
}
const ENTRY_PLACEHOLDER = "__SG_ENTRY__";

/**
 * `autofocus` in an example would steal focus on load and scroll the guide to
 * that frame, so live examples get a harmless data attribute instead. The
 * copyable code keeps the real attribute.
 */
export const neutraliseAutofocus = (html: string) =>
  html.replace(/(\s)autofocus(?=[\s>=/])/g, "$1data-sg-autofocus");

const PLACEHOLDER_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40"><rect width="120" height="40" rx="6" fill="#c9cfd6"/><text x="60" y="25" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#1f2329">Logo</text></svg>',
)}`;

/**
 * Example images point at files the package does not ship (logo.svg). Live
 * examples show a placeholder instead so nothing fails to load; the copyable
 * code keeps the real path.
 */
export const placeholderImages = (html: string) =>
  html.replace(/(<img\b[^>]*\ssrc=")(?!https?:|data:)[^"]*(")/g, `$1${PLACEHOLDER_IMAGE}$2`);

function frame(title: string, html: string, entryName: string, extra = ""): string {
  const doc = frameDoc(placeholderImages(neutraliseAutofocus(html))).replace(
    ENTRY_PLACEHOLDER,
    entryName,
  );
  // Focusable and labelled so keyboard users can scroll wide examples sideways.
  return `<div class="sg-frame-wrap" tabindex="0" role="region" aria-label="${esc(title)}, scrollable"><iframe class="sg-frame" title="${esc(title)}" loading="lazy" srcdoc="${esc(doc)}"${extra}></iframe></div>`;
}

function codeBlock(id: string, code: string, label: string): string {
  return `<div class="sg-code"><pre tabindex="0" aria-label="${esc(label)}"><code id="${id}">${esc(code)}</code></pre><button type="button" class="sg-copy" data-sg-copy-from="${id}" aria-label="${esc(`Copy ${label}`)}">Copy</button></div>`;
}

function tabs(groupId: string, panels: { label: string; body: string }[]): string {
  if (panels.length === 1) return panels[0].body;
  const tabList = panels
    .map(
      (p, i) =>
        `<button type="button" role="tab" id="${groupId}-tab-${i}" aria-controls="${groupId}-panel-${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(p.label)}</button>`,
    )
    .join("");
  const bodies = panels
    .map(
      (p, i) =>
        `<div role="tabpanel" id="${groupId}-panel-${i}" aria-labelledby="${groupId}-tab-${i}"${i === 0 ? "" : " hidden"}>${p.body}</div>`,
    )
    .join("");
  return `<div class="sg-tabs"><div role="tablist" aria-label="Code">${tabList}</div>${bodies}</div>`;
}

function overridesCell(v: VariableValue | undefined): string {
  if (!v?.overrides.length) return "";
  return v.overrides
    .map(
      (o) =>
        `<div class="sg-override"><span>@media ${esc(o.condition)}</span> <code>${esc(o.value)}</code></div>`,
    )
    .join("");
}

function componentSection(id: CssTemplateId, input: GuideInput): string {
  const { project, manifests, files, entryName, variables } = input;
  const m = manifests[id];
  const p = project.prefix;
  const filePaths = files.filter((f) => f.templateId === id).map((f) => f.path);
  const anchor = `sg-${id}`;
  const classes = manifestClasses(m, p);
  const search = [m.name, m.description, ...classes].join(" ").toLowerCase();

  const examples = m.examples
    .map((ex, i) => {
      const html = withPrefix(ex.html, p);
      return `<div class="sg-example"><h4>${esc(ex.title)}</h4>${frame(`${m.name}: ${ex.title}`, html, entryName)}${codeBlock(`${anchor}-html-${i}`, html, `${ex.title} HTML`)}</div>`;
    })
    .join("");

  // Pseudo-class states shown side by side on the first example.
  const pseudoStates = m.states
    .map((s) => {
      const pseudo = Object.keys(PSEUDO_STATES).find((k) => s.trigger.includes(k));
      return pseudo
        ? { name: s.name, state: PSEUDO_STATES[pseudo], target: withPrefix(s.appliesTo, p) }
        : null;
    })
    .filter((s): s is { name: string; state: string; target: string } => s !== null)
    .filter((s, i, all) => all.findIndex((o) => o.state === s.state) === i);
  const first = withPrefix(m.examples[0].html, p);
  const statesGrid = pseudoStates.length
    ? `<h3>Variants and states</h3><div class="sg-states">${[
        `<figure class="sg-state"><figcaption>default</figcaption>${frame(`${m.name}: default`, first, entryName)}</figure>`,
        ...pseudoStates.map(
          (s) =>
            `<figure class="sg-state"><figcaption>${esc(s.name)}</figcaption>${frame(
              `${m.name}: ${s.name}`,
              first,
              entryName,
              ` data-sg-state="${esc(s.state)}" data-sg-state-target="${esc(s.target)}"`,
            )}</figure>`,
        ),
      ].join("")}</div>`
    : "";

  const statesFor = (selector: string) =>
    m.states
      .filter((s) =>
        withPrefix(s.appliesTo, p)
          .split(/\s*,\s*/)
          .includes(withPrefix(selector, p)),
      )
      .map((s) => s.name);
  const selectorRows = m.selectors
    .map((s) => {
      const selector = withPrefix(s.selector, p);
      const isClass = selector.startsWith(".");
      return `<tr><td><code>${esc(selector)}</code>${isClass ? ` ${copyButton(selector.slice(1), `Copy class ${selector.slice(1)}`)}` : ""}</td><td>${esc(s.type)}</td><td>${esc(s.purpose)}</td><td>${esc(statesFor(s.selector).join(", ") || "—")}</td><td>${filePaths.map((f) => `<code>${esc(f)}</code>`).join("<br>")}</td></tr>`;
    })
    .join("");

  const stateRows = m.states
    .map(
      (s) =>
        `<tr><td>${esc(s.name)}</td><td><code>${esc(withPrefix(s.trigger, p))}</code></td><td>${esc(withPrefix(s.description, p))}</td></tr>`,
    )
    .join("");

  const variableRows = m.variables
    .map((name) => {
      const full = `${p}-${name}`;
      const v = variables.get(full);
      return `<tr><td><code>--${esc(full)}</code> ${copyButton(`var(--${full})`, `Copy var(--${full})`)}</td><td><code>${esc(v?.base ?? "—")}</code></td><td>${overridesCell(v)}</td></tr>`;
    })
    .join("");

  const code = tabs(`${anchor}-code`, [
    { label: "HTML", body: codeBlock(`${anchor}-html`, first, `${m.name} HTML`) },
    ...(m.htl
      ? [
          {
            label: "HTL (AEM)",
            body: codeBlock(`${anchor}-htl`, withPrefix(m.htl, p), `${m.name} HTL`),
          },
        ]
      : []),
  ]);

  const list = (items: string[]) =>
    `<ul>${items.map((i) => `<li>${esc(withPrefix(i, p))}</li>`).join("")}</ul>`;

  return `<section class="sg-section" id="${anchor}" aria-labelledby="${anchor}-title" data-sg-search="${esc(search)}">
<h2 id="${anchor}-title">${esc(m.name)}</h2>
<p class="sg-lead">${esc(withPrefix(m.description, p))}</p>
<p class="sg-files">${filePaths.map((f) => `<code>${esc(f)}</code>`).join(" ")}</p>
<h3>Examples</h3>${examples}
${statesGrid}
<h3>Code</h3>${code}
<h3>Selectors</h3>
<div class="sg-table-wrap"><table><thead><tr><th scope="col">Selector</th><th scope="col">Type</th><th scope="col">Purpose</th><th scope="col">States</th><th scope="col">File</th></tr></thead><tbody>${selectorRows}</tbody></table></div>
${stateRows ? `<h3>States</h3><div class="sg-table-wrap"><table><thead><tr><th scope="col">State</th><th scope="col">How</th><th scope="col">What changes</th></tr></thead><tbody>${stateRows}</tbody></table></div>` : ""}
<h3>Accessibility</h3>${list(m.accessibility)}
${m.keyboard?.length ? `<h3>Keyboard</h3><div class="sg-table-wrap"><table><thead><tr><th scope="col">Keys</th><th scope="col">Action</th></tr></thead><tbody>${m.keyboard.map((k) => `<tr><td><kbd>${esc(k.keys)}</kbd></td><td>${esc(k.action)}</td></tr>`).join("")}</tbody></table></div>` : ""}
${m.hooks?.length ? `<h3>JavaScript hooks</h3>${list(m.hooks.map((h) => `${h.attribute}: ${h.purpose}`))}` : ""}
<h3>CSS variables</h3>
<div class="sg-table-wrap"><table><thead><tr><th scope="col">Variable</th><th scope="col">Base value</th><th scope="col">Per breakpoint</th></tr></thead><tbody>${variableRows}</tbody></table></div>
</section>`;
}

const TOKEN_GROUPS: { title: string; types: TokenType[] }[] = [
  { title: "Colors", types: ["color"] },
  {
    title: "Typography",
    types: ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing"],
  },
  { title: "Spacing", types: ["spacing"] },
  { title: "Radius and borders", types: ["radius", "border"] },
  { title: "Shadows", types: ["shadow"] },
  { title: "Sizes, layers and motion", types: ["size", "zIndex", "duration"] },
];

function tokenPreview(
  type: TokenType,
  variable: string,
  value: string,
  background: string,
): string {
  const v = `var(--${variable})`;
  switch (type) {
    case "color": {
      let ratio = "";
      try {
        if (value.startsWith("#") && background.startsWith("#"))
          ratio = `<span class="sg-meta">${contrastRatio(value, background).toFixed(1)}:1</span>`;
      } catch {
        // Not a hex color.
      }
      return `<span class="sg-swatch" style="background:${esc(v)}"></span>${ratio}`;
    }
    case "fontFamily":
      return `<span style="font-family:${esc(v)}">The quick brown fox</span>`;
    case "fontSize":
      return `<span class="sg-type-sample" style="font-size:${esc(v)}">Aa Bb Cc</span>`;
    case "fontWeight":
      return `<span style="font-weight:${esc(v)}">Weight</span>`;
    case "lineHeight":
      return `<span class="sg-lines" style="line-height:${esc(v)}">Line one<br>Line two</span>`;
    case "letterSpacing":
      return `<span style="letter-spacing:${esc(v)}">Letter spacing</span>`;
    case "spacing":
      return `<span class="sg-bar" style="width:${esc(v)}"></span>`;
    case "radius":
      return `<span class="sg-box" style="border-radius:${esc(v)}"></span>`;
    case "border":
      return `<span class="sg-box" style="border-width:${esc(v)}"></span>`;
    case "shadow":
      return `<span class="sg-box" style="box-shadow:${esc(v)};border-color:transparent"></span>`;
    default:
      return "";
  }
}

function tokensSection(input: GuideInput): string {
  const { project, variables, extras } = input;
  const p = project.prefix;
  const background = variables.get(`${p}-color-background`)?.base ?? "#fff";
  const typeOf = new Map(TEMPLATE_DEFAULTS.tokens.map((t) => [t.name, t.type]));
  const row = (name: string, type: TokenType) => {
    const full = `${p}-${name}`;
    const v = variables.get(full);
    if (!v) return "";
    return `<tr data-sg-search="${esc(full)}"><td class="sg-preview">${tokenPreview(type, full, v.base ?? "", background)}</td><td><code>--${esc(full)}</code> ${copyButton(`var(--${full})`, `Copy var(--${full})`)}</td><td><code>${esc(v.base ?? "")}</code></td><td>${overridesCell(v)}</td></tr>`;
  };
  const table = (rows: string) =>
    `<div class="sg-table-wrap"><table class="sg-tokens"><thead><tr><th scope="col">Preview</th><th scope="col">Variable</th><th scope="col">Value</th><th scope="col">Per breakpoint</th></tr></thead><tbody>${rows}</tbody></table></div>`;

  const groups = TOKEN_GROUPS.map((g) => {
    const rows = TEMPLATE_DEFAULTS.tokens
      .filter((t) => g.types.includes(t.type))
      .map((t) => row(t.name, t.type))
      .join("");
    return rows ? `<h3>${g.title}</h3>${table(rows)}` : "";
  }).join("");
  const extraRows = extras
    .map((name) =>
      row(
        name,
        typeOf.get(name) ??
          (/^#|^rgb/.test(variables.get(`${p}-${name}`)?.base ?? "") ? "color" : "size"),
      ),
    )
    .join("");

  return `<section class="sg-section" id="sg-tokens" aria-labelledby="sg-tokens-title" data-sg-search="design tokens colors typography spacing radius shadows">
<h2 id="sg-tokens-title">Design tokens</h2>
<p class="sg-lead">Every design value is a CSS custom property on <code>:root</code>. Use the variables, not the raw values, so your components follow the brand when tokens change.</p>
${groups}
${extraRows ? `<h3>Extra values from Figma</h3><p>Not read by the templates; available for your own CSS.</p>${table(extraRows)}` : ""}
</section>`;
}

function overviewSection(input: GuideInput, components: CssTemplateId[]): string {
  const { project, entryName, files } = input;
  const queries = mediaQueries(project.breakpoints.breakpoints, project.approach);
  const byId = new Map(project.breakpoints.breakpoints.map((b) => [b.id, b]));
  return `<section class="sg-section" id="sg-overview" aria-labelledby="sg-overview-title" data-sg-search="overview getting started breakpoints">
<h2 id="sg-overview-title">${esc(project.brandName)} style guide</h2>
<p class="sg-lead">Generated by AuthorKit from the same component descriptions and CSS as the package, so the two always match. Apply the classes shown here to your AEM components.</p>
<h3>Getting started</h3>
${codeBlock("sg-link", `<link rel="stylesheet" href="${entryName}">`, "the stylesheet link")}
<p>Classes use BEM with the <code>${esc(project.prefix)}-</code> prefix; variables use <code>--${esc(project.prefix)}-</code>. The approach is <strong>${esc(project.approach)}</strong>.</p>
<h3>Breakpoints</h3>
<div class="sg-table-wrap"><table><thead><tr><th scope="col">Name</th><th scope="col">Screen width</th><th scope="col">Media query</th></tr></thead><tbody>${queries
    .map(
      (q) =>
        `<tr><td>${esc(q.name)}</td><td>${esc(describeRange(byId.get(q.breakpointId)!))}</td><td><code>${esc(q.condition ? `@media ${q.condition}` : "base styles")}</code></td></tr>`,
    )
    .join("")}</tbody></table></div>
<h3>Components in this package</h3>
<ul>${components
    .map(
      (id) =>
        `<li><a href="#sg-${id}">${esc(input.manifests[id].name)}</a>: ${files
          .filter((f) => f.templateId === id)
          .map((f) => `<code>${esc(f.path)}</code>`)
          .join(", ")}</li>`,
    )
    .join("")}</ul>
</section>`;
}

/** The whole guide page. Deterministic for the same input. */
export function renderGuidePage(input: GuideInput): string {
  const { project, manifests, files } = input;
  const present = new Set(files.flatMap((f) => (f.templateId ? [f.templateId] : [])));
  const components = COMPONENT_ORDER.filter((id) => present.has(id));
  const breakpoints = sortBreakpoints(project.breakpoints.breakpoints);
  const largest = breakpoints[breakpoints.length - 1];
  // tokens.css only declares :root variables, so the guide page can load it for token previews
  // without the package restyling the guide itself.
  const tokensFile = files.find((f) => f.templateId === "tokens")?.path;

  // Class → purpose, for inspect mode.
  const classInfo: Record<string, { component: string; purpose: string }> = {};
  for (const id of components) {
    for (const s of manifests[id].selectors) {
      if (s.type === "html-element") continue;
      classInfo[withPrefix(s.selector, project.prefix).slice(1)] = {
        component: manifests[id].name,
        purpose: withPrefix(s.purpose, project.prefix),
      };
    }
  }

  const nav = [
    `<li><a href="#sg-overview">Overview</a></li>`,
    present.has("tokens") ? `<li><a href="#sg-tokens">Design tokens</a></li>` : "",
    ...components.map(
      (id) =>
        `<li><a href="#sg-${id}" data-sg-search="${esc(`${manifests[id].name} ${manifestClasses(manifests[id], project.prefix).join(" ")}`.toLowerCase())}">${esc(manifests[id].name)}</a></li>`,
    ),
  ].join("");

  const viewports = breakpoints
    .map(
      (b) =>
        `<button type="button" data-sg-viewport="${viewportWidth(b)}" aria-pressed="${b.id === largest?.id}">${esc(b.name)} <span>${viewportWidth(b)}px</span></button>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(project.brandName)} · Style guide</title>
${tokensFile ? `<link rel="stylesheet" href="../${esc(tokensFile)}">\n` : ""}<link rel="stylesheet" href="styleguide.css">
</head>
<body>
<a class="sg-skip" href="#sg-main">Skip to content</a>
<header class="sg-topbar">
<div class="sg-brand">${esc(project.brandName)} <span>Style guide · <code>${esc(project.prefix)}</code></span></div>
<div class="sg-tools">
<div class="sg-viewports" role="group" aria-label="Example width">${viewports}</div>
<button type="button" class="sg-inspect-toggle" aria-pressed="false">Inspect classes</button>
</div>
</header>
<div class="sg-layout">
<nav class="sg-sidebar" aria-label="Style guide">
<label for="sg-search">Search</label>
<input id="sg-search" type="search" placeholder="Component or class" autocomplete="off">
<ul>${nav}</ul>
<p class="sg-no-results" hidden>No matches.</p>
</nav>
<main id="sg-main" class="sg-main" tabindex="-1">
${overviewSection(input, components)}
${present.has("tokens") ? tokensSection(input) : ""}
${components.map((id) => componentSection(id, input)).join("\n")}
</main>
</div>
<aside class="sg-inspector" aria-label="Inspected element" hidden>
<div class="sg-inspector-head"><strong>Inspected element</strong><button type="button" class="sg-inspector-close" aria-label="Close inspector">×</button></div>
<div class="sg-inspector-body"></div>
</aside>
<div class="sg-toast" role="status" aria-live="polite"></div>
<script type="application/json" id="sg-classes">${JSON.stringify(classInfo).replaceAll("<", "\\u003c")}</script>
<script src="styleguide.js"></script>
</body>
</html>
`;
}
