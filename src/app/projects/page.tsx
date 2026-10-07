import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import ui from "@/components/ui/ui.module.css";
import { listProjects } from "@/lib/storage/projects";

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        title="Projects"
        description="Each project has its own brand, CSS prefix, breakpoints, scaffold and Figma links."
      />
      <Suspense fallback={<p className={ui.muted}>Loading projects…</p>}>
        <ProjectList />
      </Suspense>
    </>
  );
}

async function ProjectList() {
  const { projects, invalid } = await listProjects();

  return (
    <>
      {invalid.length > 0 && (
        <p role="alert" className={ui.error}>
          {invalid.length} project folder(s) could not be read: {invalid.join(", ")}
        </p>
      )}
      {projects.length === 0 ? (
        <div className={ui.card}>
          <p style={{ marginTop: 0 }}>No projects yet.</p>
          <Link href="/projects/new">Create your first project</Link>
        </div>
      ) : (
        <ul className={ui.grid} style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className={`${ui.card} ${ui.cardLink}`}>
                <h2 className={ui.cardTitle}>{p.name}</h2>
                <div className={ui.muted}>{p.brandName}</div>
                <div className={ui.meta}>
                  <span className={`${ui.badge} ${ui.code}`}>.{p.prefix}-*</span>
                  <span className={ui.badge}>{p.approach}</span>
                  <span className={ui.badge}>{p.breakpoints.breakpoints.length} breakpoints</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
