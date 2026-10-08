import { Suspense } from "react";
import { AccountBox } from "@/components/AppShell/AccountBox";
import { AppShell } from "@/components/AppShell/AppShell";

/** Signed-in area: two-pane shell with navigation, screen actions and the account box. */
export default function AppLayout({ children, actions }: LayoutProps<"/">) {
  return (
    <AppShell
      actions={actions}
      account={
        <Suspense fallback={null}>
          <AccountBox />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
