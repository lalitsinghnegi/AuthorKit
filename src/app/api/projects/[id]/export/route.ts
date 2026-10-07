import type { NextRequest } from "next/server";
import { slugify, exportProject } from "@/lib/storage/projects";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/projects/[id]/export">) {
  const { id } = await ctx.params;
  const data = await exportProject(id);
  if (!data) return Response.json({ error: "Project not found" }, { status: 404 });

  const fileName = `${slugify(data.project.brandName) || data.project.prefix}-project.json`;
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
