import { PanelButton, PanelSection } from "@/components/AppShell/PanelSection";

export default function TemplatesActions() {
  return (
    <PanelSection title="Templates">
      <PanelButton disabled title="Available with the scaffold designer">
        New scaffold preset
      </PanelButton>
    </PanelSection>
  );
}
