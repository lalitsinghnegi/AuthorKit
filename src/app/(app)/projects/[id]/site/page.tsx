import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EditGate } from "@/components/ReadOnly/EditGate";
import { PageHeader } from "@/components/PageHeader";
import ui from "@/components/ui/ui.module.css";
import { getProject, getSite } from "@/lib/storage/projects";
import { SiteActions } from "./SiteActions";
import { SiteReport } from "./SiteReport";

export default function SitePage({ params }: PageProps<"/projects/[id]/site">) {
  return (
    <Suspense fallback={<p className={ui.muted}>Loading site structure…</p>}>
      <Loader params={params} />
    </Suspense>
  );
}

async function Loader({ params }: Pick<PageProps<"/projects/[id]/site">, "params">) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const data = await getSite(id);

  return (
    <>
      <PageHeader
        title="Site structure"
        description="Reads the published site and suggests which of its classes play the role of each template part, so the CSS can target the real AEM markup."
      />
      {!project.siteUrl ? (
        <p className={ui.hint} style={{ marginTop: 0 }}>
          Add the site URL on the <Link href={`/projects/${project.id}`}>project overview</Link> to
          read the site.
        </p>
      ) : (
        <EditGate>
          <SiteActions
            projectId={project.id}
            siteUrl={project.siteUrl}
            pages={project.sitePages ?? []}
          />
        </EditGate>
      )}
      <SiteReport prefix={project.prefix} data={data} />
    </>
  );
}
