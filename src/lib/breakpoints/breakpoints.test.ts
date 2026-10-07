import { describe, expect, it } from "vitest";
import type { Breakpoint } from "@/lib/model";
import {
  BREAKPOINT_PRESETS,
  applyFix,
  describeRange,
  fixAll,
  hasErrors,
  mediaQueries,
  sortBreakpoints,
  validateBreakpoints,
} from "./index";

let n = 0;
const bp = (name: string, minWidth?: number, maxWidth?: number): Breakpoint => ({
  id: `${name}-${++n}`,
  name,
  ...(minWidth !== undefined && { minWidth }),
  ...(maxWidth !== undefined && { maxWidth }),
});

const standard = () => [bp("mobile", undefined, 767), bp("tablet", 768, 1023), bp("desktop", 1024)];


describe("validateBreakpoints", () => {
  it("accepts the standard set and every preset", () => {
    expect(validateBreakpoints(standard())).toEqual([]);
    for (const preset of BREAKPOINT_PRESETS) {
      const list = preset.breakpoints.map((b, i) => ({ ...b, id: String(i) }));
      expect(validateBreakpoints(list)).toEqual([]);
    }
  });

  it("accepts a single unbounded breakpoint", () => {
    expect(validateBreakpoints([bp("all")])).toEqual([]);
  });

  it("detects the inclusive 1024px overlap and offers both fixes", () => {
    const [mobile, , desktop] = standard();
    const tablet = bp("tablet", 768, 1024);
    const [issue] = validateBreakpoints([mobile, tablet, desktop]);
    expect(issue).toMatchObject({
      code: "overlap",
      severity: "error",
      message: "tablet and desktop both match 1024px",
      breakpointIds: [tablet.id, desktop.id],
    });
    expect(issue.fixes.map((f) => f.label)).toEqual([
      "Start desktop at 1025px",
      "End tablet at 1023px",
    ]);
  });

  it("detects overlap of a wide range with several others", () => {
    const list = [bp("mobile", undefined, 767), bp("wide", 500, 2000), bp("desktop", 1024)];
    const overlaps = validateBreakpoints(list).filter((i) => i.code === "overlap");
    expect(overlaps.map((i) => i.message)).toEqual([
      "mobile and wide both match 500px–767px",
      "wide and desktop both match 1024px–2000px",
    ]);
  });

  it("detects gaps", () => {
    const list = [bp("mobile", undefined, 767), bp("tablet", 800, 1023), bp("desktop", 1024)];
    const [issue] = validateBreakpoints(list);
    expect(issue).toMatchObject({ code: "gap", message: "No breakpoint covers 768px–799px" });
    expect(issue.fixes.map((f) => f.label)).toEqual([
      "Extend mobile to 799px",
      "Start tablet at 768px",
    ]);
  });

  it("detects min greater than max and offers a swap", () => {
    const list = [bp("only", 1023, 768)];
    const issue = validateBreakpoints(list).find((i) => i.code === "min-greater-than-max")!;
    expect(issue.message).toBe("only: min-width 1023px is greater than max-width 768px");
    expect(applyFix(list, issue.fixes[0])[0]).toMatchObject({ minWidth: 768, maxWidth: 1023 });
  });

  it("detects duplicate names and suggests unique renames", () => {
    const list = [bp("mobile", undefined, 767), bp("mobile", 768, 1023), bp("mobile-2", 1024)];
    const issue = validateBreakpoints(list).find((i) => i.code === "duplicate-name")!;
    expect(issue.fixes[0].label).toBe("Rename to mobile-3");
    expect(validateBreakpoints(applyFix(list, issue.fixes[0]))).toEqual([]);
  });

  it("requires a middle breakpoint to have both bounds and fills from neighbours", () => {
    const list = [bp("mobile", undefined, 767), bp("tablet", 768), bp("desktop", 1024)];
    const issue = validateBreakpoints(list).find((i) => i.code === "missing-bound")!;
    expect(issue.message).toBe("tablet is a middle breakpoint and needs a max-width");
    expect(issue.fixes[0].label).toBe("Set max to 1023px");
  });

  it("warns when the ends are not covered", () => {
    const list = [bp("tablet", 768, 1023), bp("desktop", 1024, 1439)];
    expect(validateBreakpoints(list).map((i) => [i.code, i.severity, i.message])).toEqual([
      ["uncovered-start", "warning", "Widths below 768px are not covered by any breakpoint"],
      ["uncovered-end", "warning", "Widths above 1439px are not covered by any breakpoint"],
    ]);
    expect(hasErrors(validateBreakpoints(list))).toBe(false);
  });

  it("validates regardless of input order", () => {
    const [m, t, d] = standard();
    expect(validateBreakpoints([d, m, t])).toEqual([]);
  });
});

describe("fixAll", () => {
  const broken: Record<string, Breakpoint[]> = {
    "1024 overlap": [bp("mobile", undefined, 767), bp("tablet", 768, 1024), bp("desktop", 1024)],
    gap: [bp("mobile", undefined, 767), bp("tablet", 900, 1023), bp("desktop", 1200)],
    "min > max": [bp("mobile", undefined, 767), bp("tablet", 1023, 768), bp("desktop", 1024)],
    "duplicate names": [bp("a", undefined, 767), bp("a", 768)],
    "missing bounds": [bp("mobile", undefined, 767), bp("tablet"), bp("desktop", 1024)],
    "uncovered ends": [bp("tablet", 768, 1023), bp("desktop", 1024, 1439)],
    "everything at once": [
      bp("x", 1200, 800),
      bp("x", 300, 900),
      bp("y", 1000),
      bp("z", undefined, 400),
    ],
  };

  it.each(Object.entries(broken))("leaves no issues for: %s", (_label, list) => {
    expect(validateBreakpoints(fixAll(list))).toEqual([]);
  });

  it("can skip warnings", () => {
    const list = [bp("tablet", 768, 1023), bp("desktop", 1024, 1439)];
    expect(fixAll(list, { includeWarnings: false })).toEqual(list);
  });

  it("leaves a valid set untouched", () => {
    const list = standard();
    expect(fixAll(list)).toEqual(list);
  });
});

describe("mediaQueries", () => {
  const list = sortBreakpoints(standard()).reverse(); // unsorted input on purpose

  it("mobile-first: smallest is base, then min-width ascending", () => {
    expect(mediaQueries(list, "mobile-first").map((q) => [q.name, q.condition])).toEqual([
      ["mobile", null],
      ["tablet", "(min-width: 768px)"],
      ["desktop", "(min-width: 1024px)"],
    ]);
  });

  it("desktop-first: largest is base, then max-width descending", () => {
    expect(mediaQueries(list, "desktop-first").map((q) => [q.name, q.condition])).toEqual([
      ["desktop", null],
      ["tablet", "(max-width: 1023px)"],
      ["mobile", "(max-width: 767px)"],
    ]);
  });

  it("range: one bounded query per breakpoint", () => {
    expect(mediaQueries(list, "range").map((q) => [q.name, q.condition])).toEqual([
      ["mobile", "(max-width: 767px)"],
      ["tablet", "(min-width: 768px) and (max-width: 1023px)"],
      ["desktop", "(min-width: 1024px)"],
    ]);
  });

  it("a single unbounded breakpoint is base styles only", () => {
    for (const mode of ["mobile-first", "desktop-first", "range"] as const) {
      expect(mediaQueries([bp("all")], mode)[0].condition).toBeNull();
    }
  });
});

describe("describeRange", () => {
  it.each([
    [{ maxWidth: 767 }, "≤ 767px"],
    [{ minWidth: 768, maxWidth: 1023 }, "768px – 1023px"],
    [{ minWidth: 1024 }, "≥ 1024px"],
    [{}, "all widths"],
  ])("%j → %s", (b, expected) => {
    expect(describeRange(b)).toBe(expected);
  });
});
