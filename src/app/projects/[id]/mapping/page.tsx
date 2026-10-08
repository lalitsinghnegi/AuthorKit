import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import ui from "@/components/ui/ui.module.css";
import { isLLMConfigured } from "@/lib/llm/server";
import { getProject } from "@/lib/storage/projects";
import { getFigmaStatus } from "@/lib/storage/settings";
import { MappingView } from "./MappingView";

export default function MappingPage({ params }: PageProps<"/projects/[id]/mapping">) {
  return (
    <Suspense fallback={<p className={ui.muted}>Loading component mapping…</p>}>
      <Loader params={params} />
    </Suspense>
  );
}

async function Loader({ params }: Pick<PageProps<"/projects/[id]/mapping">, "params">) {
  const { id } = await params;
  const [project, status] = await Promise.all([getProject(id), getFigmaStatus()]);
  if (!project) notFound();

  return (
    <>
      <PageHeader
        title="Components"
        description="Match the frames inside each Figma link to AuthorKit components. Suggestions come from frame names (and optionally AI); nothing is used until you confirm it."
      />
      <MappingView
        projectId={project.id}
        initialLinks={project.figmaLinks}
        breakpoints={Object.fromEntries(project.breakpoints.breakpoints.map((b) => [b.id, b.name]))}
        figmaConnected={status.connected}
        aiConfigured={isLLMConfigured()}
      />
    </>
  );
}
