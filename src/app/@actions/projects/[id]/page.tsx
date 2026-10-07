import { Suspense } from "react";
import { DeleteProjectButton } from "@/components/AppShell/DeleteProjectButton";
import { PanelDownload, PanelLink, PanelSection } from "@/components/AppShell/PanelSection";
import { getProject } from "@/lib/storage/projects";

export default function ProjectActions({ params }: PageProps<"/projects/[id]">) {
  return (
    <Suspense fallback={null}>
      <Actions params={params} />
    </Suspense>
  );
}

async function Actions({ params }: Pick<PageProps<"/projects/[id]">, "params">) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return null;

  return (
    <PanelSection title="Project">
      <PanelDownload href={`/api/projects/${project.id}/export`}>Export project.json</PanelDownload>
      <DeleteProjectButton id={project.id} name={project.name} />
      <PanelLink href="/projects" variant="secondary">
        All projects
      </PanelLink>
    </PanelSection>
  );
}
