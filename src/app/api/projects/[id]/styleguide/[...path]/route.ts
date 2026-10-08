import type { NextRequest } from "next/server";
import { buildPackage } from "@/lib/generator/build";
import { loadGenerationInputs } from "@/lib/generator/load";
import { generateStyleGuide } from "@/lib/styleguide/generate";
import { getProject } from "@/lib/storage/projects";

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  md: "text/markdown; charset=utf-8",
};

const page = (status: number, title: string, message: string) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;padding:24px"><h1 style="font-size:1.2rem">${title}</h1><p>${message}</p></body></html>`,
    { status, headers: { "Content-Type": TYPES.html, "Cache-Control": "no-store" } },
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
  const { id, path } = await ctx.params;
  const project = await getProject(id);
  if (!project) return page(404, "Project not found", "This project no longer exists.");

  const pkg = await buildPackage(project, await loadGenerationInputs(project.id));
  if (pkg.files.length === 0) {
    return page(
      409,
      "The package has errors",
      "Fix the problems shown on the Generate screen to see the style guide.",
    );
  }
  const files = [...pkg.files, ...generateStyleGuide(project, pkg.files, pkg.report?.extras)];

  // Exact match against generated paths only: "..", absolute paths or anything else is a 404.
  const wanted = path.map((p) => decodeURIComponent(p)).join("/");
  const file = files.find((f) => f.path === wanted);
  if (!file)
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  const ext = file.path.split(".").pop() ?? "";
  return new Response(file.content, {
    headers: {
      "Content-Type": TYPES[ext] ?? "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
