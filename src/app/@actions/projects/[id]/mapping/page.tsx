import { Suspense } from "react";
import { ProjectNav } from "@/components/AppShell/ProjectNav";
import { getProject } from "@/lib/storage/projects";

// Detect, previews, AI and Save are rendered by MappingView via <PanelActions>.
export default function MappingActions({ params }: PageProps<"/projects/[id]/mapping">) {
  return (
    <Suspense fallback={null}>
      <Nav params={params} />
    </Suspense>
  );
}

async function Nav({ params }: Pick<PageProps<"/projects/[id]/mapping">, "params">) {
  const { id } = await params;
  const project = await getProject(id);
  return project ? <ProjectNav id={project.id} name={project.name} /> : null;
}
