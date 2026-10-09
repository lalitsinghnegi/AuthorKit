import type { CssTemplateId, Project } from "@/lib/model";
import { esc, placeholderImages } from "@/lib/styleguide/page";
import { withPrefix, type ComponentManifest } from "@/lib/templates/manifest";

/** Template parts the sample script looks up; site selectors may rename them. */
const SCRIPT_PARTS = [
  "header__toggle",
  "accordion__trigger",
  "isi-bar",
  "isi-bar__toggle",
  "isi-bar--expanded",
  "modal",
] as const;

/**
 * Plain-JavaScript wiring for the documented hooks. Prefix-aware, no dependencies.
 * `classOf` gives the class used for a template part (a site class when mapped).
 */
export function sampleScript(
  prefix: string,
  classOf: (part: string) => string = (part) => `${prefix}-${part}`,
): string {
  const classes = Object.fromEntries(SCRIPT_PARTS.map((part) => [part, classOf(part)]));
  return `(function () {
  "use strict";
  var P = ${JSON.stringify(prefix)};
  var C = ${JSON.stringify(classes)};
  var q = function (selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); };

  // Header: the menu button toggles aria-expanded; CSS shows the nav that follows it.
  q("." + C["header__toggle"]).forEach(function (button) {
    button.addEventListener("click", function () {
      button.setAttribute("aria-expanded", String(button.getAttribute("aria-expanded") !== "true"));
    });
  });
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    var open = document.querySelector("." + C["header__toggle"] + "[aria-expanded='true']");
    if (open) {
      open.setAttribute("aria-expanded", "false");
      open.focus();
    }
  });

  // Accordion: keep aria-expanded on the trigger and hidden on its panel in sync.
  q("." + C["accordion__trigger"]).forEach(function (trigger) {
    trigger.addEventListener("click", function () {
      var expanded = trigger.getAttribute("aria-expanded") === "true";
      trigger.setAttribute("aria-expanded", String(!expanded));
      var panel = document.getElementById(trigger.getAttribute("aria-controls"));
      if (panel) panel.hidden = expanded;
    });
  });

  // ISI safety bar: toggle aria-expanded and the --expanded modifier together.
  q("." + C["isi-bar__toggle"]).forEach(function (toggle) {
    var bar = toggle.closest("." + C["isi-bar"]);
    toggle.addEventListener("click", function () {
      var expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      if (bar) bar.classList.toggle(C["isi-bar--expanded"], !expanded);
    });
  });

  // Modals: data-*-modal-open="<dialog id>" opens with showModal(); data-*-modal-close closes.
  var opener = null;
  document.addEventListener("click", function (event) {
    var openButton = event.target.closest("[data-" + P + "-modal-open]");
    if (openButton) {
      var dialog = document.getElementById(openButton.getAttribute("data-" + P + "-modal-open"));
      if (dialog && typeof dialog.showModal === "function") {
        opener = openButton;
        dialog.showModal();
        document.body.classList.add(P + "-modal-open");
      }
      return;
    }
    var closeButton = event.target.closest("[data-" + P + "-modal-close]");
    if (closeButton) {
      var parent = closeButton.closest("dialog");
      if (parent) parent.close();
    }
  });
  q("dialog." + C["modal"]).forEach(function (dialog) {
    dialog.addEventListener("close", function () {
      document.body.classList.remove(P + "-modal-open");
      if (opener) opener.focus();
      opener = null;
    });
  });
})();
`;
}

/** The manifest example by title, with the project prefix applied. */
function example(manifest: ComponentManifest, prefix: string, title: string): string {
  const found = manifest.examples.find((e) => e.title === title) ?? manifest.examples[0];
  return withPrefix(found.html, prefix);
}

/**
 * A one-page demo of every component in the package, built from the
 * manifest examples so it always matches the documentation. Links only the
 * brand entry stylesheet.
 */
export function renderSamplePage(
  project: Pick<Project, "brandName" | "prefix">,
  entryName: string,
  included: ReadonlySet<CssTemplateId>,
  manifests: Record<CssTemplateId, ComponentManifest>,
  classOf?: (part: string) => string,
): string {
  const p = project.prefix;
  const brand = esc(project.brandName);
  const has = (id: CssTemplateId) => included.has(id);
  // Inline layout uses the package's own tokens: the library has no layout-container class.
  const container = `max-width: var(--${p}-size-container-max); margin: 0 auto; padding: var(--${p}-space-6) var(--${p}-size-gutter);`;

  const modal = has("modals")
    ? // The manifest shows the dialog already open; on a real page it starts closed.
      example(manifests.modals, p, "Interstitial (leaving the site)").replace(/\sopen(?=[\s>])/, "")
    : "";

  const sections = [
    `<h1>${brand}</h1>`,
    `<p>This sample page uses <code>${esc(entryName)}</code> only. It shows each component in the package with the classes from the style guide in <code>style-guide/index.html</code>.</p>`,
    `<h2>Typography</h2>`,
    `<p>Body copy with <a href="#main">a link</a>, a reference<sup>1</sup> and H<sub>2</sub>O.</p>`,
    `<ul><li>First point</li><li>Second point</li></ul>`,
    ...(has("global") ? [`<h3 class="${p}-h5">A heading styled one level smaller</h3>`] : []),
    ...(has("cta")
      ? [
          `<h2>Buttons</h2>`,
          `<p>${example(manifests.cta, p, "Variants")}</p>`,
          `<p>${example(manifests.cta, p, "Disabled")}</p>`,
        ]
      : []),
    ...(has("accordion")
      ? [`<h2>Frequently asked questions</h2>`, example(manifests.accordion, p, "")]
      : []),
    ...(has("modals")
      ? [
          `<h2>Leaving the site</h2>`,
          `<p>${example(manifests.modals, p, "Opening a modal")}</p>`,
          modal,
        ]
      : []),
  ];

  const body = [
    ...(has("header") ? [example(manifests.header, p, "Header with navigation")] : []),
    `<main id="main" style="${container}">`,
    ...sections,
    `</main>`,
    ...(has("isi") ? [example(manifests.isi, p, "In-page ISI")] : []),
    ...(has("footer") ? [example(manifests.footer, p, "Footer")] : []),
    ...(has("isi") ? [example(manifests.isi, p, "Sticky safety bar (collapsed)")] : []),
  ];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${brand}: sample page</title>
<link rel="stylesheet" href="${esc(entryName)}">
</head>
<body>
${placeholderImages(body.join("\n"))}
<script>
${sampleScript(p, classOf)}</script>
</body>
</html>
`;
}
