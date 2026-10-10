import { describe, expect, it } from "vitest";
import type { Breakpoint, DesignToken, ResponsiveFile } from "@/lib/model";
import { buildTemplateContext } from "./context";
import { renderTemplate } from "./render";
import { resolveDesignValues } from "./sources";

const bps: Breakpoint[] = [
  { id: "m", name: "mobile", maxWidth: 767 },
  { id: "t", name: "tablet", minWidth: 768, maxWidth: 1023 },
  { id: "d", name: "desktop", minWidth: 1024 },
];

let n = 0;
const token = (name: string, value: string, patch: Partial<DesignToken> = {}): DesignToken => ({
  id: `t${++n}`,
  name,
  type: name.startsWith("color") ? "color" : name.startsWith("font-size") ? "fontSize" : "size",
  value,
  originalValue: value,
  status: "accepted",
  ...patch,
});

const typography = (values: Record<string, Record<string, string>>): ResponsiveFile => ({
  schemaVersion: 1,
  components: {},
  typography: {
    mode: "breakpoints",
    frames: [],
    values: Object.fromEntries(
      Object.entries(values).map(([bp, vars]) => [
        bp,
        Object.fromEntries(
          Object.entries(vars).map(([k, v]) => [k, { value: v, source: "frame" as const }]),
        ),
      ]),
    ),
    notes: [],
  },
});

const resolve = (tokens: DesignToken[] = [], responsive: ResponsiveFile | null = null) =>
  resolveDesignValues({ breakpoints: bps, approach: "mobile-first", tokens, responsive });

describe("resolveDesignValues priority", () => {
  it("uses defaults, including large-screen overrides, when nothing comes from Figma", () => {
    const { resolved, report } = resolve();
    expect(resolved.tokensFor("m")["font-size-h1"]).toBe("32px");
    expect(resolved.tokensFor("d")["font-size-h1"]).toBe("44px");
    expect(report.rows.every((r) => r.source === "default")).toBe(true);
    expect(report.attention).toEqual([]);
  });

  it("accepted and overridden tokens apply at every breakpoint and drop the large-screen default", () => {
    const { resolved, report } = resolve([
      token("font-size-h1", "40px"),
      token("color-primary", "#123456", { status: "overridden", originalValue: "#8a0b4f" }),
    ]);
    expect(["m", "t", "d"].map((bp) => resolved.tokensFor(bp)["font-size-h1"])).toEqual([
      "40px",
      "40px",
      "40px",
    ]);
    expect(resolved.tokensFor("d")["font-size-h2"]).toBe("36px"); // untouched tokens keep their default
    expect(report.rows.find((r) => r.name === "font-size-h1")?.source).toBe("figma-token");
    expect(report.rows.find((r) => r.name === "color-primary")).toMatchObject({
      source: "override",
      value: "#123456",
    });
  });

  it("responsive typography beats tokens, per breakpoint", () => {
    const { resolved, report } = resolve(
      [token("font-size-h1", "40px")],
      typography({
        m: { "font-size-h1": "28px" },
        t: { "font-size-h1": "28px" },
        d: { "font-size-h1": "40px" },
      }),
    );
    expect(resolved.tokensFor("m")["font-size-h1"]).toBe("28px");
    expect(resolved.tokensFor("d")["font-size-h1"]).toBe("40px");
    expect(report.rows.find((r) => r.name === "font-size-h1")).toMatchObject({
      source: "responsive",
      value: "28px",
    });
    expect(report.attention).toEqual([]); // 40px was measured at desktop: no conflict
  });

  it("ignores tokens to review and excluded tokens, and counts the waiting ones", () => {
    const { resolved, report } = resolve([
      token("color-primary", "#123456", { status: "auto" }),
      token("color-text", "#000000", { status: "excluded" }),
    ]);
    expect(resolved.tokensFor("m")["color-primary"]).toBe("#0b4f8a");
    expect(resolved.tokensFor("m")["color-text"]).toBe("#1f2329");
    expect(report.attention).toEqual([
      { message: "1 token is waiting for review and not used yet.", screen: "tokens" },
    ]);
  });

  it("leaves out accepted non-template tokens and reports them", () => {
    const { resolved, report } = resolve([token("color-teal-accent", "#009980")]);
    expect(resolved.tokensFor("m")).not.toHaveProperty("color-teal-accent");
    expect(report.attention).toContainEqual({
      message: "color-teal-accent is not a template token, so it is not used.",
      screen: "tokens",
    });
    const ctx = buildTemplateContext({
      brandName: "B",
      prefix: "acme",
      approach: "mobile-first",
      breakpoints: bps,
      tokens: [token("color-teal-accent", "#009980")],
    });
    expect(renderTemplate("tokens", ctx)).not.toContain("color-teal-accent");
  });

  it("responsive component values beat defaults; unknown variables are reported", () => {
    const responsive: ResponsiveFile = {
      schemaVersion: 1,
      components: {
        footer: {
          mode: "breakpoints",
          frames: [],
          values: {
            m: {
              "footer-gap": { value: "24px", source: "frame" },
              "footer-colour": { value: "red", source: "frame" },
            },
            t: { "footer-gap": { value: "24px", source: "inferred" } },
            d: { "footer-gap": { value: "32px", source: "frame" } },
          },
          notes: ["No footer frame for tablet; values were copied from the nearest breakpoint."],
        },
      },
    };
    const { resolved, report } = resolve([], responsive);
    expect(resolved.componentFor("footer", "m").footer["footer-gap"]).toBe("24px");
    expect(resolved.componentFor("footer", "d").footer).toMatchObject({
      "footer-gap": "32px",
      "footer-direction": "row",
    });
    expect(report.rows.find((r) => r.name === "footer-gap")).toMatchObject({
      source: "responsive",
      file: "footer.css",
    });
    expect(report.attention.map((a) => a.message)).toEqual([
      "Footer: “footer-colour” is not a variable of this template and was ignored.",
      "Footer: No footer frame for tablet; values were copied from the nearest breakpoint.",
    ]);
  });
});

describe("needs attention", () => {
  it("reports a token that conflicts with the measured values", () => {
    const { report } = resolve(
      [token("font-size-h1", "48px")],
      typography({
        m: { "font-size-h1": "28px" },
        t: { "font-size-h1": "28px" },
        d: { "font-size-h1": "40px" },
      }),
    );
    expect(report.attention).toContainEqual({
      message:
        "font-size-h1 is 48px in Tokens but Responsive measured 28px / 40px; the responsive values are used.",
      screen: "responsive",
    });
  });

  it("reports missing and multi-valued tokens, invalid values and poor contrast", () => {
    const meta = {
      sourceKey: "s",
      figmaName: "x",
      origin: "style" as const,
      usage: 1,
      confidence: "low" as const,
      mapped: true,
    };
    const { resolved, report } = resolve([
      token("color-primary", "#ffd6e7", {
        meta: {
          ...meta,
          reasons: ["Figma has 2 different values for color-primary; #ffd6e7 was chosen"],
        },
      }),
      token("color-text", "#1f2329", {
        meta: { ...meta, sourceKey: "s2", reasons: [], missing: true },
      }),
      token("font-size-h2", "big"),
    ]);
    expect(resolved.tokensFor("m")["font-size-h2"]).toBe("26px");
    const messages = report.attention.map((a) => a.message);
    expect(messages).toContain(
      "color-primary: Figma has several values for this token; check that #ffd6e7 is the right one.",
    );
    expect(messages).toContain("color-text is no longer found in Figma but is still used.");
    expect(messages.find((m) => m.startsWith("font-size-h2"))).toMatch(/the default is used/);
    expect(messages.find((m) => m.startsWith("color-on-primary on color-primary"))).toMatch(
      /needs 4\.5:1/,
    );
  });
});
