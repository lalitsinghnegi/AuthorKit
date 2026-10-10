// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { generate, project } from "@/test/figmaProject";
import { generatePackage } from "@/lib/generator/generate";
import { CSS_TEMPLATE_IDS } from "@/lib/model";
import { addNode, createFile, deleteNode, findNode } from "@/lib/scaffold";
import { analyzeCss, getManifests, manifestClasses, withPrefix } from "@/lib/templates";
import { generateStyleGuide } from "./generate";
import { neutraliseAutofocus, placeholderImages, viewportWidth } from "./page";
import { buildStatesCss, forceStateSelector } from "./states";
import { collectVariables } from "./variables";

const pkg = generate("mobile-first");
const guide = generateStyleGuide(project("mobile-first"), pkg.files);
const file = (p: string) => guide.find((f) => f.path === p)!.content;
const html = file("style-guide/index.html");
const dom = new JSDOM(html);
const $ = (sel: string) => dom.window.document.querySelector(sel)!;
const $$ = (sel: string) => [...dom.window.document.querySelectorAll(sel)];

describe("manifest examples", () => {
  const manifests = getManifests();
  const known = new Set(Object.values(manifests).flatMap((m) => manifestClasses(m, "acme")));

  it.each(CSS_TEMPLATE_IDS)("%s examples parse and only use documented classes", (id) => {
    for (const example of manifests[id].examples) {
      const doc = new JSDOM(`<body>${withPrefix(example.html, "acme")}</body>`).window.document;
      expect(doc.body.children.length, example.title).toBeGreaterThan(0);
      const used = [...doc.querySelectorAll("[class]")].flatMap((el) => [...el.classList]);
      for (const c of used) expect(known, `${id}: ${c}`).toContain(c);
    }
  });

  it.each(CSS_TEMPLATE_IDS.filter((id) => id !== "tokens"))(
    "%s: every documented class exists in the generated CSS",
    (id) => {
      const css = pkg.files.find((f) => f.templateId === id)!.content;
      const classes = analyzeCss(css).classes;
      for (const c of manifestClasses(manifests[id], "acme")) expect(classes, c).toContain(c);
    },
  );
});

describe("forced states", () => {
  it("rewrites interactive pseudo-classes as data attributes", () => {
    expect(forceStateSelector(".a:hover")).toBe('.a[data-sg-state~="hover"]');
    expect(forceStateSelector(".a:focus-visible, .b:active")).toBe(
      '.a[data-sg-state~="focus"], .b[data-sg-state~="active"]',
    );
    expect(forceStateSelector(".a[aria-expanded]")).toBe(".a[aria-expanded]");
  });

  it("copies only rules with states, keeping their media queries", () => {
    const css = buildStatesCss([
      ".a { color: red; }\n.a:hover, .b { color: blue; }\n@media (min-width: 1px) { .c:active { color: green; } .d { color: x; } }\n@media (prefers-reduced-motion: reduce) { .e { transition: none; } }",
    ]);
    expect(css).toContain('.a[data-sg-state~="hover"] {\n  color: blue;\n}');
    expect(css).not.toMatch(/^\.b|\.a \{|\.d|\.e/m);
    expect(css).toMatch(/@media \(min-width: 1px\) \{\s*\.c\[data-sg-state~="active"\]/);
  });

  it("covers the package's hover rules", () => {
    expect(file("style-guide/states.css")).toContain('.acme-btn[data-sg-state~="hover"]');
  });
});

describe("guide page", () => {
  it("lists overview, tokens and only the components in the package", () => {
    expect($$(".sg-sidebar a").map((a) => a.getAttribute("href"))).toEqual([
      "#sg-overview",
      "#sg-tokens",
      "#sg-global",
      "#sg-cta",
      "#sg-header",
      "#sg-footer",
      "#sg-isi",
      "#sg-modals",
      "#sg-accordion",
    ]);
    const tree = project("mobile-first").scaffold;
    const accordion = [
      ...(findNode(tree, "cb-components")!.node as { children: { id: string; name: string }[] })
        .children,
    ].find((c) => c.name === "accordion.css")!;
    const smaller = generatePackage({
      ...project("mobile-first"),
      scaffold: deleteNode(tree, accordion.id),
    });
    const smallerGuide = generateStyleGuide(project("mobile-first"), smaller.files).find(
      (f) => f.path === "style-guide/index.html",
    )!.content;
    expect(smallerGuide).not.toContain('id="sg-accordion"');
  });

  it("documents every selector with purpose, states and file", () => {
    const rows = $$("#sg-cta tbody tr").map((tr) => tr.textContent);
    for (const s of getManifests().cta.selectors) {
      expect(rows.some((r) => r!.includes(withPrefix(s.selector, "acme")))).toBe(true);
    }
    const base = $$("#sg-cta tbody tr").find((tr) => tr.textContent!.startsWith(".acme-btn"))!;
    expect(base.textContent).toContain("hover, focus, disabled");
    expect(base.textContent).toContain("css/components/cta.css");
    expect(base.querySelector("[data-sg-copy]")!.getAttribute("data-sg-copy")).toBe("acme-btn");
  });

  it("escapes code and frame documents", () => {
    const code = $("#sg-cta-html-0").textContent!;
    expect(code).toContain(
      '<button type="button" class="acme-btn acme-btn--primary">Primary</button>',
    );
    expect(html).toContain(
      "&lt;button type=&quot;button&quot; class=&quot;acme-btn acme-btn--primary&quot;&gt;",
    );
    const frame = $("#sg-cta iframe.sg-frame");
    const doc = frame.getAttribute("srcdoc")!;
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    expect(doc).toContain(
      '<link rel="stylesheet" href="../acme-health.css"><link rel="stylesheet" href="states.css">',
    );
    expect(frame.getAttribute("loading")).toBe("lazy");
  });

  it("neutralises autofocus and missing images in live examples only", () => {
    expect(neutraliseAutofocus('<button autofocus>x</button><input autofocus="">')).toBe(
      '<button data-sg-autofocus>x</button><input data-sg-autofocus="">',
    );
    expect(placeholderImages('<img src="logo.svg" alt="x"><img src="https://x/y.png">')).toMatch(
      /^<img src="data:image\/svg\+xml,[^"]+" alt="x"><img src="https:\/\/x\/y\.png">$/,
    );
    const modalFrames = $$("#sg-modals iframe").map((f) => f.getAttribute("srcdoc")!);
    expect(modalFrames.some((d) => / autofocus[\s>]/.test(d))).toBe(false);
    expect($("#sg-modals-html-0").textContent).toContain("autofocus");
  });

  it("shows forced states side by side", () => {
    const states = $$("#sg-cta .sg-state");
    expect(states.map((s) => s.querySelector("figcaption")!.textContent)).toEqual([
      "default",
      "hover",
      "focus",
    ]);
    expect(states[1].querySelector("iframe")!.getAttribute("data-sg-state")).toBe("hover");
    expect(states[1].querySelector("iframe")!.getAttribute("data-sg-state-target")).toBe(
      ".acme-btn",
    );
  });

  it("offers HTL for AEM in a tab", () => {
    const tabs = $$("#sg-cta [role=tab]").map((t) => t.textContent);
    expect(tabs).toEqual(["HTML", "HTL (AEM)"]);
    expect($("#sg-cta-htl").textContent).toContain("acme-btn--${properties.variant || 'primary'}");
  });

  it("shows token values and per-breakpoint overrides from the generated CSS", () => {
    const vars = collectVariables(pkg.files.filter((f) => f.path.endsWith(".css")));
    expect(vars.get("acme-font-size-h1")).toMatchObject({
      base: "1.75rem",
      overrides: [{ condition: "(min-width: 1024px)", value: "2.5rem" }],
    });
    const row = $$("#sg-tokens tr").find((tr) => tr.textContent!.includes("--acme-font-size-h1"))!;
    expect(row.textContent).toContain("1.75rem");
    expect(row.textContent).toContain("@media (min-width: 1024px) 2.5rem");
    expect($$("#sg-tokens h3").map((h) => h.textContent)).not.toContain("Extra values from Figma");
    expect(html).toContain('<link rel="stylesheet" href="../css/tokens.css">');
  });

  it("has viewport buttons per breakpoint and escapes the brand", () => {
    expect($$("[data-sg-viewport]").map((b) => b.getAttribute("data-sg-viewport"))).toEqual([
      "375",
      "768",
      "1280",
    ]);
    expect(viewportWidth({ id: "x", name: "x", minWidth: 1440 })).toBe(1440);
    const evil = generateStyleGuide(
      { ...project("mobile-first"), brandName: "<script>alert(1)</script>" },
      pkg.files,
    )[0].content;
    expect(evil).not.toContain("<script>alert(1)</script>");
    expect(evil).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("is deterministic", () => {
    expect(generateStyleGuide(project("mobile-first"), pkg.files)).toEqual(guide);
  });

  it("works with a user CSS file in the package", () => {
    const tree = project("mobile-first").scaffold;
    const withUser = generatePackage({
      ...project("mobile-first"),
      scaffold: addNode(tree, tree.id, createFile("mine.css")),
    });
    expect(() => generateStyleGuide(project("mobile-first"), withUser.files)).not.toThrow();
  });
});

describe("styleguide.js", () => {
  const script = readFileSync(
    path.join(process.cwd(), "src/templates/styleguide/styleguide.js"),
    "utf8",
  );
  function load() {
    const w = new JSDOM(html.replace('<script src="styleguide.js"></script>', ""), {
      runScripts: "outside-only",
      pretendToBeVisual: true,
    }).window;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(w.navigator, "clipboard", { value: { writeText }, configurable: true });
    w.eval(script);
    return {
      w,
      d: w.document,
      api: (w as unknown as { AuthorKitStyleGuide: Record<string, (...a: unknown[]) => unknown> })
        .AuthorKitStyleGuide,
      writeText,
    };
  }

  it("filters the sidebar and sections by search", () => {
    const { d, api } = load();
    api.filter("btn--tertiary");
    const visible = [...d.querySelectorAll(".sg-sidebar li")]
      .filter((li) => !(li as HTMLElement).hidden)
      .map((li) => li.textContent);
    expect(visible).toEqual(["CTA buttons"]);
    expect((d.getElementById("sg-header") as HTMLElement).hidden).toBe(true);
    api.filter("nothing-matches-this");
    expect((d.querySelector(".sg-no-results") as HTMLElement).hidden).toBe(false);
    api.filter("");
    expect((d.getElementById("sg-header") as HTMLElement).hidden).toBe(false);
  });

  it("copies class names and code", async () => {
    const { d, writeText } = load();
    (d.querySelector('#sg-cta [data-sg-copy="acme-btn"]') as HTMLElement).click();
    (d.querySelector('[data-sg-copy-from="sg-cta-html-0"]') as HTMLElement).click();
    await Promise.resolve();
    expect(writeText).toHaveBeenNthCalledWith(1, "acme-btn");
    expect(writeText.mock.calls[1][0]).toContain('class="acme-btn acme-btn--primary"');
  });

  it("switches viewport widths, leaving state grids alone", () => {
    const { d, api } = load();
    api.setViewport(375);
    const frame = d.querySelector("#sg-cta .sg-example iframe") as HTMLIFrameElement;
    expect(frame.style.width).toBe("375px");
    expect((d.querySelector("#sg-cta .sg-state iframe") as HTMLIFrameElement).style.width).toBe("");
    expect(d.querySelector('[data-sg-viewport="375"]')!.getAttribute("aria-pressed")).toBe("true");
  });

  it("switches tabs", () => {
    const { d } = load();
    const [htmlTab, htlTab] = [...d.querySelectorAll("#sg-cta [role=tab]")] as HTMLElement[];
    htlTab.click();
    expect(htlTab.getAttribute("aria-selected")).toBe("true");
    expect(htmlTab.getAttribute("aria-selected")).toBe("false");
    expect((d.getElementById(htlTab.getAttribute("aria-controls")!) as HTMLElement).hidden).toBe(
      false,
    );
    expect((d.getElementById(htmlTab.getAttribute("aria-controls")!) as HTMLElement).hidden).toBe(
      true,
    );
  });

  it("inspect mode shows an element's classes and their purposes", () => {
    const { d, api } = load();
    const el = d.createElement("button");
    el.className = "acme-btn acme-btn--primary";
    d.body.appendChild(el);
    api.inspect(el);
    const inspector = d.querySelector(".sg-inspector") as HTMLElement;
    expect(inspector.hidden).toBe(false);
    expect(inspector.textContent).toContain(".acme-btn--primary");
    expect(inspector.textContent).toContain(
      "CTA buttons: Filled brand-color button for the main action.",
    );
    expect(el.style.outline).toContain("dashed");
  });
});
