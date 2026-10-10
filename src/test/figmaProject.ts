import type { FigmaFile, FigmaNode } from "@/lib/figma/types";
import type { DesignToken, Project } from "@/lib/model";
import { computeResponsive } from "@/lib/responsive";
import { COMPONENT_PRESET } from "@/lib/scaffold";
import { extractTokens, mergeTokens } from "@/lib/tokens";
import file from "@/test/fixtures/figma/file.json";
import { generatePackage, type GenerationInputs } from "@/lib/generator/generate";

/**
 * A complete project whose values come from the Figma fixture through the
 * real extraction code: tokens extracted and reviewed, frames measured per
 * breakpoint. Everything below is generated from it.
 */
const fixture = file as FigmaFile;
const find = (n: FigmaNode, id: string): FigmaNode | null =>
  n.id === id ? n : ((n.children ?? []).map((c) => find(c, id)).find(Boolean) ?? null);
const node = (id: string) => find(fixture.document, id)!;

export function project(approach: Project["approach"]): Project {
  return {
    schemaVersion: 1,
    id: "3f1c2a9e-8b7d-4c6e-9f1a-2b3c4d5e6f70",
    name: "Spring launch",
    brandName: "Acme Health",
    prefix: "acme",
    approach,
    breakpoints: {
      breakpoints: [
        { id: "m", name: "mobile", maxWidth: 767 },
        { id: "t", name: "tablet", minWidth: 768, maxWidth: 1023 },
        { id: "d", name: "desktop", minWidth: 1024 },
      ],
    },
    scaffold: { ...COMPONENT_PRESET.tree, name: "acme-health" },
    figmaLinks: [],
    createdAt: "2026-10-07T12:00:00.000Z",
    updatedAt: "2026-10-07T12:00:00.000Z",
  };
}

export function inputs(approach: Project["approach"]): GenerationInputs {
  let id = 0;
  const extracted = extractTokens([
    { fileKey: "K", roots: [node("1:1"), node("1:2"), node("3:1")], styles: fixture.styles },
  ]).tokens;
  // Review: accept everything, override one, exclude one, add one extra by hand.
  const tokens: DesignToken[] = [
    ...mergeTokens([], extracted, () => `tok-${++id}`).tokens.map((t): DesignToken =>
      t.name === "color-primary-hover"
        ? { ...t, value: "#5a0632", status: "overridden" }
        : t.name === "color-surface"
          ? { ...t, status: "excluded" }
          : { ...t, status: "accepted" },
    ),
    {
      id: "tok-extra",
      name: "color-accent",
      type: "color",
      value: "#009980",
      originalValue: "",
      status: "accepted",
    },
  ];
  const p = project(approach);
  const responsive = computeResponsive({
    breakpoints: p.breakpoints.breakpoints,
    approach,
    styles: fixture.styles,
    frames: [
      { target: "header", linkId: "a", node: node("2:1"), breakpointId: "d" },
      { target: "header", linkId: "b", node: node("2:2"), breakpointId: "m" },
      { target: "footer", linkId: "c", node: node("5:1"), breakpointId: "d" },
      { target: "footer", linkId: "d", node: node("5:2"), breakpointId: "m" },
      { target: "cta", linkId: "e", node: node("3:1"), breakpointId: "d" },
      { target: "typography", linkId: "f", node: node("1:2"), breakpointId: "d" },
      { target: "typography", linkId: "g", node: node("1:3"), breakpointId: "m" },
    ],
  });
  return { tokens, responsive };
}

export const generate = (approach: Project["approach"]) =>
  generatePackage(project(approach), inputs(approach));
