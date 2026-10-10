import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser, isAdmin } from "@/lib/auth/session";
import { PageHeader } from "@/components/PageHeader";
import { ScaffoldEditor } from "@/components/ScaffoldEditor/ScaffoldEditor";
import ui from "@/components/ui/ui.module.css";
import { generatedRootEntries } from "@/lib/generator/naming";
import { getProject } from "@/lib/storage/projects";
import { listScaffoldTemplates } from "@/lib/storage/scaffoldTemplates";
import { saveProjectScaffoldAction, saveScaffoldAsPresetAction } from "./actions";

export default function ProjectScaffoldPage({ params }: PageProps<"/projects/[id]/scaffold">) {
  return (
    <Suspense fallback={<p className={ui.muted}>Loading scaffold…</p>}>
      <Loader params={params} />
    </Suspense>
  );
}

async function Loader({ params }: Pick<PageProps<"/projects/[id]/scaffold">, "params">) {
  const { id } = await params;
  const [project, presets, user] = await Promise.all([
    getProject(id),
    listScaffoldTemplates(),
    getCurrentUser(),
  ]);
  if (!project) notFound();

  return (
    <>
      <PageHeader
        title="Scaffold"
        description={`Folder structure of the ${project.brandName} package and which CSS template fills each file.`}
      />
      <ScaffoldEditor
        initialTree={project.scaffold}
        readOnly={!isAdmin(user)}
        onSave={saveProjectScaffoldAction.bind(null, project.id)}
        presets={presets.map((p) => ({ id: p.id, name: p.name, tree: p.tree }))}
        onSaveAsPreset={saveScaffoldAsPresetAction.bind(null, project.id)}
        autoRootFiles={generatedRootEntries(project)}
      />
    </>
  );
}
