import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import ui from "@/components/ui/ui.module.css";
import type { ScaffoldTemplate, TreeNode } from "@/lib/model";
import { listScaffoldTemplates } from "@/lib/storage/scaffoldTemplates";
import { getManifests, manifestClasses } from "@/lib/templates";

export default function TemplatesPage() {
  return (
    <>
      <PageHeader
        title="Templates"
        description="Scaffold presets give new projects a starting folder structure. CSS templates are the stylesheets the generator fills with each project's values."
      />
      <Suspense fallback={<p className={ui.muted}>Loading presets…</p>}>
        <PresetList />
      </Suspense>
    </>
  );
}

async function PresetList() {
  const presets = await listScaffoldTemplates();
  const builtIn = presets.filter((p) => p.builtIn);
  const custom = presets.filter((p) => !p.builtIn);

  return (
    <div className={ui.sections}>
      <Group title="Built-in presets" presets={builtIn} />
      <Group
        title="Custom presets"
        presets={custom}
        empty="No custom presets yet. Create one, duplicate a built-in preset, or save a project's scaffold as a preset."
      />
      <CssTemplateList />
    </div>
  );
}

function Group({
  title,
  presets,
  empty,
}: {
  title: string;
  presets: ScaffoldTemplate[];
  empty?: string;
}) {
  return (
    <section aria-label={title}>
      <h2 className={ui.sectionHeading}>{title}</h2>
      {presets.length === 0 ? (
        <p className={ui.muted}>{empty}</p>
      ) : (
        <ul className={ui.grid} style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {presets.map((p) => (
            <li key={p.id}>
              <Link href={`/templates/scaffolds/${p.id}`} className={`${ui.card} ${ui.cardLink}`}>
                <h3 className={ui.cardTitle}>{p.name}</h3>
                {p.description && <div className={ui.muted}>{p.description}</div>}
                <div className={ui.meta}>
                  <span className={ui.badge}>{countFiles(p.tree)} files</span>
                  {p.builtIn && <span className={ui.badge}>read-only</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function countFiles(node: TreeNode): number {
  return node.type === "file" ? 1 : node.children.reduce((n, c) => n + countFiles(c), 0);
}

function CssTemplateList() {
  const manifests = Object.values(getManifests());
  return (
    <section aria-label="CSS templates">
      <h2 className={ui.sectionHeading}>CSS templates (built-in)</h2>
      <ul className={ui.grid} style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {manifests.map((m) => (
          <li key={m.id} className={ui.card}>
            <h3 className={ui.cardTitle}>{m.name}</h3>
            <div className={ui.muted}>{m.description}</div>
            <div className={ui.meta}>
              <span className={`${ui.badge} ${ui.code}`}>{m.fileName}</span>
              <span className={ui.badge}>{manifestClasses(m, "x").length} classes</span>
              <span className={ui.badge}>{m.variables.length} variables</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
