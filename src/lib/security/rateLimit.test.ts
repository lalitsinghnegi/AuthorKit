import { describe, expect, it } from "vitest";
import { FIGMA_BUDGET, SITE_BUDGET, spend } from "./rateLimit";

describe("request budgets", () => {
  it("allows up to max per window per user, then refuses until the window resets", () => {
    const t = 5_000_000;
    for (let i = 0; i < FIGMA_BUDGET.max; i++) expect(spend(FIGMA_BUDGET, "u1", t)).toBeNull();
    expect(spend(FIGMA_BUDGET, "u1", t + 1)).toBe(FIGMA_BUDGET.message);
    expect(spend(FIGMA_BUDGET, "u2", t + 1)).toBeNull();
    expect(spend(SITE_BUDGET, "u1", t + 1)).toBeNull();
    expect(spend(FIGMA_BUDGET, "u1", t + FIGMA_BUDGET.windowMs)).toBeNull();
  });
});
