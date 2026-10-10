import { describe, expect, it } from "vitest";
import type { FigmaFile, FigmaNode } from "@/lib/figma/types";
import type { FrameMapping } from "@/lib/model";
import file from "@/test/fixtures/figma/file.json";
import {
  DEFAULT_PATTERNS,
  candidateFrames,
  classify,
  effectivePatterns,
  confirmFromPatterns,
  isAllowedImageUrl,
  mergeMappings,
  safeImages,
  scoreKeyword,
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
    expect(frames[1]).toEqual({
      nodeId: "4:10",
      nodeName: "Header",
      path: "Home / Desktop › Header",
    });
  });

  it("confirms only frames whose name clearly names one component", () => {
    const confirmed = confirmFromPatterns(candidateFrames(homePage), patterns);
    const byName = Object.fromEntries(confirmed.map((m) => [m.nodeName, m]));
    expect(byName["Header"]).toEqual({
      nodeId: "4:10",
      nodeName: "Header",
      path: "Home / Desktop › Header",
      componentId: "header",
      source: "pattern",
      reason: "Name is “header”",
    });
    expect(byName["Button / Primary"]).toMatchObject({ componentId: "cta" });
    expect(byName["Important Safety Information"]).toMatchObject({ componentId: "isi" });
    // A name that starts with a keyword counts as clear, even when it mentions another one.
    expect(byName["Header / Footer spacer"]).toMatchObject({
      componentId: "header",
      reason: "Name starts with “header”",
    });
    expect(byName["Frame 12"]).toBeUndefined();
  });

  it("leaves out weak and ambiguous matches", () => {
    const frame = (nodeName: string) => ({ nodeId: "1:1", nodeName, path: nodeName });
    expect(classify("Promo header strip", patterns)).toMatchObject({ kind: "match", score: 1 });
    expect(confirmFromPatterns([frame("Promo header strip")], patterns)).toEqual([]);
    const tied = { ...patterns, cta: ["modal button"], modals: ["modal button"] };
    expect(confirmFromPatterns([frame("Modal button")], tied)).toEqual([]);
  });
});

describe("mergeMappings", () => {
  const frame = (nodeId: string, nodeName = `Frame ${nodeId}`) => ({
    nodeId,
    nodeName,
    path: `Page › ${nodeName}`,
  });
  const m = (nodeId: string, patch: Partial<FrameMapping> = {}): FrameMapping => ({
    ...frame(nodeId),
    componentId: "cta",
    source: "pattern",
    ...patch,
  });

  it("keeps saved components, refreshes names, adds new frames and marks missing ones", () => {
    const saved = [
      m("1:1", { componentId: "header", source: "manual" }),
      m("1:2", { componentId: "footer", source: "manual" }),
      m("1:4", { componentId: "cta" }),
    ];
    // 1:2 no longer matches a name pattern but still exists, so it is kept as is.
    const frames = [frame("1:1", "Renamed header"), frame("1:2"), frame("1:3"), frame("1:6")];
    const detected = [m("1:1", { componentId: "footer" }), m("1:6", { componentId: "isi" })];
    const merged = mergeMappings(saved, frames, detected);
    expect(merged.map((x) => [x.nodeId, x.componentId, x.source, x.missing ?? false])).toEqual([
      ["1:1", "header", "manual", false],
      ["1:2", "footer", "manual", false],
      ["1:6", "isi", "pattern", false],
      ["1:4", "cta", "pattern", true],
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
