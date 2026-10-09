import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EditGate } from "@/components/ReadOnly/EditGate";
import { PageHeader } from "@/components/PageHeader";
import ui from "@/components/ui/ui.module.css";
import { CSS_TEMPLATE_LABELS } from "@/lib/model";
import { mappableParts } from "@/lib/selectors/map";
import { getProject, getSite } from "@/lib/storage/projects";
import { getManifests } from "@/lib/templates/registry";
import { SelectorEditor, type EditorRow } from "./SelectorEditor";
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
  const manifests = getManifests();
  const rows: EditorRow[] = mappableParts(manifests).map((p) => ({
    ...p,
    componentName: CSS_TEMPLATE_LABELS[p.componentId],
    purpose:
      manifests[p.componentId].selectors.find((s) => s.selector === `.{{prefix}}-${p.part}`)
        ?.purpose ?? "",
  }));
  const suggestions = Object.fromEntries((data?.parts ?? []).map((p) => [p.part, p.suggestions]));

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
      <SiteReport data={data} />
      <h2 style={{ margin: "24px 0 12px", fontSize: "1.15rem" }}>Selectors</h2>
      <EditGate>
        <SelectorEditor
          projectId={project.id}
          prefix={project.prefix}
          rows={rows}
          suggestions={suggestions}
          saved={project.siteSelectors}
          found={data ? data.classes.map((c) => c.name) : null}
        />
      </EditGate>
    </>
  );
}
