import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import ui from "@/components/ui/ui.module.css";
import type { TreeNode } from "@/lib/model";
import { getProject } from "@/lib/storage/projects";

export default function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  return (
    <Suspense fallback={<p className={ui.muted}>Loading project…</p>}>
      <ProjectOverview params={params} />
    </Suspense>
  );
}

async function ProjectOverview({ params }: Pick<PageProps<"/projects/[id]">, "params">) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  return (
    <>
      <PageHeader title={project.name} description={project.description} />
      <div className={ui.sections}>
        <section className={ui.card} aria-labelledby="identity">
          <h2 id="identity" className={ui.sectionHeading}>
            Identity
          </h2>
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "max-content 1fr",
              gap: "6px 16px",
              margin: 0,
            }}
          >
            <dt className={ui.muted}>Brand</dt>
            <dd style={{ margin: 0 }}>{project.brandName}</dd>
            <dt className={ui.muted}>Prefix</dt>
            <dd style={{ margin: 0 }}>
              <code className={ui.code}>.{project.prefix}-btn</code>,{" "}
              <code className={ui.code}>--{project.prefix}-color-primary</code>
            </dd>
            <dt className={ui.muted}>Approach</dt>
            <dd style={{ margin: 0 }}>{project.approach}</dd>
          </dl>
        </section>

        <section className={ui.card} aria-labelledby="breakpoints">
          <h2 id="breakpoints" className={ui.sectionHeading}>
            Breakpoints <Link href={`/projects/${project.id}/breakpoints`}>Edit</Link>
          </h2>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Min width</th>
                <th scope="col">Max width</th>
              </tr>
            </thead>
            <tbody>
              {project.breakpoints.breakpoints.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{b.minWidth !== undefined ? `${b.minWidth}px` : "—"}</td>
                  <td>{b.maxWidth !== undefined ? `${b.maxWidth}px` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={ui.card} aria-labelledby="scaffold">
          <h2 id="scaffold" className={ui.sectionHeading}>
            Scaffold
          </h2>
          <ul className={ui.tree}>
            <Tree node={project.scaffold} />
          </ul>
        </section>

        <section className={ui.card} aria-labelledby="figma">
          <h2 id="figma" className={ui.sectionHeading}>
            Figma links
          </h2>
          <p className={ui.muted} style={{ margin: 0 }}>
            {project.figmaLinks.length === 0
              ? "No Figma links yet."
              : `${project.figmaLinks.length} link(s).`}
          </p>
        </section>
      </div>
    </>
  );
}

function Tree({ node }: { node: TreeNode }) {
  if (node.type === "file") {
    return (
      <li>
        📄 {node.name}
        {node.cssTemplateId && <span className={ui.muted}> ← {node.cssTemplateId}</span>}
      </li>
    );
  }
  return (
    <li>
      📁 {node.name}/
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <Tree key={child.id} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}
