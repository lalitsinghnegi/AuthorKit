import { Suspense } from "react";
import { createScaffoldTemplateAction } from "@/app/(app)/templates/actions";
import { ConfirmSubmit } from "@/components/AppShell/ConfirmSubmit";
import { ImportScaffoldForm } from "@/components/AppShell/ImportScaffoldForm";
import { PanelSection } from "@/components/AppShell/PanelSection";
import { AdminOnly } from "@/components/ReadOnly/EditGate";

export default function TemplatesActions() {
  return (
    <Suspense fallback={null}>
      <AdminOnly>
        <PanelSection title="Scaffold presets">
          <ConfirmSubmit action={createScaffoldTemplateAction}>New preset</ConfirmSubmit>
          <ImportScaffoldForm />
        </PanelSection>
      </AdminOnly>
    </Suspense>
  );
}
