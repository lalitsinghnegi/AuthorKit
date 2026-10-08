import { Suspense } from "react";
import { ProjectNav } from "@/components/AppShell/ProjectNav";
import { getProject } from "@/lib/storage/projects";

// Extract, Accept all, Save and Discard are rendered by TokenReview via <PanelActions>.
export default function TokensActions({ params }: PageProps<"/projects/[id]/tokens">) {
  return (
    <Suspense fallback={null}>
      <Nav params={params} />
    </Suspense>
  );
}

async function Nav({ params }: Pick<PageProps<"/projects/[id]/tokens">, "params">) {
  const { id } = await params;
  const project = await getProject(id);
  return project ? <ProjectNav id={project.id} name={project.name} /> : null;
}
