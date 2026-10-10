import { mediaQueries, sortBreakpoints } from "@/lib/breakpoints";
import { shortName } from "@/lib/figma/names";
import type { FigmaNode, FigmaStyleMeta } from "@/lib/figma/types";
import type {
  Breakpoint,
  CssTemplateId,
  ResponsiveEntry,
  ResponsiveFile,
  ResponsiveValue,
} from "@/lib/model";
import { TEMPLATE_DEFAULTS } from "@/lib/templates/defaults";
import { num } from "@/lib/tokens/normalize";
import { SPECS, readTypography, type Measured, type Measurements } from "./specs";

/** One mapped frame to read, with the breakpoint its link is tagged with (if any). */
export type SourceFrame = {
  target: CssTemplateId | "typography";
  linkId: string;
  node: FigmaNode;
  breakpointId?: string;
};

export type ComputeInput = {
  breakpoints: readonly Breakpoint[];
  approach: "mobile-first" | "desktop-first";
  frames: SourceFrame[];
  styles?: Record<string, FigmaStyleMeta>;
};

/** Estimated size of the other end of a fluid range, relative to the measured end. */
export const FLUID_RATIO = 0.75;
/** Viewport used for the small end when the smallest breakpoint has no min-width. */
export const FLUID_MIN_VIEWPORT = 320;

const isScalable = (m: Measured): m is { px: number; scales: true } =>
  !("keyword" in m) && m.scales && m.px !== 0;

const toCss = (m: Measured): string =>
  "keyword" in m ? m.keyword : m.px === 0 ? "0" : `${num(m.px, 2)}px`;

/** The viewport range fluid values scale across: smallest breakpoint start → largest breakpoint start. */
export function fluidRange(breakpoints: readonly Breakpoint[]): { from: number; to: number } {
  const sorted = sortBreakpoints(breakpoints);
  const from = sorted[0]?.minWidth ?? FLUID_MIN_VIEWPORT;
  const last = sorted[sorted.length - 1];
  const to = last?.minWidth ?? last?.maxWidth ?? 1440;
  return { from, to };
}

/**
 * clamp() that scales linearly from `minPx` at `from` to `maxPx` at `to` viewport width.
 * Example: 24→32px over 320→1024px → clamp(24px, 20.36px + 1.1364vw, 32px).
 */
export function clampCss(minPx: number, maxPx: number, from: number, to: number): string {
  const fmt = (px: number) => `${num(px, 2)}px`;
  if (to <= from || minPx === maxPx) return fmt(minPx);
  const slope = (maxPx - minPx) / (to - from);
  const intercept = minPx - slope * from;
  const sign = intercept < 0 ? "-" : "";
  return `clamp(${fmt(minPx)}, ${sign}${fmt(Math.abs(intercept))} + ${num(slope * 100, 4)}vw, ${fmt(maxPx)})`;
}

/**
 * A fluid value from one measurement. A frame for a large screen (min-width
 * at least the large-screen threshold) is the top of the range and the small
 * end is estimated at FLUID_RATIO; otherwise the frame is the bottom.
 */
export function fluidValue(
  m: Measured,
  frameBreakpoint: Breakpoint | undefined,
  range: { from: number; to: number },
): string {
  if (!isScalable(m)) return toCss(m);
  const large = (frameBreakpoint?.minWidth ?? 0) >= TEMPLATE_DEFAULTS.largeScreen.minWidth;
  const [min, max] = large ? [m.px * FLUID_RATIO, m.px] : [m.px, m.px / FLUID_RATIO];
  return clampCss(min, max, range.from, range.to);
}

function measure(frame: SourceFrame, styles: Record<string, FigmaStyleMeta>): Measurements {
  if (frame.target === "typography") return readTypography(frame.node, styles);
  return SPECS[frame.target]?.(frame.node) ?? {};
}

/** Compute one component's (or typography's) values for every breakpoint. */
export function computeEntry(
  label: string,
  sources: SourceFrame[],
  input: ComputeInput,
): ResponsiveEntry {
  const notes: string[] = [];
  const sorted = sortBreakpoints(input.breakpoints);
  const order = sorted.map((b) => b.id);
  const base = mediaQueries(input.breakpoints, input.approach)[0]?.breakpointId ?? order[0];

  // One frame per breakpoint: the first wins, the rest are reported.
  const byBreakpoint = new Map<string, SourceFrame>();
  const frames: ResponsiveEntry["frames"] = [];
  for (const source of sources) {
    const tagged = Boolean(source.breakpointId && order.includes(source.breakpointId));
    const bp = tagged ? source.breakpointId! : base;
    if (!tagged) {
      const name = sorted.find((b) => b.id === base)?.name;
      notes.push(
        `“${shortName(source.node.name)}” is on a link without a screen size, so it was used for ${name} (the base breakpoint).`,
      );
    }
    if (byBreakpoint.has(bp)) {
      const name = sorted.find((b) => b.id === bp)?.name;
      notes.push(
        `More than one ${label} frame for ${name}: “${shortName(byBreakpoint.get(bp)!.node.name)}” was used, “${shortName(source.node.name)}” was not.`,
      );
      continue;
    }
    byBreakpoint.set(bp, source);
    frames.push({
      linkId: source.linkId,
      nodeId: source.node.id,
      nodeName: shortName(source.node.name),
      breakpointId: bp,
      tagged,
    });
  }

  const measured = new Map<string, Measurements>();
  for (const [bp, source] of byBreakpoint) {
    const values = measure(source, input.styles ?? {});
    if (Object.keys(values).length) measured.set(bp, values);
    else notes.push(`Nothing measurable was found in “${shortName(source.node.name)}”.`);
  }
  if (measured.size === 0) return { mode: "none", frames, values: {}, notes };

  const variables = [...new Set([...measured.values()].flatMap((m) => Object.keys(m)))].sort();
  const values: ResponsiveEntry["values"] = {};

  if (measured.size === 1) {
    const [[bp, m]] = [...measured];
    const range = fluidRange(input.breakpoints);
    const frameBp = sorted.find((b) => b.id === bp);
    for (const id of order) {
      values[id] = {};
      for (const v of variables) {
        // Only sizes (type, spacing) scale; radius stays as designed.
        const scales = isScalable(m[v]);
        values[id][v] = scales
          ? { value: fluidValue(m[v], frameBp, range), source: "fluid" }
          : { value: toCss(m[v]), source: id === bp ? "frame" : "inferred" };
      }
    }
    notes.push(
      `Only one ${label} frame (${frameBp?.name}); sizes are fluid clamp() estimates between ${range.from}px and ${range.to}px.`,
    );
    return { mode: "fluid", frames, values, notes };
  }

  // Two or more breakpoints: missing breakpoints (or variables) copy the nearest measured breakpoint.
  const inferredFrom = new Set<string>();
  for (const [i, id] of order.entries()) {
    values[id] = {};
    for (const v of variables) {
      const own = measured.get(id)?.[v];
      if (own) {
        values[id][v] = { value: toCss(own), source: "frame" } satisfies ResponsiveValue;
        continue;
      }
      const nearest = order
        .map((other, j) => ({ other, d: Math.abs(j - i), j }))
        .filter(({ other }) => measured.get(other)?.[v])
        .sort((a, b) => a.d - b.d || a.j - b.j)[0];
      if (nearest) {
        values[id][v] = { value: toCss(measured.get(nearest.other)![v]), source: "inferred" };
        inferredFrom.add(id);
      }
    }
  }
  const missing = order
    .filter((id) => !measured.has(id))
    .map((id) => sorted.find((b) => b.id === id)!.name);
  if (missing.length)
    notes.push(
      `No ${label} frame for ${missing.join(", ")}; values were copied from the nearest breakpoint.`,
    );
  return { mode: "breakpoints", frames, values, notes };
}

/** Values for every component and typography that has confirmed frames. */
export function computeResponsive(input: ComputeInput): ResponsiveFile {
  const groups = new Map<CssTemplateId | "typography", SourceFrame[]>();
  for (const f of input.frames) groups.set(f.target, [...(groups.get(f.target) ?? []), f]);

  const components: ResponsiveFile["components"] = {};
  for (const [target, sources] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    if (target === "typography") continue;
    components[target] = computeEntry(target, sources, input);
  }
  const typography = groups.has("typography")
    ? computeEntry("typography", groups.get("typography")!, input)
    : undefined;
  return { schemaVersion: 1, components, ...(typography ? { typography } : {}) };
}
