import { gzipSync } from "node:zlib";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import type { GeneratedFile } from "@/lib/generator/types";
import type { Breakpoint, Project } from "@/lib/model";
import { literalDesignValues } from "@/lib/templates/analyze";
import { manifestClasses, type ComponentManifest } from "@/lib/templates/manifest";
import { getManifests } from "@/lib/templates/registry";
import { TEMPLATE_DEFAULTS } from "@/lib/templates/defaults";

export type CheckId =
  "stylelint" | "variables" | "unused" | "media-order" | "classes" | "literals" | "size";

export type QualityIssue = {
  check: CheckId;
  severity: "error" | "warning";
  message: string;
  path?: string;
  line?: number;
};

export type FileSize = {
  path: string;
  bytes: number;
  gzip: number;
  rules: number;
  declarations: number;
};

export const SIZE_LIMITS = { file: 50 * 1024, total: 250 * 1024 };

const isCss = (f: GeneratedFile) => f.path.endsWith(".css");

type VarUse = { name: string; path: string; line?: number; fallback: boolean };

/** Every var() use and custom-property declaration in the package, with locations. */
function variableFacts(files: GeneratedFile[]) {
  const uses: VarUse[] = [];
  const declared = new Map<string, { path: string; line?: number }>();
  for (const file of files.filter(isCss)) {
    postcss.parse(file.content).walkDecls((decl) => {
      const line = decl.source?.start?.line;
      if (decl.prop.startsWith("--") && !declared.has(decl.prop.slice(2))) {
        declared.set(decl.prop.slice(2), { path: file.path, line });
      }
      for (const m of decl.value.matchAll(/var\(\s*--([a-zA-Z0-9_-]+)\s*(,)?/g)) {
        uses.push({ name: m[1], path: file.path, line, fallback: Boolean(m[2]) });
      }
    });
  }
  return { uses, declared };
}

/** Every var() must resolve somewhere in the package (a fallback downgrades it to a warning). */
export function checkVariables(files: GeneratedFile[]): QualityIssue[] {
  const { uses, declared } = variableFacts(files);
  const issues: QualityIssue[] = [];
  const reported = new Set<string>();
  for (const use of uses) {
    if (declared.has(use.name) || reported.has(`${use.path}:${use.name}`)) continue;
    reported.add(`${use.path}:${use.name}`);
    issues.push({
      check: "variables",
      severity: use.fallback ? "warning" : "error",
      message: `--${use.name} is used but never defined${use.fallback ? " (its fallback value is used)" : ""}`,
      path: use.path,
      line: use.line,
    });
  }
  return issues;
}

/**
 * Variables nobody reads. Tokens are the package's public API, so unused
 * tokens are summarised in one note; extra Figma values are expected to be
 * unused; unused component variables are reported one by one.
 */
export function checkUnused(
  files: GeneratedFile[],
  prefix: string,
  extras: readonly string[] = [],
): QualityIssue[] {
  const { uses, declared } = variableFacts(files);
  const used = new Set(uses.map((u) => u.name));
  const tokenNames = new Set(TEMPLATE_DEFAULTS.tokens.map((t) => `${prefix}-${t.name}`));
  const extraNames = new Set(extras.map((e) => `${prefix}-${e}`));
  const unusedTokens: string[] = [];
  const issues: QualityIssue[] = [];
  for (const [name, where] of declared) {
    if (used.has(name) || extraNames.has(name)) continue;
    if (tokenNames.has(name)) unusedTokens.push(name);
    else
      issues.push({
        check: "unused",
        severity: "warning",
        message: `--${name} is defined but never used`,
        ...where,
      });
  }
  if (unusedTokens.length) {
    issues.unshift({
      check: "unused",
      severity: "warning",
      message: `${unusedTokens.length} token${unusedTokens.length === 1 ? " is" : "s are"} defined but not used by this package's CSS (available for your own CSS): ${unusedTokens
        .sort()
        .map((n) => `--${n}`)
        .join(", ")}`,
      path: files.find((f) => f.templateId === "tokens")?.path,
    });
  }
  return issues;
}

/**
 * Media queries must follow the cascade: mobile-first files use min-width
 * queries in ascending order, desktop-first files max-width in descending
 * order. Range queries (min and max) and non-width queries are not ordered.
 */
export function checkMediaOrder(
  files: GeneratedFile[],
  approach: Project["approach"],
  breakpoints: readonly Breakpoint[],
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const known = new Set(
    breakpoints
      .flatMap((b) => (approach === "mobile-first" ? [b.minWidth] : [b.maxWidth]))
      .filter((n): n is number => n !== undefined),
  );
  for (const file of files.filter(isCss)) {
    let last: number | undefined;
    postcss.parse(file.content).walkAtRules("media", (at) => {
      const line = at.source?.start?.line;
      const min = /\(\s*min-width:\s*(\d+)px\s*\)/.exec(at.params);
      const max = /\(\s*max-width:\s*(\d+)px\s*\)/.exec(at.params);
      if (!min && !max) return;
      if (min && max) return; // range query
      if (approach === "mobile-first" && max) {
        issues.push({
          check: "media-order",
          severity: "error",
          message: `max-width query “${at.params}” in a mobile-first package`,
          path: file.path,
          line,
        });
        return;
      }
      if (approach === "desktop-first" && min) {
        issues.push({
          check: "media-order",
          severity: "error",
          message: `min-width query “${at.params}” in a desktop-first package`,
          path: file.path,
          line,
        });
        return;
      }
      const width = Number((min ?? max)![1]);
      if (last !== undefined && (approach === "mobile-first" ? width < last : width > last)) {
        issues.push({
          check: "media-order",
          severity: "error",
          message: `“${at.params}” comes after a ${approach === "mobile-first" ? "larger" : "smaller"} breakpoint (${last}px), so the cascade would override it`,
          path: file.path,
          line,
        });
      }
      last = width;
      if (!known.has(width)) {
        issues.push({
          check: "media-order",
          severity: "warning",
          message: `${width}px is not one of the project's breakpoints`,
          path: file.path,
          line,
        });
      }
    });
  }
  return issues;
}

/** Templated files must contain exactly the classes their manifest documents. */
export function checkClasses(
  files: GeneratedFile[],
  prefix: string,
  manifests: Record<string, ComponentManifest> = getManifests(),
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  for (const file of files.filter((f) => f.templateId && isCss(f))) {
    const documented = new Set(manifestClasses(manifests[file.templateId!], prefix));
    const found = new Map<string, number | undefined>();
    postcss.parse(file.content).walkRules((rule) => {
      selectorParser((sel) => {
        sel.walkClasses((c) => {
          if (!found.has(c.value)) found.set(c.value, rule.source?.start?.line);
        });
      }).processSync(rule.selector);
    });
    for (const [cls, line] of found) {
      if (!documented.has(cls)) {
        issues.push({
          check: "classes",
          severity: "error",
          message: `.${cls} is not documented in the ${file.templateId} manifest`,
          path: file.path,
          line,
        });
      }
    }
    for (const cls of documented) {
      if (!found.has(cls)) {
        issues.push({
          check: "classes",
          severity: "error",
          message: `.${cls} is documented in the ${file.templateId} manifest but missing from the CSS`,
          path: file.path,
        });
      }
    }
  }
  return issues;
}

export function checkLiterals(files: GeneratedFile[]): QualityIssue[] {
  return files.filter(isCss).flatMap((file) =>
    literalDesignValues(file.content).map((d) => ({
      check: "literals" as const,
      severity: "warning" as const,
      message: `Literal design value instead of a variable: ${d}`,
      path: file.path,
    })),
  );
}

export function measureSizes(files: GeneratedFile[]): {
  sizes: FileSize[];
  issues: QualityIssue[];
} {
  const sizes = files.filter(isCss).map((file) => {
    const root = postcss.parse(file.content);
    let rules = 0;
    let declarations = 0;
    root.walkRules(() => void rules++);
    root.walkDecls(() => void declarations++);
    return {
      path: file.path,
      bytes: Buffer.byteLength(file.content),
      gzip: gzipSync(file.content).length,
      rules,
      declarations,
    };
  });
  const issues: QualityIssue[] = sizes
    .filter((s) => s.bytes > SIZE_LIMITS.file)
    .map((s) => ({
      check: "size",
      severity: "warning",
      message: `${Math.round(s.bytes / 1024)} KB is over the ${SIZE_LIMITS.file / 1024} KB guideline for one file`,
      path: s.path,
    }));
  const total = sizes.reduce((n, s) => n + s.bytes, 0);
  if (total > SIZE_LIMITS.total) {
    issues.push({
      check: "size",
      severity: "warning",
      message: `The package's CSS is ${Math.round(total / 1024)} KB, over the ${SIZE_LIMITS.total / 1024} KB guideline`,
    });
  }
  return { sizes, issues };
}
