import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { audit } from "@/lib/audit/log";
import { actorOf, apiUser } from "@/lib/auth/session";
import { BusyError, buildForUser } from "@/lib/generator/limit";
import { zipFileName } from "@/lib/generator/naming";
import { zipStream } from "@/lib/generator/zip";
import { getProject } from "@/lib/storage/projects";

/** Stream the generated package as a zip. Nothing is written to disk. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/projects/[id]/package">) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  let pkg;
  try {
    pkg = await buildForUser(project, user.id);
  } catch (err) {
    if (!(err instanceof BusyError)) throw err;
    return Response.json({ error: err.message }, { status: 429, headers: { "Retry-After": "5" } });
  }
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
  await audit(actorOf(user), {
    action: "package.download",
    target: { type: "project", id: project.id, name: project.name },
    details: `${pkg.files.length} files${project.npm?.enabled ? `, npm ${project.npm.name}@${project.npm.version}` : ""}`,
  });
  const body = Readable.toWeb(zipStream(pkg)) as ReadableStream<Uint8Array>;
  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFileName(project)}"`,
      "Cache-Control": "no-store",
    },
  });
}
