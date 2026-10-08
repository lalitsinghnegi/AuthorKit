import { Suspense } from "react";
import { ImportProjectForm } from "@/components/AppShell/ImportProjectForm";
import { PanelLink, PanelSection } from "@/components/AppShell/PanelSection";
import { AdminOnly } from "@/components/ReadOnly/EditGate";

export default function ProjectsActions() {
  return (
    <Suspense fallback={null}>
      <AdminOnly>
        <PanelSection title="Projects">
          <PanelLink href="/projects/new">New project</PanelLink>
          <ImportProjectForm />
        </PanelSection>
      </AdminOnly>
    </Suspense>
  );
}
