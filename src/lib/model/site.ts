import { z } from "zod";
import { IsoDate, SchemaVersion } from "./common";
import { CssTemplateId } from "./cssTemplate";

export const MAX_SITE_PAGES = 20;

/**
 * An extra page on the project's site, as a path such as "/en/safety.html".
 * Always resolved against the site URL, so it can never point to another host.
 */
export const SitePath = z
  .string()
  .trim()
  .max(1024, "Paths are at most 1024 characters")
  .regex(
    /^\/(?!\/)[^\s\\]*$/,
    "Use a path on the site that starts with /, such as /en/safety.html",
  );

/** A class selector found on the site, e.g. ".cmp-accordion__button". */
export const SiteSelector = z
  .string()
  .max(200)
  .regex(/^\.-?[_a-zA-Z][_a-zA-Z0-9-]*$/, "Use one class selector, such as .cmp-button");

export const SiteSuggestion = z.object({
  selector: SiteSelector,
  /** Elements with this class across all pages read. */
  count: z.int().min(0),
  /** Indexes into SiteFile.pages. */
  pages: z.array(z.int().min(0)).max(50),
  confidence: z.enum(["high", "medium", "low"]),
  reason: z.string().max(300),
  /** Short, simplified markup of the first match (text only, shown escaped). */
  sample: z.string().max(1200),
});
export type SiteSuggestion = z.infer<typeof SiteSuggestion>;

export const SitePart = z.object({
  componentId: CssTemplateId,
  /** The template class without the prefix, e.g. "accordion__trigger". */
  part: z.lazy(() => PartKey),
  kind: z.enum(["block", "element", "modifier"]),
  suggestions: z.array(SiteSuggestion).max(5),
});
export type SitePart = z.infer<typeof SitePart>;

export const SitePageResult = z.object({
  url: z.url().max(3072),
  ok: z.boolean(),
  /** Fixed, safe text when the page could not be read. */
  error: z.string().max(300).optional(),
  title: z.string().max(300).optional(),
  elements: z.int().min(0).optional(),
});
export type SitePageResult = z.infer<typeof SitePageResult>;

/** data/projects/<id>/site.json: what was found on the site the last time it was read. */
export const SiteFile = z.object({
  schemaVersion: SchemaVersion,
  readAt: IsoDate,
  pages: z.array(SitePageResult).max(MAX_SITE_PAGES + 1),
  parts: z.array(SitePart).max(200),
  /** Most used classes on the site, for reference when choosing selectors. */
  classes: z.array(z.object({ name: z.string().max(200), count: z.int().min(0) })).max(2000),
  notes: z.array(z.string().max(500)).max(100),
});
export type SiteFile = z.infer<typeof SiteFile>;

/** A template class without the prefix, e.g. "accordion__trigger" or "btn--primary". */
export const PartKey = z.string().regex(/^[a-z][a-z0-9-]*(?:__[a-z0-9-]+)?(?:--[a-z0-9-]+)?$/);

/**
 * The admin's decision for one template part: use this site class instead
 * (confirmed), or keep the template class (ignored). `scoped` limits an
 * element to inside its component's block, e.g. ".cmp-experiencefragment--header
 * .cmp-image" for the header logo, when the site uses the class elsewhere too.
 */
export const SelectorMapping = z
  .object({
    componentId: CssTemplateId,
    part: PartKey,
    state: z.enum(["confirmed", "ignored"]),
    selector: SiteSelector.optional(),
    scoped: z.boolean(),
  })
  .refine((m) => m.state !== "confirmed" || m.selector !== undefined, {
    message: "A confirmed mapping needs a site class",
    path: ["selector"],
  });
export type SelectorMapping = z.infer<typeof SelectorMapping>;

export const SiteSelectors = z.object({
  /** Use the confirmed site classes in the generated CSS, style guide and sample page. */
  enabled: z.boolean(),
  mappings: z.array(SelectorMapping).max(200),
});
export type SiteSelectors = z.infer<typeof SiteSelectors>;
