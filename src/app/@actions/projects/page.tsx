import { ImportProjectForm } from "@/components/AppShell/ImportProjectForm";
import { PanelLink, PanelSection } from "@/components/AppShell/PanelSection";

export default function ProjectsActions() {
  return (
    <PanelSection title="Projects">
      <PanelLink href="/projects/new">New project</PanelLink>
      <ImportProjectForm />
    </PanelSection>
  );
}
