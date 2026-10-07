import { Suspense } from "react";
import {
  deleteScaffoldTemplateAction,
  duplicateScaffoldTemplateAction,
} from "@/app/templates/actions";
import { ConfirmSubmit } from "@/components/AppShell/ConfirmSubmit";
import { PanelDownload, PanelLink, PanelSection } from "@/components/AppShell/PanelSection";
import { getScaffoldTemplate } from "@/lib/storage/scaffoldTemplates";

export default function PresetActions({ params }: PageProps<"/templates/scaffolds/[id]">) {
  return (
    <Suspense fallback={null}>
      <Actions params={params} />
    </Suspense>
  );
}

async function Actions({ params }: Pick<PageProps<"/templates/scaffolds/[id]">, "params">) {
  const { id } = await params;
  const preset = await getScaffoldTemplate(id);
  if (!preset) return null;

  return (
    <PanelSection title="Preset">
      <ConfirmSubmit
        action={duplicateScaffoldTemplateAction.bind(null, preset.id)}
        variant={preset.builtIn ? undefined : "secondary"}
      >
        {preset.builtIn ? "Duplicate to edit" : "Duplicate"}
      </ConfirmSubmit>
      <PanelDownload href={`/api/scaffold-templates/${preset.id}/export`}>
        Export JSON
      </PanelDownload>
      {!preset.builtIn && (
        <ConfirmSubmit
          action={deleteScaffoldTemplateAction.bind(null, preset.id)}
          confirmText={`Delete preset "${preset.name}"? Projects that used it keep their copy.`}
          variant="danger"
        >
          Delete preset
        </ConfirmSubmit>
      )}
      <PanelLink href="/templates" variant="secondary">
        All templates
      </PanelLink>
    </PanelSection>
  );
}
