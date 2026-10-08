"use server";

import { MAPPABLE_COMPONENTS, effectivePatterns } from "@/lib/mapping";
import { ComponentPatterns } from "@/lib/model";
import { getComponentPatterns, saveComponentPatterns } from "@/lib/storage/settings";

export type PatternsState = {
  ok?: boolean;
  message?: string;
  error?: string;
  patterns?: Record<string, string[]>;
};

/** Each field holds comma-separated keywords for one component. */
export async function savePatternsAction(
  _prev: PatternsState,
  formData: FormData,
): Promise<PatternsState> {
  const raw: Record<string, string[]> = {};
  for (const id of MAPPABLE_COMPONENTS) {
    raw[id] = String(formData.get(id) ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (raw[id].length === 0) return { error: `Give ${id} at least one keyword.` };
  }
  const parsed = ComponentPatterns.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: `${String(issue?.path[0] ?? "")}: ${issue?.message ?? "Invalid keywords"}` };
  }
  await saveComponentPatterns(parsed.data);
  return {
    ok: true,
    message: "Name patterns saved. Run Detect frames again to apply them.",
    patterns: effectivePatterns(parsed.data),
  };
}

export async function resetPatternsAction(): Promise<PatternsState> {
  await saveComponentPatterns(undefined);
  return {
    ok: true,
    message: "Name patterns reset to the defaults.",
    patterns: effectivePatterns(await getComponentPatterns()),
  };
}
