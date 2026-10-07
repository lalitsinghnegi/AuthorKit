import { describe, expect, it } from "vitest";
import { applyChanges, parseRows, sortRows, toRow, uniqueName, type Row } from "./rows";

const row = (id: string, name: string, min = "", max = ""): Row => ({ id, name, min, max });

describe("parseRows", () => {
  it("parses widths and leaves blanks undefined", () => {
    const { breakpoints, errors } = parseRows([
      row("a", "mobile", "", "767"),
      row("b", "desktop", " 768 "),
    ]);
    expect(errors.size).toBe(0);
    expect(breakpoints).toEqual([
      { id: "a", name: "mobile", maxWidth: 767 },
      { id: "b", name: "desktop", minWidth: 768 },
    ]);
  });

  it("reports bad names and widths per row and leaves bad widths out", () => {
    const { breakpoints, errors } = parseRows([
      row("a", "", "abc", "12.5"),
      row("b", "Tablet", "-1", "20000"),
    ]);
    expect(errors.get("a")).toEqual({
      name: "Name is required",
      min: "Enter a whole number of pixels",
      max: "Enter a whole number of pixels",
    });
    expect(errors.get("b")).toMatchObject({
      name: expect.stringMatching(/lowercase/),
      min: "Enter a whole number of pixels",
      max: "Must be 10000px or less",
    });
    expect(breakpoints[0]).toEqual({ id: "a", name: "" });
  });
});

describe("row helpers", () => {
  it("round-trips breakpoints", () => {
    expect(toRow({ id: "a", name: "m", maxWidth: 767 })).toEqual(row("a", "m", "", "767"));
  });

  it("applies fix changes to the right fields only", () => {
    const rows = [row("a", "m", "", "767"), row("b", "t", "x", "1023")];
    expect(
      applyChanges(rows, [
        { id: "a", field: "maxWidth", value: undefined },
        { id: "b", field: "name", value: "tablet" },
      ]),
    ).toEqual([row("a", "m", "", ""), row("b", "tablet", "x", "1023")]);
  });

  it("sorts rows by width", () => {
    const rows = [
      row("d", "desktop", "1024"),
      row("m", "mobile", "", "767"),
      row("t", "tablet", "768", "1023"),
    ];
    expect(sortRows(rows).map((r) => r.id)).toEqual(["m", "t", "d"]);
  });

  it("makes unique names", () => {
    expect(uniqueName([])).toBe("breakpoint");
    expect(uniqueName([row("a", "breakpoint"), row("b", "breakpoint-2")])).toBe("breakpoint-3");
  });
});
