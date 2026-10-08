import { Suspense } from "react";
import { ProjectNav } from "@/components/AppShell/ProjectNav";
import { getProject } from "@/lib/storage/projects";

// "Add link" is rendered by FigmaLinksEditor via <PanelActions>.
export default function FigmaActions({ params }: PageProps<"/projects/[id]/figma">) {
  return (
    <Suspense fallback={null}>
      <Nav params={params} />
    </Suspense>
  );
}

async function Nav({ params }: Pick<PageProps<"/projects/[id]/figma">, "params">) {
  const { id } = await params;
  const project = await getProject(id);
  return project ? <ProjectNav id={project.id} name={project.name} /> : null;
}
