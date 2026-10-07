import { Suspense } from "react";
import { ProjectNav } from "@/components/AppShell/ProjectNav";
import { getProject } from "@/lib/storage/projects";

// Editor actions are rendered by the ScaffoldEditor via <PanelActions>.
export default function ScaffoldActions({ params }: PageProps<"/projects/[id]/scaffold">) {
  return (
    <Suspense fallback={null}>
      <Nav params={params} />
    </Suspense>
  );
}

async function Nav({ params }: Pick<PageProps<"/projects/[id]/scaffold">, "params">) {
  const { id } = await params;
  const project = await getProject(id);
  return project ? <ProjectNav id={project.id} name={project.name} /> : null;
}
