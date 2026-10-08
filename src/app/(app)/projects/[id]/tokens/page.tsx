import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EditGate } from "@/components/ReadOnly/EditGate";
import { PageHeader } from "@/components/PageHeader";
import ui from "@/components/ui/ui.module.css";
import { getProject, getTokens } from "@/lib/storage/projects";
import { getFigmaStatus } from "@/lib/storage/settings";
import { TokenReview } from "./TokenReview";

export default function TokensPage({ params }: PageProps<"/projects/[id]/tokens">) {
  return (
    <Suspense fallback={<p className={ui.muted}>Loading tokens…</p>}>
      <Loader params={params} />
    </Suspense>
  );
}

async function Loader({ params }: Pick<PageProps<"/projects/[id]/tokens">, "params">) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const [tokens, status] = await Promise.all([getTokens(id), getFigmaStatus()]);
  const sourceLinks = project.figmaLinks.filter((l) => l.scope !== "page").length;

  return (
    <>
      <PageHeader
        title="Design tokens"
        description="Values extracted from the linked Figma frames. Accept, override, rename or exclude each one; accepted and overridden tokens will fill the generated CSS."
      />
      <EditGate>
        <TokenReview
          projectId={project.id}
          initialTokens={tokens}
          figmaConnected={status.connected}
          sourceLinks={sourceLinks}
        />
      </EditGate>
    </>
  );
}
