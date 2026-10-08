import { SettingsNav } from "./SettingsNav";

// Save actions need the page's client state; SettingsView renders them via <PanelActions>.
export default function SettingsActions() {
  return <SettingsNav />;
}
