import { Breakpoint as BreakpointSchema, type Breakpoint } from "@/lib/model";
import { sortBreakpoints, type Change } from "@/lib/breakpoints";

/** Editor row: widths kept as raw text so half-typed values aren't lost. */
export type Row = { id: string; name: string; min: string; max: string };
export type RowErrors = Partial<Record<"name" | "min" | "max", string>>;

export const toRow = (b: Breakpoint): Row => ({
  id: b.id,
  name: b.name,
  min: b.minWidth?.toString() ?? "",
  max: b.maxWidth?.toString() ?? "",
});

function parseWidth(raw: string): { value?: number; error?: string } {
  const text = raw.trim();
  if (text === "") return {};
  if (!/^\d+$/.test(text)) return { error: "Enter a whole number of pixels" };
  const value = Number(text);
  if (value > 10000) return { error: "Must be 10000px or less" };
  return { value };
}

/** Parse rows into breakpoints. Invalid widths are left out of the breakpoint and reported. */
export function parseRows(rows: Row[]): {
  breakpoints: Breakpoint[];
  errors: Map<string, RowErrors>;
} {
  const errors = new Map<string, RowErrors>();
  const breakpoints = rows.map((row) => {
    const rowErrors: RowErrors = {};
    const name = BreakpointSchema.shape.name.safeParse(row.name);
    if (!name.success)
      rowErrors.name = row.name ? name.error.issues[0].message : "Name is required";
    const min = parseWidth(row.min);
    const max = parseWidth(row.max);
    if (min.error) rowErrors.min = min.error;
    if (max.error) rowErrors.max = max.error;
    if (Object.keys(rowErrors).length) errors.set(row.id, rowErrors);

    const b: Breakpoint = { id: row.id, name: row.name };
    if (min.value !== undefined) b.minWidth = min.value;
    if (max.value !== undefined) b.maxWidth = max.value;
    return b;
  });
  return { breakpoints, errors };
}

/** Apply fix changes to rows, touching only the fields that change. */
export function applyChanges(rows: Row[], changes: Change[]): Row[] {
  return rows.map((row) => {
    const next = { ...row };
    for (const c of changes) {
      if (c.id !== row.id) continue;
      if (c.field === "name") next.name = c.value;
      else next[c.field === "minWidth" ? "min" : "max"] = c.value?.toString() ?? "";
    }
    return next;
  });
}

/** Order rows smallest-first using their parsed widths. */
export function sortRows(rows: Row[]): Row[] {
  const order = sortBreakpoints(parseRows(rows).breakpoints).map((b) => b.id);
  return [...rows].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

export function uniqueName(rows: Row[], base = "breakpoint"): string {
  const names = new Set(rows.map((r) => r.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
