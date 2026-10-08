import { CSS_TEMPLATE_IDS, type ComponentPatterns } from "@/lib/model";

/** Components a frame can be mapped to (tokens are extracted, not mapped). */
export const MAPPABLE_COMPONENTS = CSS_TEMPLATE_IDS.filter((id) => id !== "tokens");
export type MappableComponent = (typeof MAPPABLE_COMPONENTS)[number];

export const DEFAULT_PATTERNS: Record<MappableComponent, string[]> = {
  header: ["header", "navbar", "nav bar", "top bar", "masthead"],
  footer: ["footer"],
  cta: ["cta", "button", "btn"],
  modals: ["modal", "dialog", "popup", "interstitial"],
  accordion: ["accordion", "faq", "collapsible", "expander"],
  isi: ["isi", "safety", "important safety information", "safety bar"],
  global: ["typography", "type scale", "colors", "colours", "styles"],
};

/** Saved overrides merged over the defaults, normalised to lowercase. */
export function effectivePatterns(
  saved: ComponentPatterns | undefined,
): Record<MappableComponent, string[]> {
  const out = {} as Record<MappableComponent, string[]>;
  for (const id of MAPPABLE_COMPONENTS) {
    const list = saved?.[id] ?? DEFAULT_PATTERNS[id];
    out[id] = [...new Set(list.map((k) => k.trim().toLowerCase()).filter(Boolean))];
  }
  return out;
}

/** Split a frame or keyword into lowercase words: "Header/Desktop_v2" → ["header", "desktop", "v2"]. */
export const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}&']+/u)
    .filter(Boolean);

export type Match = { componentId: MappableComponent; score: number; keyword: string };
export type Classification =
  | { kind: "match"; componentId: MappableComponent; keyword: string; score: number }
  | { kind: "ambiguous"; candidates: Match[] }
  | { kind: "none" };

/**
 * Score a keyword against a name, by whole words only (so "isi" never matches "visible"):
 * 3 = the name is exactly the keyword, 2 = the name starts with it, 1 = it appears anywhere.
 */
export function scoreKeyword(name: string, keyword: string): number {
  const nameWords = wordsOf(name);
  const keyWords = wordsOf(keyword);
  if (keyWords.length === 0) return 0;
  const at = (i: number) => keyWords.every((w, j) => nameWords[i + j] === w);
  if (nameWords.length === keyWords.length && at(0)) return 3;
  if (at(0)) return 2;
  for (let i = 1; i + keyWords.length <= nameWords.length; i++) if (at(i)) return 1;
  return 0;
}

/** Best component for a frame name. Ties between components are ambiguous. */
export function classify(
  name: string,
  patterns: Record<MappableComponent, string[]>,
): Classification {
  const best = new Map<MappableComponent, Match>();
  for (const id of MAPPABLE_COMPONENTS) {
    for (const keyword of patterns[id]) {
      const score = scoreKeyword(name, keyword);
      if (score > (best.get(id)?.score ?? 0)) best.set(id, { componentId: id, score, keyword });
    }
  }
  const matches = [...best.values()].sort((a, b) => b.score - a.score);
  if (matches.length === 0) return { kind: "none" };
  const top = matches.filter((m) => m.score === matches[0].score);
  if (top.length > 1) return { kind: "ambiguous", candidates: top };
  return { kind: "match", ...top[0] };
}
