import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EditGate } from "@/components/ReadOnly/EditGate";
import { PageHeader } from "@/components/PageHeader";
import ui from "@/components/ui/ui.module.css";
import { BreakpointEditor } from "@/components/BreakpointEditor/BreakpointEditor";
import { withoutIds } from "@/lib/breakpoints/presets";
import { getProject } from "@/lib/storage/projects";
import { listScaffoldTemplates } from "@/lib/storage/scaffoldTemplates";
import { saveBreakpointsAction } from "./actions";

export default function BreakpointsPage({ params }: PageProps<"/projects/[id]/breakpoints">) {
  return (
    <Suspense fallback={<p className={ui.muted}>Loading breakpoints…</p>}>
      <Loader params={params} />
    </Suspense>
  );
}

async function Loader({ params }: Pick<PageProps<"/projects/[id]/breakpoints">, "params">) {
  const { id } = await params;
  const [project, templates] = await Promise.all([getProject(id), listScaffoldTemplates()]);
  if (!project) notFound();

  return (
    <>
      <PageHeader
        title="Breakpoints"
        description={`Screen-size ranges for ${project.name}. Generated CSS uses these for its media queries. Use "Apply from template" to take a template's breakpoints.`}
      />
      <EditGate>
        <BreakpointEditor
          initialApproach={project.approach}
          initialBreakpoints={project.breakpoints.breakpoints}
          prefix={project.prefix}
          templates={templates.map((t) => ({
            id: t.id,
            name: t.name,
            breakpoints: withoutIds(t.breakpoints.breakpoints),
          }))}
          onSave={saveBreakpointsAction.bind(null, project.id)}
        />
      </EditGate>
    </>
  );
}
