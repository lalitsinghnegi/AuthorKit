import { Suspense } from "react";
import { PanelDownload, PanelExternal, PanelSection } from "@/components/AppShell/PanelSection";
import { ProjectNav } from "@/components/AppShell/ProjectNav";
import { getProject } from "@/lib/storage/projects";

export default function StyleGuideActions({ params }: PageProps<"/projects/[id]/styleguide">) {
  return (
    <Suspense fallback={null}>
      <Actions params={params} />
    </Suspense>
  );
}

async function Actions({ params }: Pick<PageProps<"/projects/[id]/styleguide">, "params">) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return null;
  return (
    <>
      <ProjectNav id={project.id} name={project.name} />
      <PanelSection title="Style guide">
        <PanelExternal href={`/api/projects/${project.id}/styleguide/style-guide/index.html`}>
          Open in new tab
        </PanelExternal>
        <PanelDownload href={`/api/projects/${project.id}/package`}>Download zip</PanelDownload>
      </PanelSection>
    </>
  );
}
