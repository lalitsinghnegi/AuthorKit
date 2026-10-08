"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PanelActions } from "@/components/AppShell/PanelActions";
import { PanelButton, PanelSection } from "@/components/AppShell/PanelSection";
import panel from "@/components/AppShell/AppShell.module.css";
import ui from "@/components/ui/ui.module.css";
import { extractResponsiveAction } from "./actions";

type Props = {
  projectId: string;
  canExtract: boolean;
  confirmedFrames: number;
  figmaConnected: boolean;
};

export function ResponsiveActions({
  projectId,
  canExtract,
  confirmedFrames,
  figmaConnected,
}: Props) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; message: string; notes?: string[] } | null>(
    null,
  );

  const extract = () =>
    start(async () => {
      const result = await extractResponsiveAction(projectId);
      if (!result.ok) return setStatus({ ok: false, message: result.error });
      setStatus({ ok: true, message: "Values extracted from Figma.", notes: result.notes });
      router.refresh();
    });

  return (
    <>
      <PanelActions>
        <PanelSection title="Responsive">
          <PanelButton onClick={extract} disabled={!canExtract || busy}>
            {busy ? "Reading Figma…" : "Extract per breakpoint"}
          </PanelButton>
          <p className={panel.panelHint}>
            {confirmedFrames} confirmed frame{confirmedFrames === 1 ? "" : "s"}
          </p>
        </PanelSection>
      </PanelActions>
      {!figmaConnected ? (
        <p className={ui.hint} style={{ marginTop: 0 }}>
          <Link href="/settings">Connect Figma in Settings</Link> to extract values.
        </p>
      ) : confirmedFrames === 0 ? (
        <p className={ui.hint} style={{ marginTop: 0 }}>
          Confirm component frames under{" "}
          <Link href={`/projects/${projectId}/mapping`}>Components</Link> first.
        </p>
      ) : null}
      {status && (
        <div
          role="status"
          className={status.ok ? undefined : ui.error}
          style={status.ok ? { color: "#2e7d32", marginBottom: 16 } : { marginBottom: 16 }}
        >
          <p style={{ margin: 0 }}>{status.message}</p>
          {status.notes && status.notes.length > 0 && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "var(--ui-muted)" }}>
              {status.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
