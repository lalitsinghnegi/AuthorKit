import { Suspense } from "react";
import { PanelLink, PanelSection } from "@/components/AppShell/PanelSection";
import { getScaffoldTemplate } from "@/lib/storage/scaffoldTemplates";

// Save, Add breakpoint and Fix all are rendered by BreakpointEditor via <PanelActions>.
export default function PresetBreakpointsActions({
  params,
}: PageProps<"/templates/scaffolds/[id]/breakpoints">) {
  return (
    <Suspense fallback={null}>
      <Links params={params} />
    </Suspense>
  );
}

async function Links({
  params,
}: Pick<PageProps<"/templates/scaffolds/[id]/breakpoints">, "params">) {
  const { id } = await params;
  const preset = await getScaffoldTemplate(id);
  if (!preset) return null;
  return (
    <PanelSection title="Template">
      <PanelLink href={`/templates/scaffolds/${preset.id}`} variant="secondary">
        Folders
      </PanelLink>
      <PanelLink href="/templates" variant="secondary">
        All templates
      </PanelLink>
    </PanelSection>
  );
}
