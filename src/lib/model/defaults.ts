import { randomUUID } from "node:crypto";
import { COMPONENT_PRESET } from "@/lib/scaffold/presets";
import { cloneWithNewIds } from "@/lib/scaffold/tree";
import { takeBreakpoints } from "@/lib/breakpoints/presets";
import type { BreakpointSet } from "./breakpoints";
import type { ScaffoldTemplate, ScaffoldTree } from "./scaffold";

/** The template a new project starts from when none is chosen. */
export const DEFAULT_TEMPLATE = COMPONENT_PRESET;

/** A template's breakpoints with fresh ids, for a new project. */
export function templateBreakpoints(template: ScaffoldTemplate = DEFAULT_TEMPLATE): BreakpointSet {
  return { breakpoints: takeBreakpoints(template.breakpoints.breakpoints, randomUUID) };
}

/** A fresh copy of a template's folder tree, renamed to the package root name. */
export function templateScaffold(
  rootName: string,
  template: ScaffoldTemplate = DEFAULT_TEMPLATE,
): ScaffoldTree {
  return { ...cloneWithNewIds(template.tree), name: rootName };
}

/** Standard breakpoints (from the default template) with fresh ids. */
export const defaultBreakpoints = () => templateBreakpoints();
/** Starting scaffold for a new project: a fresh copy of the component-based preset. */
export const defaultScaffold = (rootName: string) => templateScaffold(rootName);
