import type { NextRequest } from "next/server";
import { apiUser } from "@/lib/auth/session";
import { BusyError, buildForUser } from "@/lib/generator/limit";
import { STYLE_GUIDE_CSP } from "@/lib/security/headers";
import { getProject } from "@/lib/storage/projects";

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  md: "text/markdown; charset=utf-8",
};

const HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": STYLE_GUIDE_CSP,
  "X-Content-Type-Options": "nosniff",
};

/** Decoded path, or null for malformed escapes such as "%E0%A4%A". */
function decodePath(segments: string[]): string | null {
  try {
    return segments.map((p) => decodeURIComponent(p)).join("/");
  } catch {
    return null;
  }
}

const page = (status: number, title: string, message: string) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;padding:24px"><h1 style="font-size:1.2rem">${title}</h1><p>${message}</p></body></html>`,
    { status, headers: { ...HEADERS, "Content-Type": TYPES.html } },
  );

/**
 * Serves the style guide and the package it documents from one virtual
 * folder (the package root), so the guide's relative links resolve exactly
 * as they will inside the downloaded zip. Only generated files are served.
 */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/styleguide/[...path]">,
) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const { id, path } = await ctx.params;
  const project = await getProject(id);
  if (!project) return page(404, "Project not found", "This project no longer exists.");

  let pkg;
  try {
    pkg = await buildForUser(project, user.id);
  } catch (err) {
    if (!(err instanceof BusyError)) throw err;
    return Response.json({ error: err.message }, { status: 429, headers: { "Retry-After": "5" } });
  }
  if (pkg.files.length === 0) {
    return page(
      409,
      "The package has errors",
      "Fix the problems shown on the Generate screen to see the style guide.",
    );
  }
  // Exact match against generated paths only (the package includes style-guide/):
  // "..", absolute paths, bad escapes or anything else is a 404.
  const wanted = decodePath(path);
  const file = wanted === null ? undefined : pkg.files.find((f) => f.path === wanted);
  if (!file) return new Response("Not found", { status: 404, headers: HEADERS });

  const ext = file.path.split(".").pop() ?? "";
  return new Response(file.content, {
    headers: { ...HEADERS, "Content-Type": TYPES[ext] ?? "text/plain; charset=utf-8" },
  });
}
