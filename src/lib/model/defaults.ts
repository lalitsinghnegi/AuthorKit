import { randomUUID } from "node:crypto";
import { COMPONENT_PRESET } from "@/lib/scaffold/presets";
import { cloneWithNewIds } from "@/lib/scaffold/tree";
import type { BreakpointSet } from "./breakpoints";
import type { ScaffoldTree } from "./scaffold";

export function defaultBreakpoints(): BreakpointSet {
  return {
    breakpoints: [
      { id: randomUUID(), name: "mobile", maxWidth: 767 },
      { id: randomUUID(), name: "tablet", minWidth: 768, maxWidth: 1023 },
      { id: randomUUID(), name: "desktop", minWidth: 1024 },
    ],
  };
}

/** Starting scaffold for a new project: a fresh copy of the component-based preset. */
export function defaultScaffold(rootName: string): ScaffoldTree {
  return { ...cloneWithNewIds(COMPONENT_PRESET.tree), name: rootName };
}
