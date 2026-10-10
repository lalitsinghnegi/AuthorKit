import { describe, expect, it } from "vitest";
import { MAX_NAME_LENGTH, shortName } from "./names";

describe("shortName", () => {
  it("keeps short names, collapsing whitespace", () => {
    expect(shortName("  Header /\n Desktop ")).toBe("Header / Desktop");
  });

  it("cuts long names with an ellipsis", () => {
    const out = shortName("word ".repeat(100));
    expect(out.length).toBe(MAX_NAME_LENGTH);
    expect(out.endsWith("…")).toBe(true);
    expect(shortName("abcdef", 4)).toBe("abc…");
  });
});
