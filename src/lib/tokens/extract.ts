import type {
  FigmaEffect,
  FigmaNode,
  FigmaPaint,
  FigmaStyleMeta,
  FigmaTypeStyle,
  FigmaVariablesResponse,
} from "@/lib/figma/types";
import { shortName } from "@/lib/figma/names";
import { TOKEN_TYPES, type DesignToken, type TokenMeta, type TokenType } from "@/lib/model";
import { contrastRatio } from "@/lib/templates/contrast";
import { TEMPLATE_DEFAULTS } from "@/lib/templates/defaults";
import { isTemplateToken, suggestColorName, textRole } from "./naming";
import {
  colorToCss,
  fontFamilyStack,
  letterSpacingEm,
  lineHeightRatio,
  num,
  px,
  pxToRem,
  shadowToCss,
  slug,
} from "./normalize";

export type ExtractedToken = Pick<DesignToken, "name" | "type" | "value" | "source"> & {
  meta: TokenMeta;
};

export type ExtractInput = {
  fileKey: string;
  /** Roots to scan: linked frames, or the whole document. */
  roots: FigmaNode[];
  /** Style id → style metadata, from the file or nodes response. */
  styles: Record<string, FigmaStyleMeta>;
  /** Local variables, when the Figma plan allows them. */
  variables?: FigmaVariablesResponse["meta"];
};

export type ExtractResult = { tokens: ExtractedToken[]; notes: string[] };

export const UNMAPPED_REASON =
  "Name does not match a template token; rename it to use it in the CSS";
export const SPACING_SCALE = [4, 8, 12, 16, 24, 32, 48, 64] as const;
const RADIUS_SCALE = [
  ["radius-sm", 4],
  ["radius-md", 8],
  ["radius-lg", 16],
] as const;
const PILL = 500;
const FAR = 0.25;

type Use = { fileKey: string; node: FigmaNode };
type Candidate = ExtractedToken & { priority: number };

/** Collected from every scanned node before any naming decisions are made. */
class Collector {
  styleColors = new Map<string, { value: string; uses: Use[] }>();
  rawColors = new Map<string, Use[]>();
  textStyles = new Map<string, { style: FigmaTypeStyle; uses: Use[] }>();
  rawText: { style: FigmaTypeStyle; use: Use }[] = [];
  spacing = new Map<number, Use[]>();
  radius = new Map<number, Use[]>();
  strokes = new Map<number, Use[]>();
  styleShadows = new Map<string, { value: string; blur: number; uses: Use[] }>();
  rawShadows = new Map<string, { blur: number; uses: Use[] }>();

  add<K>(map: Map<K, Use[]>, key: K, use: Use) {
    map.set(key, [...(map.get(key) ?? []), use]);
  }
}

const visiblePaint = (paints?: FigmaPaint[]) =>
  paints?.find((p) => p.type === "SOLID" && p.visible !== false && p.color);
const visibleShadows = (effects?: FigmaEffect[]) =>
  (effects ?? []).filter((e) => e.type === "DROP_SHADOW" && e.visible !== false);

function walk(node: FigmaNode, fileKey: string, c: Collector) {
  if (node.visible === false) return;
  const use = { fileKey, node };

  const fill = visiblePaint(node.fills);
  if (fill?.color) {
    const value = colorToCss(fill.color, fill.opacity ?? 1);
    const styleId = node.styles?.fill ?? node.styles?.fills;
    if (styleId) {
      const entry = c.styleColors.get(styleId) ?? { value, uses: [] };
      entry.uses.push(use);
      c.styleColors.set(styleId, entry);
    } else {
      c.add(c.rawColors, value, use);
    }
  }

  if (node.type === "TEXT" && node.style?.fontSize) {
    const styleId = node.styles?.text;
    if (styleId) {
      const entry = c.textStyles.get(styleId) ?? { style: node.style, uses: [] };
      entry.uses.push(use);
      c.textStyles.set(styleId, entry);
    } else {
      c.rawText.push({ style: node.style, use });
    }
  }

  if (node.layoutMode && node.layoutMode !== "NONE") {
    for (const v of [
      node.itemSpacing,
      node.paddingTop,
      node.paddingRight,
      node.paddingBottom,
      node.paddingLeft,
    ]) {
      if (typeof v === "number" && v > 0) c.add(c.spacing, v, use);
    }
  }
  if (typeof node.cornerRadius === "number" && node.cornerRadius > 0)
    c.add(c.radius, node.cornerRadius, use);
  if (
    visiblePaint(node.strokes) &&
    typeof node.strokeWeight === "number" &&
    node.strokeWeight > 0
  ) {
    c.add(c.strokes, node.strokeWeight, use);
  }

  const shadows = visibleShadows(node.effects);
  if (shadows.length) {
    const value = shadows.map(shadowToCss).join(", ");
    const blur = shadows[0].radius ?? 0;
    const styleId = node.styles?.effect ?? node.styles?.effects;
    if (styleId) {
      const entry = c.styleShadows.get(styleId) ?? { value, blur, uses: [] };
      entry.uses.push(use);
      c.styleShadows.set(styleId, entry);
    } else {
      const entry = c.rawShadows.get(value) ?? { blur, uses: [] };
      entry.uses.push(use);
      c.rawShadows.set(value, entry);
    }
  }

  for (const child of node.children ?? []) walk(child, fileKey, c);
}

const sourceOf = (uses: Use[]) =>
  uses[0]
    ? { fileKey: uses[0].fileKey, nodeId: uses[0].node.id, nodeName: uses[0].node.name }
    : undefined;

function candidate(
  name: string,
  type: TokenType,
  value: string,
  meta: Omit<TokenMeta, "confidence" | "mapped">,
  source: ExtractedToken["source"],
): Candidate {
  const priority = { variable: 0, style: 1, scan: 2 }[meta.origin];
  return {
    name,
    type,
    value,
    source: source && {
      ...source,
      ...(source.nodeName !== undefined && { nodeName: shortName(source.nodeName) }),
    },
    priority,
    meta: { ...meta, figmaName: shortName(meta.figmaName), confidence: "high", mapped: false },
  };
}

/** Most common entry by use count, ties broken by the smaller key for determinism. */
function mostUsed<K extends string | number>(entries: [K, Use[]][]): [K, Use[]] {
  return [...entries].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))[0];
}

function nearest<T extends readonly number[]>(scale: T, v: number): number {
  return scale.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best), scale[0]);
}

/**
 * Tokens to offer the admin: only high-confidence ones. Anything uncertain is left out,
 * so the generated CSS keeps the template default for it.
 */
export function extractTokens(inputs: ExtractInput[]): ExtractResult {
  const all = extractAllTokens(inputs);
  const tokens = all.tokens.filter((t) => t.meta.confidence === "high");
  const left = all.tokens.length - tokens.length;
  return { tokens, notes: left ? [...all.notes, lowConfidenceNote(left)] : all.notes };
}

export const lowConfidenceNote = (n: number) =>
  `${n} uncertain ${n === 1 ? "value was" : "values were"} left out (used once, off the scale, conflicting, unnamed or failing contrast).`;

/** Every value found, each rated high or low confidence with its reasons. */
export function extractAllTokens(inputs: ExtractInput[]): ExtractResult {
  const c = new Collector();
  const notes: string[] = [];
  const styles: Record<string, FigmaStyleMeta> = {};
  for (const input of inputs) {
    Object.assign(styles, input.styles);
    for (const root of input.roots) walk(root, input.fileKey, c);
  }
  const candidates: Candidate[] = [];

  // Variables: the most explicit source.
  const variableSpacing: { value: number; id: string; name: string }[] = [];
  const variableRadius: { value: number; id: string; name: string }[] = [];
  for (const input of inputs) {
    if (!input.variables) continue;
    const { variables, variableCollections } = input.variables;
    for (const v of Object.values(variables).sort((a, b) => a.id.localeCompare(b.id))) {
      const mode = variableCollections[v.variableCollectionId]?.defaultModeId;
      const raw = mode ? v.valuesByMode[mode] : undefined;
      if (raw && typeof raw === "object" && (raw as { type?: string }).type === "VARIABLE_ALIAS") {
        notes.push(`Variable "${v.name}" is an alias and was skipped.`);
        continue;
      }
      const meta = {
        sourceKey: `var:${v.id}`,
        figmaName: v.name,
        origin: "variable" as const,
        usage: 0,
        reasons: [],
      };
      if (v.resolvedType === "COLOR" && raw && typeof raw === "object") {
        const color = raw as { r: number; g: number; b: number; a: number };
        candidates.push(
          candidate(suggestColorName(v.name), "color", colorToCss(color), meta, undefined),
        );
      } else if (v.resolvedType === "FLOAT" && typeof raw === "number") {
        const lower = v.name.toLowerCase();
        if (/space|spacing|gap|padding|margin/.test(lower))
          variableSpacing.push({ value: raw, id: v.id, name: v.name });
        else if (/radius|corner|round/.test(lower))
          variableRadius.push({ value: raw, id: v.id, name: v.name });
      }
    }
  }

  // Colors from fill styles.
  const styledValues = new Set(candidates.filter((x) => x.type === "color").map((x) => x.value));
  for (const [styleId, { value, uses }] of [...c.styleColors].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const meta = styles[styleId];
    if (!meta || meta.styleType !== "FILL") continue;
    styledValues.add(value);
    candidates.push(
      candidate(
        suggestColorName(meta.name),
        "color",
        value,
        {
          sourceKey: `style:${meta.key}`,
          figmaName: meta.name,
          origin: "style",
          usage: uses.length,
          reasons: [],
        },
        sourceOf(uses),
      ),
    );
  }

  // Colors found on layers without a style.
  for (const [value, uses] of [...c.rawColors].sort(([a], [b]) => a.localeCompare(b))) {
    const layerName = mostUsed(
      Object.entries(
        uses.reduce<Record<string, Use[]>>(
          (acc, u) => ((acc[u.node.name] ??= []).push(u), acc),
          {},
        ),
      ),
    )[0];
    const name = suggestColorName(layerName);
    // A styled color reused on an unnamed layer adds nothing new.
    if (styledValues.has(value) && !isTemplateToken(name)) continue;
    const reasons =
      uses.length === 1 ? ["Used only once and not saved as a Figma style or variable"] : [];
    candidates.push(
      candidate(
        name,
        "color",
        value,
        {
          sourceKey: `scan:color:${value}`,
          figmaName: layerName,
          origin: "scan",
          usage: uses.length,
          reasons,
        },
        sourceOf(uses),
      ),
    );
  }

  candidates.push(...typography(c, styles, notes));
  candidates.push(...scaleTokens(c.spacing, variableSpacing, "spacing"));
  candidates.push(...radiusTokens(c.radius, variableRadius));
  candidates.push(...borderTokens(c.strokes));
  candidates.push(...shadowTokens(c, styles));

  const tokens = finalise(resolveConflicts(candidates));
  return { tokens, notes };
}

function typography(
  c: Collector,
  styles: Record<string, FigmaStyleMeta>,
  notes: string[],
): Candidate[] {
  const out: Candidate[] = [];
  type Styled = {
    key: string;
    name: string;
    style: FigmaTypeStyle;
    uses: Use[];
    origin: "style" | "scan";
  };
  const styled: Styled[] = [...c.textStyles]
    .filter(([id]) => styles[id]?.styleType === "TEXT")
    .map(([id, v]) => ({
      key: styles[id].key,
      name: styles[id].name,
      origin: "style" as const,
      ...v,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  let entries = styled;
  const fallbackReason = "No text styles in the linked frames; derived from text layers";
  if (styled.length === 0 && c.rawText.length > 0) {
    notes.push("No Figma text styles were found, so typography was estimated from text layers.");
    // Group raw text by size: the most common size is body, larger sizes become headings.
    const bySize = new Map<number, Use[]>();
    const sample = new Map<number, FigmaTypeStyle>();
    for (const { style, use } of c.rawText) {
      bySize.set(style.fontSize!, [...(bySize.get(style.fontSize!) ?? []), use]);
      sample.set(style.fontSize!, sample.get(style.fontSize!) ?? style);
    }
    const [bodySize] = mostUsed([...bySize]);
    const larger = [...bySize.keys()]
      .filter((s) => s > bodySize)
      .sort((a, b) => b - a)
      .slice(0, 6);
    entries = [
      {
        key: `text:${bodySize}`,
        name: "Body",
        style: sample.get(bodySize)!,
        uses: bySize.get(bodySize)!,
        origin: "scan",
      },
      ...larger.map((size, i) => ({
        key: `text:${size}`,
        name: `H${i + 1}`,
        style: sample.get(size)!,
        uses: bySize.get(size)!,
        origin: "scan" as const,
      })),
    ];
  }

  const roles = entries.map((e) => ({ ...e, role: textRole(e.name) }));
  const push = (
    e: (typeof roles)[number],
    prop: string,
    name: string,
    type: TokenType,
    value: string,
    extra: string[] = [],
  ) =>
    out.push(
      candidate(
        name,
        type,
        value,
        {
          sourceKey: `${e.origin === "style" ? "style" : "scan"}:${e.key}:${prop}`,
          figmaName: e.name,
          origin: e.origin,
          usage: e.uses.length,
          reasons: [...(e.origin === "scan" ? [fallbackReason] : []), ...extra],
        },
        sourceOf(e.uses),
      ),
    );

  for (const e of roles) {
    const size = e.style.fontSize!;
    if (e.role?.kind === "heading")
      push(e, "fontSize", `font-size-h${e.role.level}`, "fontSize", pxToRem(size));
    else if (e.role?.kind === "body")
      push(e, "fontSize", "font-size-base", "fontSize", pxToRem(size));
    else if (e.role?.kind === "small")
      push(e, "fontSize", "font-size-sm", "fontSize", pxToRem(size));
    else
      push(e, "fontSize", `font-size-${slug(e.name) || "text"}`, "fontSize", pxToRem(size), [
        "Text style name not recognised as a heading, body or small style",
      ]);
  }

  // Shared heading and body properties come from one representative style each.
  const headings = roles
    .filter((e) => e.role?.kind === "heading")
    .sort((a, b) => (a.role as { level: number }).level - (b.role as { level: number }).level);
  const heading = headings[0];
  if (heading) {
    const s = heading.style;
    if (s.fontFamily)
      push(
        heading,
        "fontFamily",
        "font-family-heading",
        "fontFamily",
        fontFamilyStack(s.fontFamily),
      );
    if (s.lineHeightPx)
      push(
        heading,
        "lineHeight",
        "line-height-heading",
        "lineHeight",
        lineHeightRatio(s.lineHeightPx, s.fontSize!),
      );
    push(
      heading,
      "letterSpacing",
      "letter-spacing-heading",
      "letterSpacing",
      letterSpacingEm(s.letterSpacing ?? 0, s.fontSize!),
    );
    if (s.fontWeight && s.fontWeight >= 600)
      push(heading, "fontWeight", "font-weight-bold", "fontWeight", String(s.fontWeight));
  }
  const body = roles.find((e) => e.role?.kind === "body");
  if (body) {
    const s = body.style;
    if (s.fontFamily)
      push(body, "fontFamily", "font-family-base", "fontFamily", fontFamilyStack(s.fontFamily));
    if (s.lineHeightPx)
      push(
        body,
        "lineHeight",
        "line-height-body",
        "lineHeight",
        lineHeightRatio(s.lineHeightPx, s.fontSize!),
      );
    if (s.fontWeight)
      push(body, "fontWeight", "font-weight-regular", "fontWeight", String(s.fontWeight));
  }
  return out;
}

/** Map spacing values onto the 8-step scale; each step takes its most used value. */
function scaleTokens(
  scanned: Map<number, Use[]>,
  variables: { value: number; id: string; name: string }[],
  type: "spacing",
): Candidate[] {
  const out: Candidate[] = [];
  const slots = new Map<number, { scan: [number, Use[]][]; vars: typeof variables }>();
  const slotOf = (v: number) => nearest(SPACING_SCALE, v);
  for (const entry of scanned) {
    const s = slotOf(entry[0]);
    slots.set(s, { scan: [...(slots.get(s)?.scan ?? []), entry], vars: slots.get(s)?.vars ?? [] });
  }
  for (const v of variables) {
    const s = slotOf(v.value);
    slots.set(s, { scan: slots.get(s)?.scan ?? [], vars: [...(slots.get(s)?.vars ?? []), v] });
  }
  for (const step of SPACING_SCALE) {
    const slot = slots.get(step);
    if (!slot) continue;
    const name = `space-${SPACING_SCALE.indexOf(step) + 1}`;
    const all = [...slot.scan.map(([v]) => v), ...slot.vars.map((v) => v.value)];
    const variable = slot.vars[0];
    const [chosen, uses] = variable
      ? [variable.value, slot.scan.find(([v]) => v === variable.value)?.[1] ?? []]
      : mostUsed(slot.scan);
    const reasons: string[] = [];
    if (Math.abs(chosen - step) / step > FAR)
      reasons.push(`${px(chosen)} is far from the ${step}px step it was matched to`);
    const others = [...new Set(all.filter((v) => v !== chosen))].sort((a, b) => a - b);
    if (others.length)
      reasons.push(
        `Also found ${others.map(px).join(", ")} near this step; ${px(chosen)} was chosen`,
      );
    out.push(
      candidate(
        name,
        type,
        pxToRem(chosen),
        variable
          ? {
              sourceKey: `var:${variable.id}`,
              figmaName: variable.name,
              origin: "variable",
              usage: uses.length,
              reasons,
            }
          : {
              sourceKey: `scan:spacing:${step}`,
              figmaName: `Auto layout gap/padding ${px(chosen)}`,
              origin: "scan",
              usage: uses.length,
              reasons,
            },
        sourceOf(uses),
      ),
    );
  }
  return out;
}

function radiusTokens(
  scanned: Map<number, Use[]>,
  variables: { value: number; id: string; name: string }[],
): Candidate[] {
  const out: Candidate[] = [];
  const groups = new Map<string, { values: [number, Use[]][]; vars: typeof variables }>();
  const nameOf = (v: number): string => {
    if (v >= PILL) return "radius-pill";
    const steps = RADIUS_SCALE.map(([, s]) => s);
    return RADIUS_SCALE[steps.indexOf(nearest(steps, v) as 4 | 8 | 16)][0];
  };
  for (const entry of scanned) {
    const n = nameOf(entry[0]);
    groups.set(n, {
      values: [...(groups.get(n)?.values ?? []), entry],
      vars: groups.get(n)?.vars ?? [],
    });
  }
  for (const v of variables) {
    const n = nameOf(v.value);
    groups.set(n, {
      values: groups.get(n)?.values ?? [],
      vars: [...(groups.get(n)?.vars ?? []), v],
    });
  }
  for (const [name, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const variable = group.vars[0];
    const [chosen, uses] = variable
      ? [variable.value, group.values.find(([v]) => v === variable.value)?.[1] ?? []]
      : mostUsed(group.values);
    const value = name === "radius-pill" ? "999px" : px(chosen);
    const step = RADIUS_SCALE.find(([n]) => n === name)?.[1];
    const reasons: string[] = [];
    if (step && Math.abs(chosen - step) / step > FAR)
      reasons.push(`${px(chosen)} is far from the ${step}px default for ${name}`);
    const others = [...new Set(group.values.map(([v]) => v).filter((v) => v !== chosen))];
    if (others.length && name !== "radius-pill")
      reasons.push(`Also found ${others.map(px).join(", ")}; ${px(chosen)} was chosen`);
    out.push(
      candidate(
        name,
        "radius",
        value,
        variable
          ? {
              sourceKey: `var:${variable.id}`,
              figmaName: variable.name,
              origin: "variable",
              usage: uses.length,
              reasons,
            }
          : {
              sourceKey: `scan:radius:${name}`,
              figmaName: `Corner radius ${px(chosen)}`,
              origin: "scan",
              usage: uses.length,
              reasons,
            },
        sourceOf(uses),
      ),
    );
  }
  return out;
}

function borderTokens(strokes: Map<number, Use[]>): Candidate[] {
  if (strokes.size === 0) return [];
  const [chosen, uses] = mostUsed([...strokes]);
  const others = [...strokes.keys()].filter((v) => v !== chosen).sort((a, b) => a - b);
  return [
    candidate(
      "border-width",
      "border",
      px(chosen),
      {
        sourceKey: "scan:border-width",
        figmaName: `Stroke ${px(chosen)}`,
        origin: "scan",
        usage: uses.length,
        reasons: others.length ? [`Other stroke widths found: ${others.map(px).join(", ")}`] : [],
      },
      sourceOf(uses),
    ),
  ];
}

function shadowSlot(name: string, blur: number): string {
  const lower = ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  if (/ (sm|small|low|1) /.test(lower)) return "shadow-sm";
  if (/ (md|medium|mid|2) /.test(lower)) return "shadow-md";
  if (/ (lg|large|high|3) /.test(lower)) return "shadow-lg";
  return blur <= 4 ? "shadow-sm" : blur <= 16 ? "shadow-md" : "shadow-lg";
}

function shadowTokens(c: Collector, styles: Record<string, FigmaStyleMeta>): Candidate[] {
  const out: Candidate[] = [];
  for (const [id, { value, blur, uses }] of [...c.styleShadows].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const meta = styles[id];
    if (!meta) continue;
    out.push(
      candidate(
        shadowSlot(meta.name, blur),
        "shadow",
        value,
        {
          sourceKey: `style:${meta.key}`,
          figmaName: meta.name,
          origin: "style",
          usage: uses.length,
          reasons: [],
        },
        sourceOf(uses),
      ),
    );
  }
  for (const [value, { blur, uses }] of [...c.rawShadows].sort(([a], [b]) => a.localeCompare(b))) {
    out.push(
      candidate(
        shadowSlot("", blur),
        "shadow",
        value,
        {
          sourceKey: `scan:shadow:${value}`,
          figmaName: uses[0].node.name,
          origin: "scan",
          usage: uses.length,
          reasons:
            uses.length === 1 ? ["Used only once and not saved as a Figma effect style"] : [],
        },
        sourceOf(uses),
      ),
    );
  }
  return out;
}

/**
 * One token per name: identical values merge; different values keep the
 * most trusted (variable > style > scan), then the most used. The others
 * get "-alt" names so the admin can still pick them.
 */
function resolveConflicts(candidates: Candidate[]): Candidate[] {
  const byName = new Map<string, Candidate[]>();
  for (const cand of candidates) byName.set(cand.name, [...(byName.get(cand.name) ?? []), cand]);

  const out: Candidate[] = [];
  const taken = new Set(byName.keys());
  for (const [name, group] of byName) {
    const sorted = [...group].sort(
      (a, b) =>
        a.priority - b.priority ||
        b.meta.usage - a.meta.usage ||
        a.meta.sourceKey.localeCompare(b.meta.sourceKey),
    );
    const winner = {
      ...sorted[0],
      meta: { ...sorted[0].meta, reasons: [...sorted[0].meta.reasons] },
    };
    // Same value from several sources: one token, combined usage.
    const rest = sorted.slice(1).filter((cand) => {
      if (cand.value !== winner.value) return true;
      winner.meta.usage += cand.meta.usage;
      return false;
    });
    if (rest.length) {
      winner.meta.reasons.push(
        `Figma has ${rest.length + 1} different values for ${name}; ${winner.value} was chosen (${winner.meta.origin}, used ${winner.meta.usage}×)`,
      );
    }
    out.push(winner);
    rest.forEach((alt, i) => {
      let altName = `${name}-alt${i ? `-${i + 1}` : ""}`;
      while (taken.has(altName)) altName += "-x";
      taken.add(altName);
      out.push({
        ...alt,
        name: altName,
        meta: {
          ...alt.meta,
          reasons: [...alt.meta.reasons, `Another value (${winner.value}) was chosen for ${name}`],
        },
      });
    });
  }
  return out;
}

const CONTRAST_PAIRS: [fg: string, bg: string, min: number][] = [
  ["color-text", "color-background", 4.5],
  ["color-heading", "color-background", 4.5],
  ["color-text-muted", "color-background", 4.5],
  ["color-link", "color-background", 4.5],
  ["color-on-primary", "color-primary", 4.5],
  ["color-on-primary", "color-primary-hover", 4.5],
  ["color-primary", "color-background", 4.5],
  ["color-footer-text", "color-footer-background", 4.5],
  ["color-isi-text", "color-isi-background", 4.5],
  ["color-focus", "color-background", 3],
];

/** Mark mapping, confidence and contrast, then sort for stable output. */
function finalise(candidates: Candidate[]): ExtractedToken[] {
  const tokens: ExtractedToken[] = candidates.map(({ priority: _p, ...t }) => {
    void _p;
    const mapped = isTemplateToken(t.name);
    const reasons = mapped ? t.meta.reasons : [...t.meta.reasons, UNMAPPED_REASON];
    return { ...t, meta: { ...t.meta, mapped, reasons } };
  });

  // Contrast uses extracted values where present and template defaults otherwise.
  const defaults = new Map(TEMPLATE_DEFAULTS.tokens.map((t) => [t.name, t.value]));
  const value = (name: string) => tokens.find((t) => t.name === name)?.value ?? defaults.get(name);
  for (const [fg, bg, min] of CONTRAST_PAIRS) {
    const token = tokens.find((t) => t.name === fg) ?? tokens.find((t) => t.name === bg);
    const a = value(fg);
    const b = value(bg);
    if (!token || !a || !b || !a.startsWith("#") || !b.startsWith("#")) continue;
    if (!tokens.some((t) => t.name === fg || t.name === bg)) continue;
    const ratio = contrastRatio(a, b);
    if (ratio < min) {
      token.meta.reasons.push(`${fg} on ${bg} has contrast ${num(ratio, 2)}:1 (needs ${min}:1)`);
    }
  }

  for (const t of tokens) t.meta.confidence = t.meta.reasons.length ? "low" : "high";
  const order = (type: TokenType) => TOKEN_TYPES.indexOf(type);
  return tokens.sort(
    (a, b) =>
      order(a.type) - order(b.type) || a.name.localeCompare(b.name, "en", { numeric: true }),
  );
}
