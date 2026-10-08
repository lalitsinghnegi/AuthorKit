import { Suspense } from "react";
import { ProjectNav } from "@/components/AppShell/ProjectNav";
import { getProject } from "@/lib/storage/projects";

// Editor actions (Save, Fix all, …) are rendered by the editor itself via <PanelActions>.
export default function BreakpointsActions({ params }: PageProps<"/projects/[id]/breakpoints">) {
  return (
    <Suspense fallback={null}>
      <Nav params={params} />
    </Suspense>
  );
}

async function Nav({ params }: Pick<PageProps<"/projects/[id]/breakpoints">, "params">) {
  const { id } = await params;
  const project = await getProject(id);
  return project ? <ProjectNav id={project.id} name={project.name} /> : null;
}
