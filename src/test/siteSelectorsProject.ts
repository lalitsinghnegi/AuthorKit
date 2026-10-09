import { readFileSync } from "node:fs";
import type { Project, SelectorMapping } from "@/lib/model";
import { analyzeSite, partsFromManifests } from "@/lib/site";
import { getManifests } from "@/lib/templates/registry";
import { project } from "./figmaProject";

/** Confirm every high-confidence suggestion from the AEM fixtures, and scope the header logo. */
export function mappedProject(enabled = true): Project {
  const pages = ["aem-home", "aem-safety"].map((n) => ({
    url: `https://www.acme.com/${n}.html`,
    html: readFileSync(`src/test/fixtures/site/${n}.html`, "utf8"),
  }));
  const { parts } = analyzeSite(pages, partsFromManifests(getManifests()));
  const mappings: SelectorMapping[] = parts.flatMap((p) => {
    const best = p.suggestions[0];
    return best?.confidence === "high"
      ? [
          {
            componentId: p.componentId,
            part: p.part,
            selector: best.selector,
            scoped: false,
            state: "confirmed" as const,
          },
        ]
      : [];
  });
  mappings.push(
    {
      componentId: "header",
      part: "header",
      selector: ".cmp-experiencefragment--header",
      scoped: false,
      state: "confirmed",
    },
    {
      componentId: "header",
      part: "header__logo",
      selector: ".cmp-image",
      scoped: true,
      state: "confirmed",
    },
  );
  return { ...project("mobile-first"), siteSelectors: { enabled, mappings } };
}
