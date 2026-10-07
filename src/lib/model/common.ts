import { z } from "zod";

export const SCHEMA_VERSION = 1 as const;

export const SchemaVersion = z.literal(SCHEMA_VERSION);
export const Id = z.string().min(1).max(64);
export const IsoDate = z.iso.datetime();

/** Report the first id that appears more than once in a list. */
export function findDuplicate(values: string[]): string | undefined {
  const seen = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) return v;
    seen.add(v);
  }
  return undefined;
}
