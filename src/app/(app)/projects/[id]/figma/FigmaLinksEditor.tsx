"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { PanelActions } from "@/components/AppShell/PanelActions";
import { PanelButton, PanelSection } from "@/components/AppShell/PanelSection";
import ui from "@/components/ui/ui.module.css";
import { parseFigmaUrl } from "@/lib/figma/url";
import {
  CSS_TEMPLATE_IDS,
  CSS_TEMPLATE_LABELS,
  type CssTemplateId,
  type FigmaLink,
} from "@/lib/model";
import {
  checkFigmaLinkAction,
  deleteFigmaLinkAction,
  saveFigmaLinkAction,
  type CheckResult,
} from "./actions";
import styles from "./FigmaLinksEditor.module.css";

type Scope = FigmaLink["scope"];
type Props = {
  projectId: string;
  initialLinks: FigmaLink[];
  breakpoints: { id: string; name: string }[];
  figmaConnected: boolean;
};

type Draft = {
  id?: string;
  label: string;
  scope: Scope;
  pageName: string;
  url: string;
  breakpointId: string;
  componentId: string;
};

const emptyDraft = (): Draft => ({
  label: "",
  scope: "global",
  pageName: "",
  url: "",
  breakpointId: "",
  componentId: "",
});

const toDraft = (l: FigmaLink): Draft => ({
  id: l.id,
  label: l.label,
  scope: l.scope,
  pageName: l.pageName ?? "",
  url: l.url,
  breakpointId: l.breakpointId ?? "",
  componentId: l.componentId ?? "",
});

const SCOPE_LABELS: Record<Scope, string> = {
  global: "Global styles",
  page: "Page",
  component: "Component",
};

export function FigmaLinksEditor({ projectId, initialLinks, breakpoints, figmaConnected }: Props) {
  const [links, setLinks] = useState(initialLinks);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [busy, start] = useTransition();

  const parsed = draft?.url ? parseFigmaUrl(draft.url) : null;
  const breakpointName = (id?: string) => breakpoints.find((b) => b.id === id)?.name;

  const open = (next: Draft) => {
    setDraft(next);
    setError(null);
    setCheck(null);
  };
  const update = (patch: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setError(null);
    if ("url" in patch) setCheck(null);
  };

  const save = () =>
    draft &&
    start(async () => {
      const result = await saveFigmaLinkAction(projectId, {
        id: draft.id,
        label: draft.label,
        scope: draft.scope,
        pageName: draft.pageName || undefined,
        url: draft.url,
        breakpointId: draft.breakpointId || undefined,
        componentId: (draft.componentId || undefined) as CssTemplateId | undefined,
      });
      if (result.ok) {
        setLinks(result.links);
        setDraft(null);
      } else {
        setError(result.error);
      }
    });

  const remove = (link: FigmaLink) => {
    if (!confirm(`Remove the link "${link.label}"?`)) return;
    start(async () => {
      const result = await deleteFigmaLinkAction(projectId, link.id);
      if (result.ok) setLinks(result.links);
      else setError(result.error);
    });
  };

  const runCheck = () =>
    draft &&
    start(async () => {
      const result = await checkFigmaLinkAction(draft.url);
      setCheck(result);
      // Suggest the frame name as the label when none was typed yet.
      if (result.ok && !draft.label.trim() && result.nodeName) update({ label: result.nodeName });
    });

  return (
    <div className={ui.sections}>
      <PanelActions>
        <PanelSection title="Figma links">
          <PanelButton onClick={() => open(emptyDraft())} disabled={busy}>
            Add link
          </PanelButton>
        </PanelSection>
      </PanelActions>

      {!figmaConnected && (
        <p className={ui.hint} style={{ margin: 0 }}>
          No Figma token is saved, so links cannot be checked yet. Links can still be added;{" "}
          <Link href="/settings">connect Figma in Settings</Link> to read them.
        </p>
      )}

      {error && !draft && (
        <p role="alert" className={ui.error}>
          {error}
        </p>
      )}

      {draft && (
        <section className={ui.card} aria-labelledby="link-form-title">
          <h2 id="link-form-title" className={ui.sectionHeading}>
            {draft.id ? "Edit link" : "Add a Figma link"}
          </h2>
          <form
            className={ui.form}
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className={ui.field}>
              <label htmlFor="link-url" className={ui.label}>
                Figma link
              </label>
              <input
                id="link-url"
                className={`${ui.input} ${ui.code}`}
                value={draft.url}
                onChange={(e) => update({ url: e.target.value })}
                placeholder="https://www.figma.com/design/…?node-id=12-34"
                spellCheck={false}
                autoComplete="off"
                aria-invalid={parsed && !parsed.ok ? true : undefined}
                aria-describedby="link-url-parsed"
              />
              <span id="link-url-parsed" className={ui.hint} aria-live="polite">
                {parsed === null
                  ? "In Figma, select a frame and use Copy link to selection."
                  : parsed.ok
                    ? `File ${parsed.fileKey}${parsed.branch ? " (branch)" : ""} · ${
                        parsed.nodeId ? `frame ${parsed.nodeId}` : "whole file (no frame selected)"
                      }`
                    : null}
              </span>
              {parsed && !parsed.ok && <p className={ui.error}>{parsed.error}</p>}
              <div className={styles.checkRow}>
                <button
                  type="button"
                  className={styles.smallButton}
                  onClick={runCheck}
                  disabled={!figmaConnected || !parsed?.ok || busy}
                >
                  Check link
                </button>
                {check && (
                  <span className={check.ok ? styles.checkOk : ui.error} role="status">
                    {check.ok
                      ? `${check.fileName}${check.nodeName ? ` › ${check.nodeName} (${check.nodeType?.toLowerCase()})` : ""}`
                      : check.error}
                  </span>
                )}
              </div>
            </div>

            <div className={ui.field}>
              <label htmlFor="link-label" className={ui.label}>
                Label
              </label>
              <input
                id="link-label"
                className={ui.input}
                value={draft.label}
                onChange={(e) => update({ label: e.target.value })}
                maxLength={120}
                placeholder="e.g. Header, desktop"
              />
            </div>

            <fieldset className={ui.field} style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className={ui.label}>What it describes</legend>
              <div className={ui.radioRow}>
                {(Object.keys(SCOPE_LABELS) as Scope[]).map((scope) => (
                  <label key={scope}>
                    <input
                      type="radio"
                      name="scope"
                      value={scope}
                      checked={draft.scope === scope}
                      onChange={() => update({ scope })}
                    />{" "}
                    {SCOPE_LABELS[scope]}
                  </label>
                ))}
              </div>
            </fieldset>

            {draft.scope === "page" && (
              <div className={ui.field}>
                <label htmlFor="link-page" className={ui.label}>
                  Page name
                </label>
                <input
                  id="link-page"
                  className={ui.input}
                  value={draft.pageName}
                  onChange={(e) => update({ pageName: e.target.value })}
                  maxLength={120}
                  placeholder="e.g. Home"
                />
              </div>
            )}

            {draft.scope === "component" && (
              <div className={ui.field}>
                <label htmlFor="link-component" className={ui.label}>
                  Component
                </label>
                <select
                  id="link-component"
                  className={ui.input}
                  value={draft.componentId}
                  onChange={(e) => update({ componentId: e.target.value })}
                >
                  <option value="">Not mapped yet</option>
                  {CSS_TEMPLATE_IDS.filter((id) => id !== "tokens").map((id) => (
                    <option key={id} value={id}>
                      {CSS_TEMPLATE_LABELS[id]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={ui.field}>
              <label htmlFor="link-breakpoint" className={ui.label}>
                Screen size this frame represents
              </label>
              <select
                id="link-breakpoint"
                className={ui.input}
                value={draft.breakpointId}
                onChange={(e) => update({ breakpointId: e.target.value })}
              >
                <option value="">All sizes / not specific</option>
                {breakpoints.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <p role="alert" className={ui.error}>
                {error}
              </p>
            )}

            <div className={styles.formActions}>
              <button
                type="submit"
                className={ui.button}
                disabled={busy || !parsed?.ok || !draft.label.trim()}
              >
                {busy ? "Saving…" : draft.id ? "Save changes" : "Add link"}
              </button>
              <button type="button" className={styles.smallButton} onClick={() => setDraft(null)}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      <section className={ui.card} aria-labelledby="links-title">
        <h2 id="links-title" className={ui.sectionHeading}>
          Links ({links.length})
        </h2>
        {links.length === 0 ? (
          <p className={ui.muted} style={{ margin: 0 }}>
            No Figma links yet. Use <strong>Add link</strong> in the left panel.
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Label</th>
                  <th scope="col">Describes</th>
                  <th scope="col">Screen size</th>
                  <th scope="col">Figma</th>
                  <th scope="col">
                    <span className={styles.visuallyHidden}>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {links.map((l) => (
                  <tr key={l.id}>
                    <td>{l.label}</td>
                    <td>
                      {l.scope === "page"
                        ? `Page: ${l.pageName}`
                        : l.scope === "component"
                          ? `Component: ${l.componentId ? CSS_TEMPLATE_LABELS[l.componentId] : "not mapped"}`
                          : SCOPE_LABELS.global}
                    </td>
                    <td>
                      {breakpointName(l.breakpointId) ?? <span className={ui.muted}>all</span>}
                    </td>
                    <td>
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className={ui.code}>
                        {l.fileKey.slice(0, 8)}…{l.nodeId ? ` · ${l.nodeId}` : ""}
                      </a>
                    </td>
                    <td className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.smallButton}
                        onClick={() => open(toDraft(l))}
                        aria-label={`Edit ${l.label}`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={`${styles.smallButton} ${styles.danger}`}
                        onClick={() => remove(l)}
                        aria-label={`Remove ${l.label}`}
                        disabled={busy}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
