import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BreakpointEditor } from "@/components/BreakpointEditor/BreakpointEditor";
import { EditGate } from "@/components/ReadOnly/EditGate";
import { PageHeader } from "@/components/PageHeader";
import ui from "@/components/ui/ui.module.css";
import { getScaffoldTemplate } from "@/lib/storage/scaffoldTemplates";
import { saveTemplateBreakpointsAction } from "../../../actions";

export default function PresetBreakpointsPage({
  params,
}: PageProps<"/templates/scaffolds/[id]/breakpoints">) {
  return (
    <Suspense fallback={<p className={ui.muted}>Loading breakpoints…</p>}>
      <Loader params={params} />
    </Suspense>
  );
}

async function Loader({
  params,
}: Pick<PageProps<"/templates/scaffolds/[id]/breakpoints">, "params">) {
  const { id } = await params;
  const preset = await getScaffoldTemplate(id);
  if (!preset) notFound();

  return (
    <>
      <PageHeader
        title={`${preset.name}: breakpoints`}
        description="New projects made from this template start with these breakpoints, and any project can take them with “Apply from template” on its Breakpoints screen. Projects keep their own copy."
      />
      <EditGate
        readOnly={
          preset.builtIn ? (
            <>
              <strong>Built-in template.</strong> These are the standard breakpoints; duplicate the
              template to change them.
            </>
          ) : undefined
        }
      >
        <BreakpointEditor
          // Remount when switching presets so editor state does not leak between them.
          key={preset.id}
          prefix="ak"
          initialBreakpoints={preset.breakpoints.breakpoints}
          onSave={saveTemplateBreakpointsAction.bind(null, preset.id)}
        />
      </EditGate>
    </>
  );
}
