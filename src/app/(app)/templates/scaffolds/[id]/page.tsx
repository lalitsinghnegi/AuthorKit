import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser, isAdmin } from "@/lib/auth/session";
import { PageHeader } from "@/components/PageHeader";
import { ScaffoldEditor } from "@/components/ScaffoldEditor/ScaffoldEditor";
import ui from "@/components/ui/ui.module.css";
import { describeRange } from "@/lib/breakpoints";
import { getScaffoldTemplate } from "@/lib/storage/scaffoldTemplates";
import { saveScaffoldTemplateAction } from "../../actions";

export default function ScaffoldPresetPage({ params }: PageProps<"/templates/scaffolds/[id]">) {
  return (
    <Suspense fallback={<p className={ui.muted}>Loading preset…</p>}>
      <Loader params={params} />
    </Suspense>
  );
}

async function Loader({ params }: Pick<PageProps<"/templates/scaffolds/[id]">, "params">) {
  const { id } = await params;
  const [preset, user] = await Promise.all([getScaffoldTemplate(id), getCurrentUser()]);
  if (!preset) notFound();

  return (
    <>
      <PageHeader
        title={preset.name}
        description={
          preset.builtIn
            ? "Built-in preset (read-only). Duplicate it from the left panel to make changes."
            : "Scaffold preset. Projects copy it when it is applied, so changing it later does not affect existing projects."
        }
      />
      <section className={ui.card} aria-labelledby="preset-breakpoints">
        <h2 id="preset-breakpoints" className={ui.sectionHeading}>
          Breakpoints
        </h2>
        <p style={{ margin: 0 }}>
          {preset.breakpoints.breakpoints.map((b) => `${b.name} (${describeRange(b)})`).join(" · ")}{" "}
          <Link href={`/templates/scaffolds/${preset.id}/breakpoints`}>
            {preset.builtIn ? "View" : "Edit"} breakpoints
          </Link>
        </p>
      </section>
      <ScaffoldEditor
        // Remount when switching presets so editor state does not leak between them.
        key={preset.id}
        initialTree={preset.tree}
        initialMeta={{ name: preset.name, description: preset.description ?? "" }}
        readOnly={preset.builtIn || !isAdmin(user)}
        onSave={saveScaffoldTemplateAction.bind(null, preset.id)}
      />
    </>
  );
}
