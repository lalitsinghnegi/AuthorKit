import type { DesignToken, TokenMeta } from "@/lib/model";
import type { ExtractedToken } from "./extract";
import { UNMAPPED_REASON } from "./extract";
import { isTemplateToken } from "./naming";

export type MergeSummary = { added: number; changed: number; missing: number; unchanged: number };

export const MISSING_NOTE = "No longer found in Figma";

/**
 * Combine a fresh extraction with the saved tokens, keeping the admin's
 * decisions. Tokens are matched by meta.sourceKey:
 * - accepted, same value → stays accepted
 * - accepted, value changed in Figma → back to review, with a note
 * - overridden → keeps the admin's value; the Figma value is updated
 * - excluded → stays excluded
 * - renamed → keeps the admin's name
 * - saved tokens Figma no longer has → kept and marked missing, except undecided
 *   low-confidence ones from earlier extractions, which are dropped
 * - tokens without meta (added by hand) → untouched
 */
export function mergeTokens(
  existing: readonly DesignToken[],
  extracted: readonly ExtractedToken[],
  newId: () => string,
): { tokens: DesignToken[]; summary: MergeSummary } {
  const summary: MergeSummary = { added: 0, changed: 0, missing: 0, unchanged: 0 };
  const byKey = new Map(existing.filter((t) => t.meta).map((t) => [t.meta!.sourceKey, t]));
  const seen = new Set<string>();
  const result: DesignToken[] = [];

  for (const e of extracted) {
    const old = byKey.get(e.meta.sourceKey);
    seen.add(e.meta.sourceKey);
    if (!old) {
      summary.added++;
      result.push({
        id: newId(),
        name: e.name,
        type: e.type,
        value: e.value,
        originalValue: e.value,
        source: e.source,
        status: "auto",
        meta: e.meta,
      });
      continue;
    }

    const changed = old.originalValue !== e.value;
    if (changed) summary.changed++;
    else summary.unchanged++;
    const fresh: TokenMeta = { ...e.meta, missing: undefined, note: undefined };
    const meta = withName(old.name, fresh);
    const next: DesignToken = {
      ...old,
      type: e.type,
      source: e.source,
      originalValue: e.value,
      meta,
    };

    switch (old.status) {
      case "accepted":
        next.value = e.value;
        if (changed) {
          next.status = "auto";
          meta.note = `Changed in Figma from ${old.originalValue} to ${e.value}; review again`;
        }
        break;
      case "overridden":
        next.value = old.value;
        if (changed)
          meta.note = `Figma value changed from ${old.originalValue} to ${e.value}; your override is kept`;
        break;
      case "excluded":
        next.value = e.value;
        break;
      case "auto":
        next.value = e.value;
        if (changed) meta.note = `Changed in Figma from ${old.originalValue} to ${e.value}`;
        break;
    }
    result.push(next);
  }

  for (const old of existing) {
    if (old.meta && !seen.has(old.meta.sourceKey)) {
      // Uncertain values from earlier extractions that nobody decided on are dropped.
      if (old.status === "auto" && old.meta.confidence === "low") continue;
      summary.missing++;
      result.push({ ...old, meta: { ...old.meta, missing: true, note: MISSING_NOTE } });
    } else if (!old.meta) {
      result.push(old);
    }
  }
  return { tokens: dedupeNames(result), summary };
}

/** Recompute `mapped` (and its reason) after a rename. */
export function withName<M extends NonNullable<DesignToken["meta"]>>(name: string, meta: M): M {
  const mapped = isTemplateToken(name);
  const reasons = meta.reasons.filter((r) => r !== UNMAPPED_REASON);
  if (!mapped) reasons.push(UNMAPPED_REASON);
  return { ...meta, mapped, reasons, confidence: reasons.length ? "low" : "high" };
}

/**
 * Active (non-excluded) tokens must have unique names. When a new token
 * collides with one the admin already has, the new one gets an "-alt" name.
 */
function dedupeNames(tokens: DesignToken[]): DesignToken[] {
  const taken = new Set<string>();
  // Decisions first: accepted/overridden tokens keep their names.
  const rank = (t: DesignToken) => (t.status === "accepted" || t.status === "overridden" ? 0 : 1);
  const order = tokens.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i);
  const renamed = new Map<number, DesignToken>();
  for (const { t, i } of order) {
    if (t.status === "excluded") continue;
    let name = t.name;
    if (taken.has(name)) {
      let n = 1;
      while (taken.has(`${t.name}-alt${n > 1 ? `-${n}` : ""}`)) n++;
      name = `${t.name}-alt${n > 1 ? `-${n}` : ""}`;
      renamed.set(i, { ...t, name, meta: t.meta && withName(name, t.meta) });
    }
    taken.add(name);
  }
  return tokens.map((t, i) => renamed.get(i) ?? t);
}
