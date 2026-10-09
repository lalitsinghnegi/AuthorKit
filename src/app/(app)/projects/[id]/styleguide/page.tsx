import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import ui from "@/components/ui/ui.module.css";
import { BusyError, buildForUser } from "@/lib/generator/limit";
import { requireUser } from "@/lib/auth/session";
import { BusyNote } from "@/components/BusyNote";
import { getProject } from "@/lib/storage/projects";
import styles from "./styleguide.module.css";

export default function StyleGuidePage({ params }: PageProps<"/projects/[id]/styleguide">) {
  return (
    <Suspense fallback={<p className={ui.muted}>Building the style guide…</p>}>
      <Loader params={params} />
    </Suspense>
  );
}

async function Loader({ params }: Pick<PageProps<"/projects/[id]/styleguide">, "params">) {
  const { id } = await params;
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
  const src = `/api/projects/${project.id}/styleguide/style-guide/index.html`;
  const generate = `/projects/${project.id}/generate`;

  return (
    <>
      <PageHeader
        title="Style guide"
        description="Live components, classes and tokens for developers, generated from the same package they download."
      />
      {pkg.files.length === 0 ? (
        <p role="alert" className={ui.error}>
          The package has errors, so there is no style guide yet.{" "}
          <Link href={generate}>See the problems on Generate</Link>.
        </p>
      ) : (
        <>
          {pkg.blocked && (
            <p role="alert" className={ui.error}>
              Quality checks found errors, so the package cannot be downloaded yet. The guide shows
              the current output. <Link href={generate}>See the problems on Generate</Link>.
            </p>
          )}
          <iframe className={styles.frame} src={src} title={`${project.brandName} style guide`} />
        </>
      )}
    </>
  );
}
