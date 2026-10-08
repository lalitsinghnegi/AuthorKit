import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import ui from "@/components/ui/ui.module.css";
import { buildPackage } from "@/lib/generator/build";
import { loadGenerationInputs } from "@/lib/generator/load";
import { README_NAME, entryFileName, zipFileName } from "@/lib/generator/naming";
import { getProject } from "@/lib/storage/projects";
import { GenerateView } from "./GenerateView";

export default function GeneratePage(props: PageProps<"/projects/[id]/generate">) {
  return (
    <Suspense fallback={<p className={ui.muted}>Generating package…</p>}>
      <Loader {...props} />
    </Suspense>
  );
}

async function Loader({ params, searchParams }: PageProps<"/projects/[id]/generate">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const project = await getProject(id);
  if (!project) notFound();

  const pkg = await buildPackage(project, await loadGenerationInputs(project.id));
  const encoder = new TextEncoder();
  const file = typeof query.file === "string" ? query.file : undefined;

  return (
    <>
      <PageHeader
        title="Generate"
        description={`Preview the ${project.brandName} package and download it as a zip. Nothing is stored; the package is built fresh each time.`}
      />
      <GenerateView
        projectId={project.id}
        zipName={zipFileName(project)}
        scaffold={project.scaffold}
        autoFiles={[entryFileName(project), README_NAME]}
        approach={project.approach}
        breakpointCount={project.breakpoints.breakpoints.length}
        problems={pkg.problems}
        blocked={pkg.blocked}
        files={pkg.files.map((f) => ({ ...f, size: encoder.encode(f.content).length }))}
        initialPath={file}
        report={pkg.report}
        quality={pkg.quality}
        prefix={project.prefix}
      />
    </>
  );
}
