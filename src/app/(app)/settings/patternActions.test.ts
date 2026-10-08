import { describe, expect, it } from "vitest";
import { DEFAULT_PATTERNS, MAPPABLE_COMPONENTS } from "@/lib/mapping";
import { getComponentPatterns } from "@/lib/storage/settings";
import { withSignedIn } from "@/test/session";
import { withTempDataDir } from "@/test/tempDataDir";
import { resetPatternsAction, savePatternsAction } from "./patternActions";

withTempDataDir();
withSignedIn("admin");

const form = (overrides: Record<string, string> = {}) => {
  const data = new FormData();
  for (const id of MAPPABLE_COMPONENTS)
    data.set(id, overrides[id] ?? DEFAULT_PATTERNS[id].join(", "));
  return data;
};

describe("pattern settings", () => {
  it("saves comma-separated keywords and resets to defaults", async () => {
    const result = await savePatternsAction({}, form({ footer: " Footer , legal bar ,, " }));
    expect(result).toMatchObject({ ok: true, patterns: { footer: ["footer", "legal bar"] } });
    expect((await getComponentPatterns())?.footer).toEqual(["Footer", "legal bar"]);

    expect(await resetPatternsAction()).toMatchObject({
      ok: true,
      patterns: { footer: ["footer"] },
    });
    expect(await getComponentPatterns()).toBeUndefined();
  });

  it.each([
    [{ header: "" }, "Give header at least one keyword."],
    [{ isi: "isi, (.*)+" }, /isi: Keywords may contain/],
    [{ cta: "x".repeat(61) }, /cta:/],
  ])("rejects %j", async (overrides, error) => {
    const result = await savePatternsAction({}, form(overrides));
    expect(result.error).toMatch(error);
    expect(await getComponentPatterns()).toBeUndefined();
  });
});
