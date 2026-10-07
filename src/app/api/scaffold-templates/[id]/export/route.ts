import type { NextRequest } from "next/server";
import type { ScaffoldExport } from "@/lib/model";
import { getScaffoldTemplate } from "@/lib/storage/scaffoldTemplates";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/scaffold-templates/[id]/export">,
) {
  const { id } = await ctx.params;
  const template = await getScaffoldTemplate(id);
  if (!template) return Response.json({ error: "Preset not found" }, { status: 404 });

  const body: ScaffoldExport = {
    schemaVersion: 1,
    kind: "authorkit-scaffold",
    template: { ...template, builtIn: false },
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${template.id}-scaffold.json"`,
    },
  });
}
