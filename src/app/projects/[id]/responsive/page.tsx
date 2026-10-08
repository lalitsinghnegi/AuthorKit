import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import ui from "@/components/ui/ui.module.css";
import { collectFrameRefs } from "@/lib/responsive";
import { getProject, getResponsive } from "@/lib/storage/projects";
import { getFigmaStatus } from "@/lib/storage/settings";
import { ResponsiveActions } from "./ResponsiveActions";
import { ResponsiveReport } from "./ResponsiveReport";

export default function ResponsivePage({ params }: PageProps<"/projects/[id]/responsive">) {
  return (
    <Suspense fallback={<p className={ui.muted}>Loading responsive values…</p>}>
      <Loader params={params} />
    </Suspense>
  );
}

async function Loader({ params }: Pick<PageProps<"/projects/[id]/responsive">, "params">) {
  const { id } = await params;
  const [project, status] = await Promise.all([getProject(id), getFigmaStatus()]);
  if (!project) notFound();
  const data = await getResponsive(id);
  const confirmedFrames = collectFrameRefs(project).length;

  return (
    <>
      <PageHeader
        title="Responsive"
        description="Values read from the confirmed frames at each breakpoint. Base styles come from the first breakpoint; media queries hold only what changes."
      />
      <ResponsiveActions
        projectId={project.id}
        canExtract={status.connected && confirmedFrames > 0}
        confirmedFrames={confirmedFrames}
        figmaConnected={status.connected}
      />
      <ResponsiveReport project={project} data={data} />
    </>
  );
}
