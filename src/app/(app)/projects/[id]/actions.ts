"use server";

import { audit } from "@/lib/audit/log";
import { actorOf, checkAdmin } from "@/lib/auth/session";
import { SiteUrl } from "@/lib/model";
import { getProject, updateProject } from "@/lib/storage/projects";

export type SiteUrlResult = { ok: true; siteUrl?: string } | { ok: false; error: string };

/** Save or clear (empty input) the project's published site URL. */
export async function saveSiteUrlAction(projectId: string, raw: unknown): Promise<SiteUrlResult> {
  const auth = await checkAdmin();
  if (!auth.user) return { ok: false, error: auth.denied };
  const text = String(raw ?? "").trim();
  let siteUrl: string | undefined;
  if (text) {
    const parsed = SiteUrl.safeParse(text);
    if (!parsed.success)
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid URL" };
    siteUrl = parsed.data;
  }
  if (!(await getProject(projectId))) return { ok: false, error: "This project no longer exists." };
  await updateProject(projectId, (p) => ({ ...p, siteUrl }));
  await audit(actorOf(auth.user), {
    action: "project.site_url",
    target: { type: "project", id: projectId },
    details: siteUrl ? `site ${new URL(siteUrl).host}` : "site removed",
  });
  return { ok: true, siteUrl };
}
