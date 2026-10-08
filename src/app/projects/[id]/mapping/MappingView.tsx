"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { PanelActions } from "@/components/AppShell/PanelActions";
import { PanelButton, PanelSection } from "@/components/AppShell/PanelSection";
import panel from "@/components/AppShell/AppShell.module.css";
import ui from "@/components/ui/ui.module.css";
import {
  MAPPABLE_COMPONENTS,
  isAllowedImageUrl,
  isAmbiguous,
  type MappableComponent,
} from "@/lib/mapping";
import { CSS_TEMPLATE_LABELS, type FigmaLink, type FrameMapping } from "@/lib/model";
import {
  detectFramesAction,
  loadPreviewsAction,
  saveMappingsAction,
  suggestWithAIAction,
  type MappingEdit,
} from "./actions";
import styles from "./MappingView.module.css";

type Props = {
  projectId: string;
  initialLinks: FigmaLink[];
  breakpoints: Record<string, string>;
  figmaConnected: boolean;
  aiConfigured: boolean;
};
type Filter = "all" | "open" | "ambiguous" | "confirmed";
type Status = { kind: "idle" | "ok" | "error"; message?: string; notes?: string[] };

const SCOPE: Record<FigmaLink["scope"], string> = {
  global: "Global styles",
  page: "Page",
  component: "Component",
};
const STATE: Record<FrameMapping["state"], string> = {
  suggested: "Suggested",
  confirmed: "Confirmed",
  ignored: "Ignored",
};

const editsOf = (links: FigmaLink[]): MappingEdit[] =>
  links.flatMap((l) =>
    (l.mappings ?? []).map((m) => ({
      linkId: l.id,
      nodeId: m.nodeId,
      componentId: m.componentId as MappableComponent | null,
      state: m.state,
    })),
  );

export function MappingView({
  projectId,
  initialLinks,
  breakpoints,
  figmaConnected,
  aiConfigured,
}: Props) {
  const [links, setLinks] = useState(initialLinks);
  const [saved, setSaved] = useState(initialLinks);
  const [filter, setFilter] = useState<Filter>("all");
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [busy, start] = useTransition();

  const all = links.flatMap((l) => l.mappings ?? []);
  const counts = {
    open: all.filter((m) => m.state === "suggested" && !m.missing).length,
    ambiguous: all.filter(isAmbiguous).length,
    confirmed: all.filter((m) => m.state === "confirmed").length,
  };
  const dirty = JSON.stringify(editsOf(links)) !== JSON.stringify(editsOf(saved));
  const show = (m: FrameMapping) =>
    filter === "open"
      ? m.state === "suggested" && !m.missing
      : filter === "ambiguous"
        ? isAmbiguous(m)
        : filter === "confirmed"
          ? m.state === "confirmed"
          : true;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const edit = (linkId: string, nodeId: string, patch: Partial<FrameMapping>) => {
    setLinks((list) =>
      list.map((l) =>
        l.id !== linkId
          ? l
          : {
              ...l,
              mappings: l.mappings?.map((m) => (m.nodeId === nodeId ? { ...m, ...patch } : m)),
            },
      ),
    );
    setStatus({ kind: "idle" });
  };

  /** Server actions that replace the links from Figma or the AI provider. */
  const reload = (
    run: () => Promise<
      | { ok: true; links: FigmaLink[]; notes: string[]; suggested?: number }
      | { ok: false; error: string }
    >,
    message: (r: { suggested?: number }) => string,
  ) => {
    if (dirty && !confirm("This reloads mappings and discards unsaved changes. Continue?")) return;
    start(async () => {
      const result = await run();
      if (!result.ok) return setStatus({ kind: "error", message: result.error });
      setLinks(result.links);
      setSaved(result.links);
      setStatus({ kind: "ok", message: message(result), notes: result.notes });
    });
  };

  const loadPreviews = () =>
    start(async () => {
      const result = await loadPreviewsAction(projectId);
      if (!result.ok) return setStatus({ kind: "error", message: result.error });
      setPreviews(result.images);
      setStatus({ kind: "ok", message: `Loaded ${Object.keys(result.images).length} previews.` });
    });

  const confirmHighConfidence = () =>
    setLinks((list) =>
      list.map((l) => ({
        ...l,
        mappings: l.mappings?.map((m) =>
          m.state === "suggested" && !m.missing && m.componentId && m.confidence === "high"
            ? { ...m, state: "confirmed" as const }
            : m,
        ),
      })),
    );

  const save = () =>
    start(async () => {
      const result = await saveMappingsAction(projectId, editsOf(links));
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
          <PanelButton
            onClick={() =>
              reload(
                () => detectFramesAction(projectId),
                () => "Frames detected.",
              )
            }
            disabled={!figmaConnected || links.length === 0 || busy}
          >
            {busy ? "Working…" : "Detect frames"}
          </PanelButton>
          <PanelButton
            variant="secondary"
            onClick={loadPreviews}
            disabled={!figmaConnected || all.length === 0 || busy}
          >
            Load previews
          </PanelButton>
          <PanelButton
            variant="secondary"
            onClick={() =>
              reload(
                () => suggestWithAIAction(projectId),
                (r) =>
                  `AI suggested components for ${r.suggested ?? 0} frames. Review and confirm them.`,
              )
            }
            disabled={!aiConfigured || counts.ambiguous === 0 || busy}
            title={aiConfigured ? undefined : "Set ANTHROPIC_API_KEY to switch AI suggestions on"}
          >
            Ask AI about ambiguous ({counts.ambiguous})
          </PanelButton>
          <PanelButton
            variant="secondary"
            onClick={confirmHighConfidence}
            disabled={busy || counts.open === 0}
          >
            Confirm all high-confidence
          </PanelButton>
          <PanelButton variant="secondary" onClick={save} disabled={!dirty || busy}>
            Save
          </PanelButton>
          <PanelButton variant="secondary" onClick={discard} disabled={!dirty || busy}>
            Discard changes
          </PanelButton>
          {!aiConfigured && <p className={panel.panelHint}>AI suggestions are off.</p>}
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

      {all.length > 0 && (
        <div className={styles.filters} role="group" aria-label="Show">
          {(
            [
              ["all", `All (${all.length})`],
              ["open", `Needs a decision (${counts.open})`],
              ["ambiguous", `Ambiguous (${counts.ambiguous})`],
              ["confirmed", `Confirmed (${counts.confirmed})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={styles.filter}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {links.map((link) => {
        const rows = (link.mappings ?? []).filter(show);
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
            {!link.mappings?.length ? (
              <p className={ui.muted} style={{ margin: 0 }}>
                {link.nodeId
                  ? "Not detected yet. Use Detect frames."
                  : "This link points at a whole file; link a frame to detect components."}
              </p>
            ) : rows.length === 0 ? (
              <p className={ui.muted} style={{ margin: 0 }}>
                Nothing matches this filter.
              </p>
            ) : (
              <ul className={styles.frames}>
                {rows.map((m) => (
                  <FrameRow
                    key={m.nodeId}
                    mapping={m}
                    preview={previews[m.nodeId]}
                    onComponent={(componentId) =>
                      edit(link.id, m.nodeId, {
                        componentId,
                        source: "manual",
                        confidence: undefined,
                        reason: undefined,
                        state: componentId ? "confirmed" : "suggested",
                      })
                    }
                    onState={(state) => edit(link.id, m.nodeId, { state })}
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
  onComponent: (id: MappableComponent | null) => void;
  onState: (state: FrameMapping["state"]) => void;
};

function FrameRow({ mapping: m, preview, onComponent, onState }: RowProps) {
  const selectId = `component-${m.nodeId}`;
  return (
    <li className={styles.frame} data-state={m.state} data-missing={m.missing || undefined}>
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
        <div className={styles.reason}>
          <span className={styles.badge} data-source={m.source}>
            {m.source === "ai" ? "AI" : m.source === "pattern" ? "Name" : "You"}
          </span>
          {m.confidence && (
            <span className={styles.badge} data-confidence={m.confidence}>
              {m.confidence}
            </span>
          )}
          {m.reason}
        </div>
      </div>
      <div className={styles.controls}>
        <label htmlFor={selectId} className={styles.visuallyHidden}>
          Component for {m.nodeName}
        </label>
        <select
          id={selectId}
          className={ui.input}
          value={m.componentId ?? ""}
          onChange={(e) => onComponent((e.target.value || null) as MappableComponent | null)}
          disabled={m.state === "ignored"}
        >
          <option value="">Not a component</option>
          {MAPPABLE_COMPONENTS.map((id) => (
            <option key={id} value={id}>
              {CSS_TEMPLATE_LABELS[id]}
            </option>
          ))}
        </select>
        <span className={styles.state} data-state={m.state}>
          {STATE[m.state]}
        </span>
        <div className={styles.buttons}>
          {m.state === "suggested" && (
            <button
              type="button"
              onClick={() => onState("confirmed")}
              disabled={!m.componentId}
              aria-label={`Confirm ${m.nodeName}`}
            >
              Confirm
            </button>
          )}
          {m.state !== "ignored" && (
            <button
              type="button"
              onClick={() => onState("ignored")}
              aria-label={`Ignore ${m.nodeName}`}
            >
              Ignore
            </button>
          )}
          {m.state !== "suggested" && (
            <button
              type="button"
              onClick={() => onState("suggested")}
              aria-label={`Undo ${m.nodeName}`}
            >
              Undo
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
