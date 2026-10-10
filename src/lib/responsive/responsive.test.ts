import { describe, expect, it } from "vitest";
import type { FigmaFile, FigmaNode } from "@/lib/figma/types";
import type { Breakpoint, Project } from "@/lib/model";
import { ResponsiveFile } from "@/lib/model";
import file from "@/test/fixtures/figma/file.json";
import {
  SPECS,
  clampCss,
  collectFrameRefs,
  computeResponsive,
  fluidRange,
  readTypography,
  renderResponsiveCss,
  type SourceFrame,
} from "./index";

const fixture = file as FigmaFile;
const find = (n: FigmaNode, id: string): FigmaNode | null =>
  n.id === id ? n : ((n.children ?? []).map((c) => find(c, id)).find(Boolean) ?? null);
const node = (id: string) => find(fixture.document, id)!;

const bps: Breakpoint[] = [
  { id: "m", name: "mobile", maxWidth: 767 },
  { id: "t", name: "tablet", minWidth: 768, maxWidth: 1023 },
  { id: "d", name: "desktop", minWidth: 1024 },
];
const src = (target: SourceFrame["target"], id: string, breakpointId?: string): SourceFrame => ({
  target,
  linkId: `link-${id}`,
  node: node(id),
  breakpointId,
});
const compute = (
  frames: SourceFrame[],
  approach: "mobile-first" | "desktop-first" = "mobile-first",
) => computeResponsive({ breakpoints: bps, approach, frames, styles: fixture.styles });
const css = (
  target: SourceFrame["target"],
  data: ReturnType<typeof compute>,
  approach: "mobile-first" | "desktop-first" = "mobile-first",
) =>
  renderResponsiveCss(
    target,
    target === "typography" ? data.typography! : data.components[target]!,
    {
      prefix: "acme",
      approach,
      breakpoints: bps,
    },
  );

describe("specs", () => {
  it("reads the header and detects drawer vs inline navigation", () => {
    expect(SPECS.header!(node("2:1"))).toMatchObject({
      "header-padding-x": { px: 32, scales: true },
      "header-gap": { px: 32, scales: true },
      "header-min-height": { px: 80, scales: true },
      "header-toggle-display": { keyword: "none" },
      "header-list-direction": { keyword: "row" },
    });
    expect(SPECS.header!(node("2:2"))).toMatchObject({
      "header-padding-x": { px: 16, scales: true },
      "header-toggle-display": { keyword: "inline-flex" },
      "header-nav-display": { keyword: "none" },
    });
  });

  it("reads footer direction, CTA button and typography", () => {
    expect(SPECS.footer!(node("5:1"))).toEqual({
      "footer-padding-y": { px: 48, scales: true },
      "footer-gap": { px: 32, scales: true },
      "footer-direction": { keyword: "row" },
    });
    expect(SPECS.footer!(node("5:2"))["footer-direction"]).toEqual({ keyword: "column" });
    expect(SPECS.cta!(node("3:2"))).toEqual({
      "btn-padding-y": { px: 10, scales: true },
      "btn-padding-x": { px: 20, scales: true },
      "btn-font-size": { px: 14, scales: true },
      "btn-radius": { px: 999, scales: false },
    });
    expect(readTypography(node("1:3"))).toEqual({
      "font-size-h1": { px: 28, scales: true },
      "font-size-h2": { px: 24, scales: true },
      "font-size-base": { px: 16, scales: true },
    });
  });

  it("returns nothing for frames without measurable structure", () => {
    expect(SPECS.cta!(node("1:1"))).toEqual({});
    expect(SPECS.modals!({ id: "1:1", name: "Modal", type: "FRAME" })).toEqual({});
  });
});

describe("fluid values", () => {
  it("uses the smallest and largest breakpoint starts", () => {
    expect(fluidRange(bps)).toEqual({ from: 320, to: 1024 });
    expect(
      fluidRange([
        { id: "a", name: "a", minWidth: 400 },
        { id: "b", name: "b", minWidth: 1440 },
      ]),
    ).toEqual({ from: 400, to: 1440 });
  });

  it("computes the clamp() line exactly", () => {
    // 24px at 320px → 32px at 1024px: slope 8/704 = 1.1364vw, intercept 24 - 0.011364*320 = 20.3636px
    expect(clampCss(24, 32, 320, 1024)).toBe("clamp(24px, 20.36px + 1.1364vw, 32px)");
    expect(clampCss(16, 16, 320, 1024)).toBe("16px");
    expect(clampCss(10, 40, 320, 400)).toBe("clamp(10px, -110px + 37.5vw, 40px)");
  });

  it("makes a single desktop frame the top of the range and keeps px and keywords fixed", () => {
    const data = compute([src("cta", "3:1", "d")]);
    const cta = data.components.cta!;
    expect(cta.mode).toBe("fluid");
    expect(cta.values.m["btn-padding-x"]).toEqual({
      value: "clamp(18px, 15.27px + 0.8523vw, 24px)",
      source: "fluid",
    });
    expect(cta.values.m["btn-radius"]).toEqual({ value: "999px", source: "inferred" });
    expect(cta.values.d["btn-radius"]).toEqual({ value: "999px", source: "frame" });
    expect(cta.notes[0]).toMatch(
      /Only one cta frame \(desktop\); sizes are fluid clamp\(\) estimates between 320px and 1024px/,
    );
    // Same value everywhere: base styles only, no media queries.
    expect(css("cta", data)).not.toContain("@media");
  });

  it("makes a single mobile frame the bottom of the range", () => {
    const value = compute([src("cta", "3:2", "m")]).components.cta!.values.d["btn-font-size"].value;
    expect(value).toBe("clamp(14px, 11.88px + 0.6629vw, 18.67px)");
  });
});

describe("per-breakpoint values", () => {
  const data = compute([
    src("header", "2:1", "d"),
    src("header", "2:2", "m"),
    src("footer", "5:1", "d"),
    src("footer", "5:2", "m"),
    src("typography", "1:2", "d"),
    src("typography", "1:3", "m"),
  ]);

  it("fills uncovered breakpoints from the nearest one and says so", () => {
    const header = data.components.header!;
    expect(header.mode).toBe("breakpoints");
    expect(header.values.t["header-padding-x"]).toEqual({ value: "16px", source: "inferred" });
    expect(header.values.d["header-padding-x"]).toEqual({ value: "32px", source: "frame" });
    expect(header.notes).toEqual([
      "No header frame for tablet; values were copied from the nearest breakpoint.",
    ]);
    expect(ResponsiveFile.safeParse(data).success).toBe(true);
  });

  it("mobile-first: base is mobile, one min-width query with only the changes", () => {
    expect(css("footer", data)).toBe(
      [
        "/* mobile (≤ 767px): base */",
        ".acme-footer {",
        "  --acme-footer-direction: column;",
        "  --acme-footer-gap: 24px;",
        "  --acme-footer-padding-y: 32px;",
        "}",
        "",
        "/* desktop (≥ 1024px) */",
        "@media (min-width: 1024px) {",
        "  .acme-footer {",
        "    --acme-footer-direction: row;",
        "    --acme-footer-gap: 32px;",
        "    --acme-footer-padding-y: 48px;",
        "  }",
        "}",
      ].join("\n"),
    );
    const typography = css("typography", data);
    expect(typography).toContain("  --acme-font-size-h1: 28px;");
    expect(typography).toMatch(
      /@media \(min-width: 1024px\) \{\n {2}:root \{\n {4}--acme-font-size-h1: 40px;\n {4}--acme-font-size-h2: 32px;\n {2}\}/,
    );
    // Body text is the same at both sizes, so it never appears in a query.
    expect(typography.match(/font-size-base/g)).toHaveLength(1);
  });

  it("desktop-first: base is desktop, max-width query from tablet down", () => {
    const desktopFirst = compute(
      [src("footer", "5:1", "d"), src("footer", "5:2", "m")],
      "desktop-first",
    );
    // Tablet copies the nearest measured breakpoint; on a tie the smaller one (mobile).
    const out = css("footer", desktopFirst, "desktop-first");
    expect(out).toMatch(
      /^\/\* desktop \(≥ 1024px\): base \*\/\n\.acme-footer \{\n {2}--acme-footer-direction: row;/,
    );
    expect(out).toContain("@media (max-width: 1023px)");
    expect(out).not.toContain("@media (max-width: 767px)");
  });

  it("reports conflicts and untagged links", () => {
    const result = compute([
      src("footer", "5:1", "d"),
      src("footer", "5:2", "d"),
      src("cta", "3:2"),
    ]);
    expect(result.components.footer!.notes).toEqual([
      "More than one footer frame for desktop: “Footer / Desktop” was used, “Footer / Mobile” was not.",
      expect.stringMatching(/^Only one footer frame/),
    ]);
    expect(result.components.cta!.frames[0]).toMatchObject({ breakpointId: "m", tagged: false });
    expect(result.components.cta!.notes[0]).toBe(
      "“CTA / Mobile” is on a link without a screen size, so it was used for mobile (the base breakpoint).",
    );
  });

  it("marks frames with nothing measurable", () => {
    const result = compute([src("modals", "4:17", "d")]); // a plain rectangle: no size, no layout
    expect(result.components.modals).toMatchObject({ mode: "none", values: {} });
  });
});

describe("collectFrameRefs", () => {
  it("uses confirmed mappings, global as typography, and component links", () => {
    const base = {
      url: "https://www.figma.com/design/AbCdEf1234567890XyZ012/x",
      fileKey: "AbCdEf1234567890XyZ012",
    };
    const project = {
      figmaLinks: [
        {
          ...base,
          id: "home",
          label: "Home",
          scope: "page",
          pageName: "Home",
          nodeId: "4:1",
          breakpointId: "d",
          mappings: [
            {
              nodeId: "4:10",
              nodeName: "Header",
              path: "",
              componentId: "header",
              source: "pattern",
            },
            {
              nodeId: "4:15",
              nodeName: "Footer",
              path: "",
              componentId: "footer",
              source: "pattern",
              missing: true,
            },
          ],
        },
        {
          ...base,
          id: "type",
          label: "Type",
          scope: "global",
          nodeId: "1:2",
          mappings: [
            {
              nodeId: "1:2",
              nodeName: "T",
              path: "",
              componentId: "global",
              source: "manual",
            },
          ],
        },
        {
          ...base,
          id: "btn",
          label: "Button",
          scope: "component",
          nodeId: "3:2",
          componentId: "cta",
          breakpointId: "m",
        },
      ],
    } as unknown as Project;
    expect(collectFrameRefs(project)).toEqual([
      {
        target: "header",
        linkId: "home",
        fileKey: base.fileKey,
        nodeId: "4:10",
        breakpointId: "d",
      },
      {
        target: "typography",
        linkId: "type",
        fileKey: base.fileKey,
        nodeId: "1:2",
        breakpointId: undefined,
      },
      { target: "cta", linkId: "btn", fileKey: base.fileKey, nodeId: "3:2", breakpointId: "m" },
    ]);
  });
});
