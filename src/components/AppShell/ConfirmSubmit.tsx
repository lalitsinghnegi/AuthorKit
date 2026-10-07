"use client";

import { PanelButton } from "./PanelSection";

/** A panel form button that runs a server action after an optional confirm(). */
export function ConfirmSubmit({
  action,
  confirmText,
  variant,
  children,
}: {
  action: () => Promise<void>;
  confirmText?: string;
  variant?: "secondary" | "danger";
  children: React.ReactNode;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirmText && !confirm(confirmText)) e.preventDefault();
      }}
    >
      <PanelButton type="submit" variant={variant}>
        {children}
      </PanelButton>
    </form>
  );
}
