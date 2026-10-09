import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EditGate } from "@/components/ReadOnly/EditGate";
import { PageHeader } from "@/components/PageHeader";
import ui from "@/components/ui/ui.module.css";
import { BusyError, buildForUser } from "@/lib/generator/limit";
import { requireUser } from "@/lib/auth/session";
import { BusyNote } from "@/components/BusyNote";
import { defaultNpmName, zipFileName } from "@/lib/generator/naming";
import { getProject } from "@/lib/storage/projects";
import { GenerateView } from "./GenerateView";
import { PackageOptions } from "./PackageOptions";

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

  const user = await requireUser();
  let pkg;
  try {
    pkg = await buildForUser(project, user.id);
  } catch (err) {
    if (err instanceof BusyError) return <BusyNote message={err.message} />;
    throw err;
  }
  const encoder = new TextEncoder();
  const file = typeof query.file === "string" ? query.file : undefined;

  return (
    <>
      <PageHeader
        title="Generate"
        description={`Preview the ${project.brandName} package and download it as a zip. Nothing is stored; the package is built fresh each time.`}
      />
      {project.siteSelectors?.enabled && (
        <p className={ui.hint} style={{ marginTop: 0 }} role="note">
          Site selectors are on:{" "}
          {project.siteSelectors.mappings.filter((m) => m.state === "confirmed").length} template
          classes are replaced by classes from the site. Change this under{" "}
          <Link href={`/projects/${project.id}/site`}>Site structure</Link>.
        </p>
      )}
      <EditGate>
        <PackageOptions
          projectId={project.id}
          initial={
            project.npm ?? { enabled: false, name: defaultNpmName(project), version: "1.0.0" }
          }
        />
      </EditGate>
      <div style={{ height: 20 }} />
      <GenerateView
        projectId={project.id}
        zipName={zipFileName(project)}
        scaffold={project.scaffold}
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
