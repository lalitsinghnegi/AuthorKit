import { describe, expect, it } from "vitest";
import type { FigmaFile, FigmaNode } from "@/lib/figma/types";
import type { FrameMapping } from "@/lib/model";
import file from "@/test/fixtures/figma/file.json";
import {
  DEFAULT_PATTERNS,
  candidateFrames,
  classify,
  effectivePatterns,
  isAllowedImageUrl,
  isAmbiguous,
  mergeMappings,
  safeImages,
  scoreKeyword,
  suggestFromPatterns,
} from "./index";

const patterns = effectivePatterns(undefined);
const findNode = (node: FigmaNode, id: string): FigmaNode | null =>
  node.id === id ? node : ((node.children ?? []).map((c) => findNode(c, id)).find(Boolean) ?? null);
const homePage = findNode((file as FigmaFile).document, "4:1")!;

describe("keyword scoring", () => {
  it.each([
    ["Header", "header", 3],
    ["header", "Header", 3],
    ["Header / Desktop", "header", 2],
    ["Site header", "header", 1],
    ["Important Safety Information", "important safety information", 3],
    ["Nav bar / Mobile", "nav bar", 2],
    ["Visible area", "isi", 0],
    ["Headers", "header", 0],
    ["Anything", "", 0],
  ])("%j vs %j → %i", (name, keyword, score) => {
    expect(scoreKeyword(name, keyword)).toBe(score);
  });
});

describe("classify", () => {
  it("picks the highest-scoring component", () => {
    expect(classify("Footer", patterns)).toMatchObject({
      kind: "match",
      componentId: "footer",
      score: 3,
    });
    expect(classify("CTA band", patterns)).toMatchObject({
      kind: "match",
      componentId: "cta",
      score: 2,
    });
    expect(classify("Accordion / FAQ", patterns)).toMatchObject({
      kind: "match",
      componentId: "accordion",
    });
  });

  it("reports ties as ambiguous and misses as none", () => {
    const result = classify("Header / Footer spacer", patterns);
    expect(result.kind).toBe("match"); // header starts the name (2) beats footer (1)
    expect(classify("Footer Header", { ...patterns, header: ["footer header"] })).toMatchObject({
      kind: "match",
      componentId: "header",
    });
    const tie = classify("Modal button", {
      ...patterns,
      cta: ["modal button"],
      modals: ["modal button"],
    });
    expect(tie).toMatchObject({ kind: "ambiguous" });
    expect(classify("Frame 12", patterns)).toEqual({ kind: "none" });
  });

  it("merges saved patterns over defaults", () => {
    const merged = effectivePatterns({ footer: ["Legal Bar", " legal bar "] });
    expect(merged.footer).toEqual(["legal bar"]);
    expect(merged.header).toEqual(DEFAULT_PATTERNS.header);
  });
});

describe("candidate frames", () => {
  it("lists the linked node and frame-like children to depth 2, in order", () => {
    const frames = candidateFrames(homePage);
    expect(frames.map((f) => f.nodeName)).toEqual([
      "Home / Desktop",
      "Header",
      "Nav",
      "Hero",
      "Button / Primary",
      "CTA band",
      "Frame 12",
      "Question 1",
      "Question 2",
      "Important Safety Information",
      "Footer",
      "Header / Footer spacer",
    ]);
    expect(frames[1]).toMatchObject({
      nodeId: "4:10",
      path: "Home / Desktop › Header",
      width: 1440,
      height: 80,
      childNames: ["Logo", "Nav"],
    });
  });

  it("suggests from names with confidence and reasons", () => {
    const byName = Object.fromEntries(
      suggestFromPatterns(candidateFrames(homePage), patterns).map((m) => [m.nodeName, m]),
    );
    expect(byName["Header"]).toMatchObject({
      componentId: "header",
      confidence: "high",
      reason: "Name is “header”",
      state: "suggested",
      source: "pattern",
    });
    expect(byName["Button / Primary"]).toMatchObject({ componentId: "cta", confidence: "high" });
    expect(byName["Important Safety Information"]).toMatchObject({
      componentId: "isi",
      confidence: "high",
    });
    expect(byName["Frame 12"]).toMatchObject({
      componentId: null,
      confidence: "low",
      reason: "No name pattern matches",
    });
    expect(isAmbiguous(byName["Frame 12"])).toBe(true);
    expect(isAmbiguous(byName["Header"])).toBe(false);
  });
});

describe("mergeMappings", () => {
  const m = (nodeId: string, patch: Partial<FrameMapping> = {}): FrameMapping => ({
    nodeId,
    nodeName: `Frame ${nodeId}`,
    path: `Page › Frame ${nodeId}`,
    componentId: null,
    state: "suggested",
    source: "pattern",
    ...patch,
  });

  it("keeps decisions, refreshes names, adds new frames and marks missing ones", () => {
    const saved = [
      m("1:1", { state: "confirmed", componentId: "header", source: "manual" }),
      m("1:2", { state: "ignored" }),
      m("1:3", { componentId: "footer" }),
      m("1:4", { state: "confirmed", componentId: "cta" }),
      m("1:5", { source: "ai", componentId: "accordion", reason: "Looks like FAQ" }),
    ];
    const detected = [
      m("1:1", { nodeName: "Renamed header", componentId: "footer" }),
      m("1:2", { componentId: "cta" }),
      m("1:3", { componentId: "cta" }),
      m("1:5"),
      m("1:6", { componentId: "isi" }),
    ];
    const merged = mergeMappings(saved, detected);
    expect(merged.map((x) => [x.nodeId, x.state, x.componentId, x.missing ?? false])).toEqual([
      ["1:1", "confirmed", "header", false],
      ["1:2", "ignored", null, false],
      ["1:3", "suggested", "cta", false],
      ["1:5", "suggested", "accordion", false],
      ["1:6", "suggested", "isi", false],
      ["1:4", "confirmed", "cta", true],
    ]);
    expect(merged[0].nodeName).toBe("Renamed header");
  });
});

describe("image allowlist", () => {
  it.each([
    ["https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/a.png", true],
    ["https://s3-alpha.figma.com/img/a.png", true],
    ["http://figma-alpha-api.s3.us-west-2.amazonaws.com/images/a.png", false],
    ["https://evil.com/a.png", false],
    ["https://figma.com.evil.com/a.png", false],
    ["https://user:pw@figma.com/a.png", false],
    ["javascript:alert(1)", false],
    ["", false],
  ])("%s → %s", (url, ok) => {
    expect(isAllowedImageUrl(url)).toBe(ok);
  });

  it("drops disallowed and null entries", () => {
    expect(
      safeImages({
        "1:1": "https://s3-alpha.figma.com/a.png",
        "1:2": null,
        "1:3": "https://evil.com/x.png",
      }),
    ).toEqual({
      "1:1": "https://s3-alpha.figma.com/a.png",
    });
  });
});
