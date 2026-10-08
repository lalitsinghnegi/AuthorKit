import { describe, expect, it } from "vitest";
import type { FigmaFile, FigmaNode, FigmaVariablesResponse } from "@/lib/figma/types";
import type { DesignToken } from "@/lib/model";
import { TokenFile } from "@/lib/model";
import file from "@/test/fixtures/figma/file.json";
import variables from "@/test/fixtures/figma/variables.json";
import {
  MISSING_NOTE,
  UNMAPPED_REASON,
  colorToCss,
  extractTokens,
  letterSpacingEm,
  lineHeightRatio,
  mergeTokens,
  pxToRem,
  shadowToCss,
  suggestColorName,
  textRole,
  validateTokenValue,
  withName,
  type ExtractedToken,
} from "./index";

const fixture = file as FigmaFile;
const vars = (variables as FigmaVariablesResponse).meta;
const extract = (withVariables = false, roots: FigmaNode[] = [fixture.document]) =>
  extractTokens([
    { fileKey: "K", roots, styles: fixture.styles, variables: withVariables ? vars : undefined },
  ]);
const byName = (tokens: ExtractedToken[], name: string) => tokens.find((t) => t.name === name);

/** A tiny Figma tree for targeted cases. */
const frame = (children: FigmaNode[], extra: Partial<FigmaNode> = {}): FigmaNode => ({
  id: "9:0",
  name: "Frame",
  type: "FRAME",
  children,
  ...extra,
});
const rect = (
  id: string,
  name: string,
  rgb: [number, number, number],
  extra: Partial<FigmaNode> = {},
): FigmaNode => ({
  id,
  name,
  type: "RECTANGLE",
  fills: [{ type: "SOLID", color: { r: rgb[0], g: rgb[1], b: rgb[2], a: 1 } }],
  ...extra,
});

describe("normalise", () => {
  it.each([
    [{ r: 0.5412, g: 0.0431, b: 0.3098, a: 1 }, 1, "#8a0b4f"],
    [{ r: 1, g: 1, b: 1, a: 1 }, 1, "#fff"],
    [{ r: 0.2, g: 0.4, b: 0.6, a: 1 }, 1, "#369"],
    [{ r: 0, g: 0, b: 0, a: 0.6 }, 1, "rgb(0 0 0 / 60%)"],
    [{ r: 0, g: 0, b: 0, a: 1 }, 0.5, "rgb(0 0 0 / 50%)"],
    [{ r: 1.2, g: -0.1, b: 0.5, a: 1 }, 1, "#ff0080"],
  ])("colorToCss(%j, %s) → %s", (color, opacity, css) => {
    expect(colorToCss(color, opacity)).toBe(css);
  });

  it("converts sizes, line height, letter spacing and shadows", () => {
    expect(pxToRem(40)).toBe("2.5rem");
    expect(pxToRem(18)).toBe("1.125rem");
    expect(pxToRem(0)).toBe("0");
    expect(lineHeightRatio(48, 40)).toBe("1.2");
    expect(lineHeightRatio(24, 16)).toBe("1.5");
    expect(letterSpacingEm(-0.4, 40)).toBe("-0.01em");
    expect(letterSpacingEm(0, 16)).toBe("0");
    expect(
      shadowToCss({
        type: "DROP_SHADOW",
        color: { r: 0, g: 0, b: 0, a: 0.12 },
        offset: { x: 0, y: 4 },
        radius: 12,
        spread: 2,
      }),
    ).toBe("0 4px 12px 2px rgb(0 0 0 / 12%)");
  });
});

describe("naming", () => {
  it.each([
    ["Brand/Primary", "color-primary"],
    ["Brand/Primary Dark", "color-primary-hover"],
    ["Primary / Hover", "color-primary-hover"],
    ["On Primary", "color-on-primary"],
    ["Neutral/Text", "color-text"],
    ["Text / Muted", "color-text-muted"],
    ["Link", "color-link"],
    ["Link hover", "color-link-hover"],
    ["Neutral/Surface", "color-surface"],
    ["Page background", "color-background"],
    ["Divider", "color-border"],
    ["Focus ring", "color-focus"],
    ["ISI / Background", "color-isi-background"],
    ["Footer", "color-footer-background"],
    ["Header / Desktop", "color-header-background"],
    ["Header link", "color-link"],
    ["Teal accent", "color-teal-accent"],
  ])("%s → %s", (name, expected) => {
    expect(suggestColorName(name)).toBe(expected);
  });

  it.each([
    ["Heading/H1", { kind: "heading", level: 1 }],
    ["Heading 3", { kind: "heading", level: 3 }],
    ["Desktop/h-2", { kind: "heading", level: 2 }],
    ["Body/Regular", { kind: "body" }],
    ["Caption", { kind: "small" }],
    ["Eyebrow", null],
  ])("text role of %s", (name, role) => {
    expect(textRole(name)).toEqual(role);
  });
});

describe("extractTokens on the fixture file", () => {
  it("matches the snapshot (styles only)", () => {
    expect(extract().tokens).toMatchSnapshot();
  });

  it("maps styles to template tokens", () => {
    const { tokens } = extract();
    expect(byName(tokens, "color-primary")).toMatchObject({
      value: "#8a0b4f",
      source: { fileKey: "K", nodeId: "1:10", nodeName: "Primary" },
      meta: {
        origin: "style",
        figmaName: "Brand/Primary",
        sourceKey: "style:k-primary",
        mapped: true,
        confidence: "high",
      },
    });
    expect(byName(tokens, "font-size-h1")?.value).toBe("2.5rem");
    expect(byName(tokens, "font-size-h2")?.value).toBe("2rem");
    expect(byName(tokens, "font-size-base")?.value).toBe("1rem");
    expect(byName(tokens, "line-height-heading")?.value).toBe("1.2");
    expect(byName(tokens, "letter-spacing-heading")?.value).toBe("-0.01em");
    expect(byName(tokens, "font-family-heading")?.value).toMatch(/^"Inter", system-ui/);
  });

  it("maps spacing to the scale, radius to pill, strokes to border width", () => {
    const { tokens } = extract();
    // 10px (mobile button padding, used twice) beats 8px (once) at the 8px step; footer padding adds 48px.
    expect(tokens.filter((t) => t.type === "spacing").map((t) => [t.name, t.value])).toEqual([
      ["space-2", "0.625rem"],
      ["space-3", "0.75rem"],
      ["space-4", "1rem"],
      ["space-5", "1.5rem"],
      ["space-6", "2rem"],
      ["space-7", "3rem"],
    ]);
    expect(byName(tokens, "radius-pill")?.value).toBe("999px");
    expect(byName(tokens, "border-width")?.value).toBe("2px");
  });

  it("flags one-off colors and unmapped names as low confidence", () => {
    const accent = byName(extract().tokens, "color-one-off-accent")!;
    expect(accent.meta).toMatchObject({ confidence: "low", mapped: false, usage: 1 });
    expect(accent.meta.reasons).toEqual([
      "Used only once and not saved as a Figma style or variable",
      UNMAPPED_REASON,
    ]);
  });

  it("prefers variables over styles and scans", () => {
    const { tokens } = extract(true);
    expect(byName(tokens, "color-primary")?.meta).toMatchObject({
      origin: "variable",
      sourceKey: "var:V:1",
      usage: 2,
    });
    expect(byName(tokens, "space-4")?.meta).toMatchObject({
      origin: "variable",
      figmaName: "space/4",
    });
    expect(byName(tokens, "radius-pill")?.meta.origin).toBe("variable");
  });

  it("only scans the linked frames", () => {
    const header = (fixture.document.children![1].children as FigmaNode[]).find(
      (n) => n.id === "2:1",
    )!;
    const { tokens } = extract(false, [header]);
    // The header has text but no text styles, so body typography is estimated from it.
    expect(tokens.map((t) => t.name)).toEqual([
      "color-header-background",
      "font-family-base",
      "font-size-base",
      "font-weight-regular",
      "line-height-body",
      "space-4",
      "space-5",
      "space-6",
      "shadow-sm",
    ]);
    expect(tokens.some((t) => t.name.startsWith("color-primary"))).toBe(false);
  });

  it("is deterministic", () => {
    expect(extract(true)).toEqual(extract(true));
  });
});

describe("extractTokens edge cases", () => {
  it("resolves conflicting values: most trusted wins, others become -alt", () => {
    const styles = { "S:a": { key: "ka", name: "Brand/Primary", styleType: "FILL" } };
    const root = frame([
      rect("1:1", "Swatch", [1, 0, 0], { styles: { fill: "S:a" } }),
      rect("1:2", "Primary", [0, 0, 1]),
      rect("1:3", "Primary", [0, 0, 1]),
    ]);
    const { tokens } = extractTokens([{ fileKey: "K", roots: [root], styles }]);
    expect(byName(tokens, "color-primary")).toMatchObject({
      value: "#f00",
      meta: { origin: "style", confidence: "low" },
    });
    expect(byName(tokens, "color-primary")!.meta.reasons[0]).toMatch(
      /2 different values for color-primary; #f00 was chosen/,
    );
    expect(byName(tokens, "color-primary-alt")).toMatchObject({
      value: "#00f",
      meta: { mapped: false, usage: 2 },
    });
  });

  it("flags spacing far from its scale step and lists the others", () => {
    const root = frame([
      frame([], { id: "1:1", layoutMode: "VERTICAL", itemSpacing: 20 }),
      frame([], { id: "1:2", layoutMode: "VERTICAL", itemSpacing: 20 }),
      frame([], { id: "1:3", layoutMode: "VERTICAL", itemSpacing: 18 }),
      frame([], { id: "1:4", layoutMode: "VERTICAL", itemSpacing: 100 }),
    ]);
    const tokens = extractTokens([{ fileKey: "K", roots: [root], styles: {} }]).tokens;
    // 20px is equally close to 16 and 24; ties go to the smaller step. 18px lands there too.
    expect(byName(tokens, "space-4")).toMatchObject({
      value: "1.25rem",
      meta: { usage: 2, confidence: "low" },
    });
    expect(byName(tokens, "space-4")?.meta.reasons).toEqual([
      "Also found 18px near this step; 20px was chosen",
    ]);
    expect(byName(tokens, "space-8")?.meta.reasons).toEqual([
      "100px is far from the 64px step it was matched to",
    ]);
  });

  it("estimates typography from text layers when there are no text styles", () => {
    const text = (id: string, size: number) => ({
      id,
      name: "Text",
      type: "TEXT",
      style: { fontFamily: "Lato", fontWeight: 400, fontSize: size, lineHeightPx: size * 1.5 },
    });
    const root = frame([text("1:1", 16), text("1:2", 16), text("1:3", 36), text("1:4", 24)]);
    const result = extractTokens([{ fileKey: "K", roots: [root], styles: {} }]);
    expect(result.notes).toContain(
      "No Figma text styles were found, so typography was estimated from text layers.",
    );
    expect(byName(result.tokens, "font-size-base")?.value).toBe("1rem");
    expect(byName(result.tokens, "font-size-h1")?.value).toBe("2.25rem");
    expect(byName(result.tokens, "font-size-h2")?.value).toBe("1.5rem");
    expect(byName(result.tokens, "font-size-h1")?.meta.confidence).toBe("low");
  });

  it("flags poor contrast on the foreground token", () => {
    const styles = {
      "S:p": { key: "kp", name: "Primary", styleType: "FILL" },
      "S:o": { key: "ko", name: "On Primary", styleType: "FILL" },
    };
    const root = frame([
      rect("1:1", "a", [1, 0.85, 0.9], { styles: { fill: "S:p" } }),
      rect("1:2", "b", [1, 1, 1], { styles: { fill: "S:o" } }),
    ]);
    const tokens = extractTokens([{ fileKey: "K", roots: [root], styles }]).tokens;
    expect(byName(tokens, "color-on-primary")?.meta.reasons.join()).toMatch(
      /color-on-primary on color-primary has contrast 1\.\d+:1 \(needs 4\.5:1\)/,
    );
  });

  it("skips hidden layers and alias variables", () => {
    const root = frame([rect("1:1", "Teal", [0, 0.5, 0.5], { visible: false })]);
    const aliasVars = {
      variableCollections: { C: { id: "C", name: "c", defaultModeId: "m", modes: [] } },
      variables: {
        V: {
          id: "V",
          name: "color/alias",
          resolvedType: "COLOR" as const,
          variableCollectionId: "C",
          valuesByMode: { m: { type: "VARIABLE_ALIAS", id: "X" } },
        },
      },
    };
    const result = extractTokens([
      { fileKey: "K", roots: [root], styles: {}, variables: aliasVars },
    ]);
    expect(result.tokens).toEqual([]);
    expect(result.notes).toEqual(['Variable "color/alias" is an alias and was skipped.']);
  });
});

describe("mergeTokens", () => {
  let n = 0;
  const id = () => `id-${++n}`;
  const extracted = () => extract().tokens;
  const first = () => mergeTokens([], extracted(), id).tokens;
  const set = (tokens: DesignToken[], name: string, patch: Partial<DesignToken>) =>
    tokens.map((t) => (t.name === name ? { ...t, ...patch } : t));
  const withValue = (tokens: ExtractedToken[], name: string, value: string) =>
    tokens.map((t) => (t.name === name ? { ...t, value } : t));

  it("adds everything as 'auto' the first time, and the result is a valid token file", () => {
    const { tokens, summary } = mergeTokens([], extracted(), id);
    expect(summary).toEqual({ added: extracted().length, changed: 0, missing: 0, unchanged: 0 });
    expect(tokens.every((t) => t.status === "auto" && t.value === t.originalValue)).toBe(true);
    expect(TokenFile.safeParse({ schemaVersion: 1, tokens }).success).toBe(true);
  });

  it("keeps accepted tokens when unchanged and sends them back to review when Figma changes", () => {
    const saved = set(first(), "color-primary", { status: "accepted" });
    const same = mergeTokens(saved, extracted(), id);
    expect(same.summary).toMatchObject({ added: 0, changed: 0, unchanged: saved.length });
    expect(same.tokens.find((t) => t.name === "color-primary")).toMatchObject({
      status: "accepted",
    });

    const changed = mergeTokens(saved, withValue(extracted(), "color-primary", "#123456"), id);
    expect(changed.tokens.find((t) => t.name === "color-primary")).toMatchObject({
      status: "auto",
      value: "#123456",
      originalValue: "#123456",
      meta: { note: "Changed in Figma from #8a0b4f to #123456; review again" },
    });
  });

  it("keeps overrides, exclusions and renames", () => {
    let saved = set(first(), "color-primary", { status: "overridden", value: "#000000" });
    saved = set(saved, "color-one-off-accent", { status: "excluded" });
    saved = set(saved, "color-link", { name: "color-link-hover" });
    const { tokens } = mergeTokens(saved, withValue(extracted(), "color-primary", "#123456"), id);
    expect(tokens.find((t) => t.meta?.sourceKey === "style:k-primary")).toMatchObject({
      status: "overridden",
      value: "#000000",
      originalValue: "#123456",
      meta: { note: "Figma value changed from #8a0b4f to #123456; your override is kept" },
    });
    expect(tokens.find((t) => t.meta?.figmaName === "One-off accent")?.status).toBe("excluded");
    expect(tokens.find((t) => t.meta?.sourceKey === "scan:color:#8a0b4f")?.name).toBe(
      "color-link-hover",
    );
  });

  it("marks tokens Figma no longer has, and leaves hand-made tokens alone", () => {
    const manual: DesignToken = {
      id: "m",
      name: "color-extra",
      type: "color",
      value: "#111111",
      originalValue: "",
      status: "accepted",
    };
    const saved = [...first(), manual];
    const { tokens, summary } = mergeTokens(
      saved,
      extracted().filter((t) => t.name !== "color-surface"),
      id,
    );
    expect(summary.missing).toBe(1);
    expect(tokens.find((t) => t.name === "color-surface")?.meta).toMatchObject({
      missing: true,
      note: MISSING_NOTE,
    });
    expect(tokens).toContainEqual(manual);
  });

  it("renames a new token that collides with an accepted one", () => {
    const saved = set(first(), "color-one-off-accent", { name: "color-focus", status: "accepted" });
    const incoming = extracted().map((t) =>
      t.name === "color-surface"
        ? { ...t, name: "color-focus", meta: { ...t.meta, sourceKey: "style:new" } }
        : t,
    );
    const { tokens } = mergeTokens(saved, incoming, id);
    expect(tokens.find((t) => t.meta?.sourceKey === "style:new")?.name).toBe("color-focus-alt");
    expect(TokenFile.safeParse({ schemaVersion: 1, tokens }).success).toBe(true);
  });

  it("withName recomputes mapping and confidence", () => {
    const meta = byName(extract().tokens, "color-one-off-accent")!.meta;
    const renamed = withName("color-surface", meta);
    expect(renamed).toMatchObject({ mapped: true, confidence: "low" });
    expect(renamed.reasons).not.toContain(UNMAPPED_REASON);
    expect(withName("color-surface", { ...meta, reasons: [UNMAPPED_REASON] })).toMatchObject({
      mapped: true,
      confidence: "high",
      reasons: [],
    });
  });
});

describe("validateTokenValue", () => {
  it.each([
    ["color", "#0b4f8a"],
    ["color", "rgb(11 79 138 / 50%)"],
    ["color", "transparent"],
    ["fontSize", "1.125rem"],
    ["spacing", "0"],
    ["letterSpacing", "-0.01em"],
    ["lineHeight", "1.5"],
    ["fontWeight", "700"],
    ["fontFamily", '"Inter", system-ui, sans-serif'],
    ["shadow", "0 4px 12px rgb(0 0 0 / 12%), 0 1px 2px #000"],
    ["zIndex", "100"],
    ["duration", "150ms"],
  ] as const)("accepts %s %j", (type, value) => {
    expect(validateTokenValue(type, value)).toBeNull();
  });

  it.each([
    ["color", "red; } body { display: none", /cannot contain/],
    ["color", "#12345", /Use a color/],
    ["fontSize", "16", /Use a length/],
    ["spacing", "calc(1px)", /Use a length/],
    ["fontWeight", "heavy", /weight/],
    ["fontFamily", "Inter /* x */", /cannot contain/],
    ["shadow", "0 0 0 <script>", /cannot contain/],
    ["zIndex", "1.5", /whole number/],
    ["duration", "fast", /duration/],
    ["color", "  ", /Enter a value/],
  ] as const)("rejects %s %j", (type, value, error) => {
    expect(validateTokenValue(type, value)).toMatch(error);
  });
});
