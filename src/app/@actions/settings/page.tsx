import { PanelButton, PanelSection } from "@/components/AppShell/PanelSection";

export default function SettingsActions() {
  return (
    <PanelSection title="Figma">
      <PanelButton disabled title="Available with the Figma integration">
        Test connection
      </PanelButton>
    </PanelSection>
  );
}
