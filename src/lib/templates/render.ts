import { readFileSync } from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";
import type { CssTemplateId } from "@/lib/model";
import type { TemplateContext } from "./context";
import { getManifest } from "./registry";

const TEMPLATE_DIR = path.join(process.cwd(), "src", "templates");
const read = (...parts: string[]) => readFileSync(path.join(TEMPLATE_DIR, ...parts), "utf8");

let engine: typeof Handlebars | null = null;
const compiled = new Map<CssTemplateId, Handlebars.TemplateDelegate>();

function getEngine(): typeof Handlebars {
  if (engine) return engine;
  const hb = Handlebars.create();
  hb.registerPartial("fileHeader", read("partials", "fileHeader.hbs"));
  hb.registerPartial("responsive", read("partials", "responsive.hbs"));

  /** {{vars "header" "header"}} → base declarations of a component's responsive variables. */
  hb.registerHelper(
    "vars",
    function (component: string, suffix: string, options: Handlebars.HelperOptions) {
      const root = options.data.root as TemplateContext;
      const forComponent = root.componentBase[component as CssTemplateId];
      if (!forComponent) throw new Error(`vars: unknown component "${component}"`);
      const values = forComponent[suffix];
      if (!values)
        throw new Error(`vars: no responsive variables for "${component}" / "${suffix}"`);
      return Object.entries(values)
        .map(([name, value]) => `  --${root.prefix}-${name}: ${value};`)
        .join("\n");
    },
  );
  engine = hb;
  return hb;
}

function template(id: CssTemplateId): Handlebars.TemplateDelegate {
  let fn = compiled.get(id);
  if (!fn) {
    fn = getEngine().compile(read("css", `${id}.css.hbs`), { strict: true, noEscape: true });
    compiled.set(id, fn);
  }
  return fn;
}

/** Collapse blank-line runs and trailing spaces so whitespace never depends on template layout. */
export function normalizeCss(css: string): string {
  return (
    css
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}

/**
 * Render one CSS template. Same context in, byte-identical CSS out.
 * `fileName` is the path shown in the header; defaults to the manifest's file name.
 */
export function renderTemplate(id: CssTemplateId, ctx: TemplateContext, fileName?: string): string {
  const manifest = getManifest(id);
  const variables =
    id === "tokens"
      ? [...ctx.tokens, ...ctx.extraTokens].map((t) => `--${ctx.prefix}-${t.name}`)
      : manifest.variables.map((v) => `--${ctx.prefix}-${v}`);
  const css = template(id)({
    ...ctx,
    file: {
      id,
      name: fileName ?? manifest.fileName,
      title: manifest.name,
      variables,
      variablesVerb: id === "tokens" ? "defined" : "used",
    },
    hooks: id === "tokens" ? ctx.tokenHooks : ctx.componentHooks[id],
  });
  return normalizeCss(css);
}
