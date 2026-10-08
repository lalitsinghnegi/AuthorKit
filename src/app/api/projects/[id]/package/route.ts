import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { buildPackage } from "@/lib/generator/build";
import { loadGenerationInputs } from "@/lib/generator/load";
import { zipFileName } from "@/lib/generator/naming";
import { zipStream } from "@/lib/generator/zip";
import { getProject } from "@/lib/storage/projects";

/** Stream the generated package as a zip. Nothing is written to disk. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/projects/[id]/package">) {
  const { id } = await ctx.params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  const pkg = await buildPackage(project, await loadGenerationInputs(project.id));
  if (pkg.blocked) {
    return Response.json(
      {
        error: "The package has errors and cannot be downloaded",
        problems: pkg.problems,
        quality: pkg.quality?.issues.filter((i) => i.severity === "error") ?? [],
      },
      { status: 409 },
    );
  }
  const body = Readable.toWeb(zipStream(pkg)) as ReadableStream<Uint8Array>;
  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFileName(project)}"`,
      "Cache-Control": "no-store",
    },
  });
}
