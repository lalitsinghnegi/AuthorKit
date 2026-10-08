import { PanelLink, PanelSection } from "@/components/AppShell/PanelSection";

/** Links between the admin settings screens. */
export function SettingsNav() {
  return (
    <PanelSection title="Settings">
      <PanelLink href="/settings" variant="secondary">
        Figma and app
      </PanelLink>
      <PanelLink href="/settings/users" variant="secondary">
        Users
      </PanelLink>
      <PanelLink href="/settings/audit" variant="secondary">
        Audit log
      </PanelLink>
    </PanelSection>
  );
}
