"use server";

import { audit } from "@/lib/audit/log";
import { actorOf, checkAdmin } from "@/lib/auth/session";
import { MAX_SITE_PAGES, SCHEMA_VERSION, SitePath, type SiteFile } from "@/lib/model";
import { SITE_BUDGET, spend } from "@/lib/security/rateLimit";
import { analyzeSite, partsFromManifests } from "@/lib/site";
import { SiteError, type SitePage } from "@/lib/site/fetch";
import { getSiteReader } from "@/lib/site/server";
import { getProject, saveSite, updateProject } from "@/lib/storage/projects";
import { getManifests } from "@/lib/templates/registry";

export type SiteResult = { ok: true; data: SiteFile } | { ok: false; error: string };

/**
 * Read the site URL and the extra pages, find the classes that match each
 * template part, and save the result. Pages that fail are reported, not fatal.
 */
export async function readSiteAction(projectId: string): Promise<SiteResult> {
  const auth = await checkAdmin();
  if (!auth.user) return { ok: false, error: auth.denied };
  const overBudget = spend(SITE_BUDGET, auth.user.id);
  if (overBudget) return { ok: false, error: overBudget };
  const project = await getProject(projectId);
  if (!project) return { ok: false, error: "This project no longer exists." };
  if (!project.siteUrl)
    return { ok: false, error: "Add the site URL on the project overview first." };

  const base = new URL(project.siteUrl);
  const urls = [
    base.href,
    ...(project.sitePages ?? []).map((path) => new URL(path, base.origin).href),
  ].filter((u, i, all) => all.indexOf(u) === i);

  const reader = getSiteReader();
  const read: SitePage[] = [];
  const results: SiteFile["pages"] = [];
  for (const url of urls) {
    try {
      const page = await reader.readPage(url, base.hostname);
      read.push(page);
      results.push({ url, ok: true });
    } catch (err) {
      if (!(err instanceof SiteError)) throw err;
      results.push({ url, ok: false, error: err.message });
    }
  }
  if (read.length === 0) return { ok: false, error: results[0]?.error ?? "No pages to read." };

  const analysis = analyzeSite(read, partsFromManifests(getManifests()));
  // Pages in the analysis are the readable ones, in order; map their details back.
  let next = 0;
  const pages = results.map((r) => {
    if (!r.ok) return r;
    const summary = analysis.pages[next++];
    return { ...r, title: summary.title, elements: summary.elements };
  });
  // Suggestion page numbers index the readable pages; convert them to `pages` indexes.
  const okIndexes = pages.flatMap((p, i) => (p.ok ? [i] : []));
  const data: SiteFile = {
    schemaVersion: SCHEMA_VERSION,
    readAt: new Date().toISOString(),
    pages,
    parts: analysis.parts.map((part) => ({
      ...part,
      suggestions: part.suggestions.map((s) => ({ ...s, pages: s.pages.map((i) => okIndexes[i]) })),
    })),
    classes: analysis.classes,
    notes: analysis.notes,
  };
  await saveSite(projectId, data);
  const found = data.parts.filter((p) => p.suggestions.length > 0).length;
  await audit(actorOf(auth.user), {
    action: "site.read",
    target: { type: "project", id: project.id, name: project.name },
    details: `${read.length}/${urls.length} pages, ${found}/${data.parts.length} parts matched`,
  });
  return { ok: true, data };
}

export type PagesResult = { ok: true; pages: string[] } | { ok: false; error: string };

/** Save the extra page paths (one per line); each must be a path on the site. */
export async function saveSitePagesAction(projectId: string, raw: unknown): Promise<PagesResult> {
  const auth = await checkAdmin();
  if (!auth.user) return { ok: false, error: auth.denied };
  const lines = String(raw ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > MAX_SITE_PAGES)
    return { ok: false, error: `Add at most ${MAX_SITE_PAGES} pages.` };
  const pages: string[] = [];
  for (const line of lines) {
    const parsed = SitePath.safeParse(line);
    if (!parsed.success)
      return { ok: false, error: `"${line.slice(0, 80)}": ${parsed.error.issues[0]?.message}` };
    if (!pages.includes(parsed.data)) pages.push(parsed.data);
  }
  if (!(await getProject(projectId))) return { ok: false, error: "This project no longer exists." };
  await updateProject(projectId, (p) => ({ ...p, sitePages: pages.length ? pages : undefined }));
  await audit(actorOf(auth.user), {
    action: "site.pages",
    target: { type: "project", id: projectId },
    details: `${pages.length} extra page${pages.length === 1 ? "" : "s"}`,
  });
  return { ok: true, pages };
}
