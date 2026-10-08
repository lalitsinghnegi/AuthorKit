import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import ui from "@/components/ui/ui.module.css";
import { getProject } from "@/lib/storage/projects";
import { getFigmaStatus } from "@/lib/storage/settings";
import { FigmaLinksEditor } from "./FigmaLinksEditor";

export default function FigmaLinksPage({ params }: PageProps<"/projects/[id]/figma">) {
  return (
    <Suspense fallback={<p className={ui.muted}>Loading Figma links…</p>}>
      <Loader params={params} />
    </Suspense>
  );
}

async function Loader({ params }: Pick<PageProps<"/projects/[id]/figma">, "params">) {
  const { id } = await params;
  const [project, status] = await Promise.all([getProject(id), getFigmaStatus()]);
  if (!project) notFound();

  return (
    <>
      <PageHeader
        title="Figma links"
        description="Link the Figma frames for global styles, each page and each component, and tag the screen size each frame represents."
      />
      <FigmaLinksEditor
        projectId={project.id}
        initialLinks={project.figmaLinks}
        breakpoints={project.breakpoints.breakpoints.map((b) => ({ id: b.id, name: b.name }))}
        figmaConnected={status.connected}
      />
    </>
  );
}
