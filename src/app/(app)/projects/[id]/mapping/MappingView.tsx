"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { PanelActions } from "@/components/AppShell/PanelActions";
import { PanelButton, PanelSection } from "@/components/AppShell/PanelSection";
import panel from "@/components/AppShell/AppShell.module.css";
import ui from "@/components/ui/ui.module.css";
import { MAPPABLE_COMPONENTS, isAllowedImageUrl, type MappableComponent } from "@/lib/mapping";
import { CSS_TEMPLATE_LABELS, type FigmaLink, type FrameMapping } from "@/lib/model";
import {
  detectFramesAction,
  loadPreviewsAction,
  saveMappingsAction,
  type MappingEdit,
} from "./actions";
import styles from "./MappingView.module.css";

type Props = {
  projectId: string;
  initialLinks: FigmaLink[];
  breakpoints: Record<string, string>;
  figmaConnected: boolean;
};
type Status = { kind: "idle" | "ok" | "error"; message?: string; notes?: string[] };

const SCOPE: Record<FigmaLink["scope"], string> = {
  global: "Global styles",
  page: "Page",
  component: "Component",
};

/** What changed since the last save: a new component per frame, or null for a removed frame. */
const editsOf = (saved: FigmaLink[], links: FigmaLink[]): MappingEdit[] =>
  saved.flatMap((s) => {
    const now = links.find((l) => l.id === s.id)?.mappings ?? [];
    return (s.mappings ?? []).flatMap((m) => {
      const current = now.find((n) => n.nodeId === m.nodeId);
      const componentId = (current?.componentId ?? null) as MappableComponent | null;
      return componentId === m.componentId ? [] : [{ linkId: s.id, nodeId: m.nodeId, componentId }];
    });
  });

export function MappingView({ projectId, initialLinks, breakpoints, figmaConnected }: Props) {
  const [links, setLinks] = useState(initialLinks);
  const [saved, setSaved] = useState(initialLinks);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [busy, start] = useTransition();

  const all = links.flatMap((l) => l.mappings ?? []);
  const edits = editsOf(saved, links);
  const dirty = edits.length > 0;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const change = (linkId: string, update: (m: FrameMapping[]) => FrameMapping[]) => {
    setLinks((list) =>
      list.map((l) => (l.id === linkId ? { ...l, mappings: update(l.mappings ?? []) } : l)),
    );
    setStatus({ kind: "idle" });
  };

  const detect = () => {
    if (dirty && !confirm("Detecting reloads frames and discards unsaved changes. Continue?"))
      return;
    start(async () => {
      const result = await detectFramesAction(projectId);
      if (!result.ok) return setStatus({ kind: "error", message: result.error });
      setLinks(result.links);
      setSaved(result.links);
      const found = result.links.reduce((n, l) => n + (l.mappings?.length ?? 0), 0);
      setStatus({
        kind: "ok",
        message: `Frames detected: ${found} confirmed.`,
        notes: result.notes,
      });
    });
  };

  const loadPreviews = () =>
    start(async () => {
      const result = await loadPreviewsAction(projectId);
      if (!result.ok) return setStatus({ kind: "error", message: result.error });
      setPreviews(result.images);
      setStatus({ kind: "ok", message: `Loaded ${Object.keys(result.images).length} previews.` });
    });

  const save = () =>
    start(async () => {
      const result = await saveMappingsAction(projectId, edits);
      if (!result.ok) return setStatus({ kind: "error", message: result.error });
      setLinks(result.links);
      setSaved(result.links);
      setStatus({ kind: "ok", message: "Mappings saved." });
    });

  const discard = () => {
    if (!confirm("Discard unsaved changes?")) return;
    setLinks(saved);
  };

  return (
    <div className={ui.sections}>
      <PanelActions>
        <PanelSection title="Components">
          {dirty && <span className={panel.dirty}>Unsaved changes</span>}
          <PanelButton onClick={detect} disabled={!figmaConnected || links.length === 0 || busy}>
            {busy ? "Working…" : "Detect frames"}
          </PanelButton>
          <PanelButton
            variant="secondary"
            onClick={loadPreviews}
            disabled={!figmaConnected || all.length === 0 || busy}
          >
            Load previews
          </PanelButton>
          <PanelButton variant="secondary" onClick={save} disabled={!dirty || busy}>
            Save
          </PanelButton>
          <PanelButton variant="secondary" onClick={discard} disabled={!dirty || busy}>
            Discard changes
          </PanelButton>
        </PanelSection>
      </PanelActions>

      {!figmaConnected && (
        <p className={ui.hint} style={{ margin: 0 }}>
          <Link href="/settings">Connect Figma in Settings</Link> to detect frames.
        </p>
      )}
      {links.length === 0 && (
        <p className={ui.hint} style={{ margin: 0 }}>
          Add links under <Link href={`/projects/${projectId}/figma`}>Figma</Link> first.
        </p>
      )}

      {status.message && (
        <div role="status" className={status.kind === "error" ? ui.error : styles.ok}>
          <p style={{ margin: 0 }}>{status.message}</p>
          {status.notes && status.notes.length > 0 && (
            <ul className={styles.notes}>
              {status.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {links.map((link) => {
        const rows = link.mappings ?? [];
        return (
          <section key={link.id} className={ui.card} aria-labelledby={`link-${link.id}`}>
            <h2 id={`link-${link.id}`} className={ui.sectionHeading}>
              {link.label}
              <span className={styles.linkMeta}>
                {link.scope === "page" ? `Page: ${link.pageName}` : SCOPE[link.scope]}
                {link.breakpointId && breakpoints[link.breakpointId]
                  ? ` · ${breakpoints[link.breakpointId]}`
                  : ""}
              </span>
            </h2>
            {rows.length === 0 ? (
              <p className={ui.muted} style={{ margin: 0 }}>
                {link.nodeId
                  ? "No confirmed frames. Use Detect frames; frames named after a component (e.g. “Header”) are confirmed."
                  : "This link points at a whole file; link a frame to detect components."}
              </p>
            ) : (
              <ul className={styles.frames}>
                {rows.map((m) => (
                  <FrameRow
                    key={m.nodeId}
                    mapping={m}
                    preview={previews[m.nodeId]}
                    onComponent={(componentId) =>
                      change(link.id, (list) =>
                        list.map((x) =>
                          x.nodeId === m.nodeId
                            ? { ...x, componentId, source: "manual", reason: undefined }
                            : x,
                        ),
                      )
                    }
                    onRemove={() =>
                      change(link.id, (list) => list.filter((x) => x.nodeId !== m.nodeId))
                    }
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

type RowProps = {
  mapping: FrameMapping;
  preview?: string;
  onComponent: (id: MappableComponent) => void;
  onRemove: () => void;
};

function FrameRow({ mapping: m, preview, onComponent, onRemove }: RowProps) {
  const selectId = `component-${m.nodeId}`;
  return (
    <li className={styles.frame} data-missing={m.missing || undefined}>
      <div className={styles.thumb}>
        {isAllowedImageUrl(preview) ? (
          // Figma render URLs are short-lived and external, so next/image optimisation does not apply.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <span aria-hidden="true">▢</span>
        )}
      </div>
      <div className={styles.info}>
        <div className={styles.name}>{m.nodeName}</div>
        <div className={styles.path}>{m.path}</div>
        {m.missing && <div className={styles.missing}>No longer found in Figma</div>}
        <div className={styles.reason}>{m.source === "manual" ? "Set by you" : m.reason}</div>
      </div>
      <div className={styles.controls}>
        <label htmlFor={selectId} className={styles.visuallyHidden}>
          Component for {m.nodeName}
        </label>
        <select
          id={selectId}
          className={ui.input}
          value={m.componentId}
          onChange={(e) => onComponent(e.target.value as MappableComponent)}
        >
          {/* A component link's own frame may be set to a component that cannot be detected. */}
          {!MAPPABLE_COMPONENTS.includes(m.componentId as MappableComponent) && (
            <option value={m.componentId}>{CSS_TEMPLATE_LABELS[m.componentId]}</option>
          )}
          {MAPPABLE_COMPONENTS.map((id) => (
            <option key={id} value={id}>
              {CSS_TEMPLATE_LABELS[id]}
            </option>
          ))}
        </select>
        <div className={styles.buttons}>
          <button type="button" onClick={onRemove} aria-label={`Remove ${m.nodeName}`}>
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}
