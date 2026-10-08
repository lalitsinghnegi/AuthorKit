import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EditGate } from "@/components/ReadOnly/EditGate";
import { PageHeader } from "@/components/PageHeader";
import ui from "@/components/ui/ui.module.css";
import { getProject } from "@/lib/storage/projects";
import { BreakpointEditor } from "./BreakpointEditor";

export default function BreakpointsPage({ params }: PageProps<"/projects/[id]/breakpoints">) {
  return (
    <Suspense fallback={<p className={ui.muted}>Loading breakpoints…</p>}>
      <Loader params={params} />
    </Suspense>
  );
}

async function Loader({ params }: Pick<PageProps<"/projects/[id]/breakpoints">, "params">) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  return (
    <>
      <PageHeader
        title="Breakpoints"
        description={`Screen-size ranges for ${project.name}. Generated CSS uses these for its media queries.`}
      />
      <EditGate>
        <BreakpointEditor
          projectId={project.id}
          initialApproach={project.approach}
          initialBreakpoints={project.breakpoints.breakpoints}
          prefix={project.prefix}
        />
      </EditGate>
    </>
  );
}
