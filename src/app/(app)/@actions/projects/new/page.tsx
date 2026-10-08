import { PanelLink, PanelSection } from "@/components/AppShell/PanelSection";

export default function NewProjectActions() {
  return (
    <PanelSection title="New project">
      <PanelLink href="/projects" variant="secondary">
        Cancel
      </PanelLink>
    </PanelSection>
  );
}
