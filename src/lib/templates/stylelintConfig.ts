import type { Config } from "stylelint";

/** BEM: prefix-block[__element][--modifier], lowercase kebab parts. */
export function bemClassPattern(prefix: string): RegExp {
  const part = "[a-z0-9]+(?:-[a-z0-9]+)*";
  return new RegExp(`^${prefix}-${part}(?:__${part})?(?:--${part})?$`);
}

/** Lint rules for generated packages (also used by the quality gates later). */
export function outputStylelintConfig(prefix: string, siteClasses: readonly string[] = []): Config {
  const bem = bemClassPattern(prefix);
  // Site classes chosen on the Site structure screen are allowed as they are.
  const classPattern = siteClasses.length
    ? new RegExp(
        `(?:${bem.source})|^(?:${siteClasses.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`,
      )
    : bem;
  return {
    extends: ["stylelint-config-standard"],
    rules: {
      "selector-class-pattern": [
        classPattern,
        {
          message: (c: string) =>
            `Class ".${c.replace(/^\./, "")}" must be BEM with the "${prefix}-" prefix`,
        },
      ],
      "custom-property-pattern": [
        new RegExp(`^${prefix}-[a-z0-9]+(?:-[a-z0-9]+)*$`),
        { message: (p: string) => `Custom property "--${p}" must start with "--${prefix}-"` },
      ],
      // Generated files carry a preserved /*! header and marker comments; spacing is ours to choose.
      "comment-empty-line-before": null,
      // Element styles in global.css intentionally precede class-based components.
      "no-descending-specificity": null,
      // (min-width: …) is used on purpose: range syntax (width >= …) is newer and less widely supported.
      "media-feature-range-notation": "prefix",
    },
  };
}
