import { createScaffoldTemplateAction } from "@/app/templates/actions";
import { ConfirmSubmit } from "@/components/AppShell/ConfirmSubmit";
import { ImportScaffoldForm } from "@/components/AppShell/ImportScaffoldForm";
import { PanelSection } from "@/components/AppShell/PanelSection";

export default function TemplatesActions() {
  return (
    <PanelSection title="Scaffold presets">
      <ConfirmSubmit action={createScaffoldTemplateAction}>New preset</ConfirmSubmit>
      <ImportScaffoldForm />
    </PanelSection>
  );
}
