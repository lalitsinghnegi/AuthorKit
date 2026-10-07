import type { CssTemplateId } from "@/lib/model";
import accordion from "@/templates/manifests/accordion.json";
import cta from "@/templates/manifests/cta.json";
import footer from "@/templates/manifests/footer.json";
import global from "@/templates/manifests/global.json";
import header from "@/templates/manifests/header.json";
import isi from "@/templates/manifests/isi.json";
import modals from "@/templates/manifests/modals.json";
import tokens from "@/templates/manifests/tokens.json";
import { ComponentManifest } from "./manifest";

const RAW: Record<CssTemplateId, unknown> = {
  tokens,
  global,
  header,
  footer,
  isi,
  modals,
  cta,
  accordion,
};

let cache: Record<CssTemplateId, ComponentManifest> | null = null;

/** All component manifests, validated once. */
export function getManifests(): Record<CssTemplateId, ComponentManifest> {
  cache ??= Object.fromEntries(
    Object.entries(RAW).map(([id, data]) => {
      const manifest = ComponentManifest.parse(data);
      if (manifest.id !== id) throw new Error(`Manifest ${id}.json declares id "${manifest.id}"`);
      return [id, manifest];
    }),
  ) as Record<CssTemplateId, ComponentManifest>;
  return cache;
}

export const getManifest = (id: CssTemplateId) => getManifests()[id];

/** Unvalidated manifest data, for schema tests. */
export const rawManifests = () => RAW;
