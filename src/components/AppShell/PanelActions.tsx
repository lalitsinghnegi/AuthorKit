"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useReadOnly } from "@/components/ReadOnly/ReadOnlyContext";

export const PANEL_PORTAL_ID = "panel-actions-portal";

const subscribe = () => () => {};

/**
 * Render actions into the left panel from inside the work area. Use this when
 * the actions need the page's client state (e.g. an editor's Save button);
 * static actions belong in the `@actions` parallel route instead.
 */
export function PanelActions({ children }: { children: React.ReactNode }) {
  // Resolve the target only on the client; it does not exist during SSR.
  const target = useSyncExternalStore(
    subscribe,
    () => document.getElementById(PANEL_PORTAL_ID),
    () => null,
  );
  const readOnly = useReadOnly();
  if (!target) return null;
  return createPortal(
    readOnly ? (
      <fieldset disabled style={{ minWidth: 0, margin: 0, padding: 0, border: 0 }}>
        {children}
      </fieldset>
    ) : (
      children
    ),
    target,
  );
}
