import { PanelButton, PanelSection } from "@/components/AppShell/PanelSection";

export default function ProjectsActions() {
  return (
    <PanelSection title="Projects">
      <PanelButton disabled title="Available after the data model is built">
        New project
      </PanelButton>
      <PanelButton disabled title="Available after the data model is built">
        Import project.json
      </PanelButton>
    </PanelSection>
  );
}
