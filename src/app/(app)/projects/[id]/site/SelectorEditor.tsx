"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { PanelActions } from "@/components/AppShell/PanelActions";
import { PanelButton, PanelSection } from "@/components/AppShell/PanelSection";
import panel from "@/components/AppShell/AppShell.module.css";
import ui from "@/components/ui/ui.module.css";
import type { CssTemplateId, SelectorMapping, SiteSelectors, SiteSuggestion } from "@/lib/model";
import { saveSiteSelectorsAction } from "./actions";
import styles from "./SiteReport.module.css";

export type EditorRow = {
  componentId: CssTemplateId;
  componentName: string;
  part: string;
  kind: "block" | "element" | "modifier";
  purpose: string;
};

type Props = {
  projectId: string;
  prefix: string;
  rows: EditorRow[];
  suggestions: Record<string, SiteSuggestion[]>;
  saved?: SiteSelectors;
  /** Classes found on the last read, or null when the site has not been read. */
  found: string[] | null;
};

type Decision = "open" | "confirmed" | "ignored";
type Draft = { state: Decision; selector: string; scoped: boolean };

const KIND = { block: "Block", element: "Element", modifier: "Variant" } as const;
const SELECTOR_RE = /^\.-?[_a-zA-Z][_a-zA-Z0-9-]*$/;

/** Order-independent form for comparing saved and edited mappings. */
const canonical = (s: SiteSelectors) =>
  JSON.stringify({
    enabled: s.enabled,
    mappings: s.mappings
      .map((m) => [m.part, m.componentId, m.state, m.selector ?? null, m.scoped])
      .sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1)),
  });

/** Choose, per template part, the site class to use instead; save; switch site selectors on. */
export function SelectorEditor({ projectId, prefix, rows, suggestions, saved, found }: Props) {
  const router = useRouter();
  const savedByPart = useMemo(
    () => new Map((saved?.mappings ?? []).map((m) => [m.part, m])),
    [saved],
  );
  // Only explicit edits live in state; everything else comes from what is saved or suggested,
  // so reading the site again updates the suggestions without losing edits.
  const [edits, setEdits] = useState<Record<string, Partial<Draft>>>({});
  const [enabled, setEnabled] = useState(saved?.enabled ?? false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [busy, start] = useTransition();
  const foundSet = useMemo(() => (found ? new Set(found) : null), [found]);

  const draftOf = (part: string): Draft => {
    const s = savedByPart.get(part);
    const base: Draft = {
      state: s?.state ?? "open",
      selector: s?.selector ?? suggestions[part]?.[0]?.selector ?? "",
      scoped: s?.scoped ?? false,
    };
    return { ...base, ...edits[part] };
  };

  const payload = (): SiteSelectors => ({
    enabled,
    mappings: rows.flatMap((r): SelectorMapping[] => {
      const d = draftOf(r.part);
      if (d.state === "open") return [];
      return [
        {
          componentId: r.componentId,
          part: r.part,
          state: d.state,
          scoped: r.kind === "element" && d.state === "confirmed" && d.scoped,
          ...(d.state === "confirmed" ? { selector: d.selector.trim() } : {}),
        },
      ];
    }),
  });
  const dirty = canonical(payload()) !== canonical(saved ?? { enabled: false, mappings: [] });
  const confirmedCount = payload().mappings.filter((m) => m.state === "confirmed").length;
  const highOpen = rows.filter(
    (r) => draftOf(r.part).state === "open" && suggestions[r.part]?.[0]?.confidence === "high",
  );

  const edit = (part: string, change: Partial<Draft>) => {
    setEdits((all) => ({ ...all, [part]: { ...all[part], ...change } }));
    setStatus(null);
    setProblems((p) => {
      const { [part]: _gone, ...rest } = p;
      void _gone;
      return rest;
    });
  };

  const confirmHigh = () =>
    setEdits((all) => {
      const next = { ...all };
      for (const r of highOpen)
        next[r.part] = {
          ...next[r.part],
          state: "confirmed",
          selector: suggestions[r.part][0].selector,
        };
      return next;
    });

  const save = () => {
    const data = payload();
    const bad = data.mappings.find(
      (m) => m.state === "confirmed" && !SELECTOR_RE.test(m.selector!),
    );
    if (bad) {
      setProblems({ [bad.part]: "Use one class selector, such as .cmp-button." });
      setStatus({ ok: false, message: "Fix the problems shown in the table to save." });
      return;
    }
    start(async () => {
      const result = await saveSiteSelectorsAction(projectId, data);
      if (!result.ok) {
        setProblems(
          Object.fromEntries((result.problems ?? []).map((p) => [p.part ?? "", p.message])),
        );
        setStatus({ ok: false, message: result.error });
        return;
      }
      setEdits({});
      setProblems({});
      setStatus({
        ok: true,
        message: data.enabled
          ? "Saved. The package now uses the confirmed site classes."
          : "Saved. Site selectors are off, so the package keeps the template classes.",
      });
      router.refresh();
    });
  };

  const components = [...new Set(rows.map((r) => r.componentId))];
  const unscopedProblems = problems[""];

  return (
    <>
      <PanelActions>
        <PanelSection title="Selectors">
          <PanelButton onClick={save} disabled={!dirty || busy}>
            {busy ? "Saving…" : "Save mappings"}
          </PanelButton>
          <PanelButton variant="secondary" onClick={confirmHigh} disabled={highOpen.length === 0}>
            Confirm all high-confidence
          </PanelButton>
          <p className={panel.panelHint}>
            {confirmedCount} confirmed{dirty ? " · unsaved changes" : ""}
          </p>
        </PanelSection>
      </PanelActions>

      <section className={ui.card} aria-labelledby="site-output" style={{ marginBottom: 16 }}>
        <h2 id="site-output" className={ui.sectionHeading}>
          Use in the package
        </h2>
        <label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              setStatus(null);
            }}
          />{" "}
          Use site selectors in the generated CSS, style guide and sample page
        </label>
        <p className={ui.hint} style={{ margin: "6px 0 0" }}>
          Confirmed parts use the site class; everything else keeps its{" "}
          <code className={ui.code}>.{prefix}-…</code> class. Custom properties always keep the
          prefix. Save to apply.
        </p>
        {status && (
          <p
            role={status.ok ? "status" : "alert"}
            className={status.ok ? undefined : ui.error}
            style={status.ok ? { margin: "8px 0 0", color: "#2e7d32" } : { margin: "8px 0 0" }}
          >
            {status.message}
            {unscopedProblems ? ` ${unscopedProblems}` : ""}
          </p>
        )}
      </section>

      {found && found.length > 0 && (
        <datalist id="site-classes">
          {found.slice(0, 500).map((c) => (
            <option key={c} value={`.${c}`} />
          ))}
        </datalist>
      )}

      <div className={ui.sections}>
        {components.map((id) => {
          const list = rows.filter((r) => r.componentId === id);
          return (
            <section key={id} className={ui.card} aria-labelledby={`map-${id}`}>
              <h2 id={`map-${id}`} className={ui.sectionHeading}>
                {list[0].componentName}
              </h2>
              <div className={styles.scroll}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th scope="col">Template class</th>
                      <th scope="col">Site class</th>
                      <th scope="col">Use</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <Row
                        key={r.part}
                        row={r}
                        prefix={prefix}
                        draft={draftOf(r.part)}
                        suggestions={suggestions[r.part] ?? []}
                        blockConfirmed={draftOf(r.part.split("__")[0]).state === "confirmed"}
                        notFound={
                          foundSet !== null &&
                          draftOf(r.part).state === "confirmed" &&
                          !foundSet.has(draftOf(r.part).selector.trim().slice(1))
                        }
                        problem={problems[r.part]}
                        onChange={(change) => edit(r.part, change)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function Row({
  row,
  prefix,
  draft,
  suggestions,
  blockConfirmed,
  notFound,
  problem,
  onChange,
}: {
  row: EditorRow;
  prefix: string;
  draft: Draft;
  suggestions: SiteSuggestion[];
  blockConfirmed: boolean;
  notFound: boolean;
  problem?: string;
  onChange: (change: Partial<Draft>) => void;
}) {
  const id = `map-${row.part}`;
  const best = suggestions.find((s) => s.selector === draft.selector.trim());
  return (
    <tr>
      <th scope="row" className={styles.part}>
        <label htmlFor={`${id}-selector`}>
          <code className={ui.code}>
            .{prefix}-{row.part}
          </code>
        </label>
        <div className={ui.muted}>{KIND[row.kind]}</div>
        <div className={styles.reason}>{row.purpose}</div>
      </th>
      <td>
        <input
          id={`${id}-selector`}
          className={`${ui.input} ${ui.code}`}
          value={draft.selector}
          onChange={(e) => onChange({ selector: e.target.value })}
          list="site-classes"
          placeholder=".site-class"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${id}-problem` : undefined}
          style={{ minWidth: 220 }}
        />
        {best && (
          <div className={styles.reason}>
            <span className={styles.badge} data-confidence={best.confidence}>
              {best.confidence}
            </span>{" "}
            {best.reason} · ×{best.count}
          </div>
        )}
        {suggestions.filter((s) => s.selector !== draft.selector.trim()).length > 0 && (
          <div className={styles.picks}>
            {suggestions
              .filter((s) => s.selector !== draft.selector.trim())
              .map((s) => (
                <button
                  key={s.selector}
                  type="button"
                  className={ui.linkButton}
                  onClick={() => onChange({ selector: s.selector })}
                >
                  Use {s.selector}
                </button>
              ))}
          </div>
        )}
        {best && (
          <details className={styles.sample}>
            <summary>Markup</summary>
            <pre tabIndex={0} aria-label={`Markup sample for ${best.selector}`}>
              {best.sample}
            </pre>
          </details>
        )}
        {row.kind === "element" && (
          <label className={styles.scope}>
            <input
              type="checkbox"
              checked={draft.scoped}
              disabled={!blockConfirmed}
              onChange={(e) => onChange({ scoped: e.target.checked })}
            />{" "}
            Only inside the block
            {!blockConfirmed && <span className={ui.muted}> (confirm the block first)</span>}
          </label>
        )}
        {notFound && <p className={styles.warn}>Not found on the pages read last time.</p>}
        {problem && (
          <p id={`${id}-problem`} className={ui.error} role="alert" style={{ margin: "4px 0 0" }}>
            {problem}
          </p>
        )}
      </td>
      <td>
        <select
          className={ui.input}
          value={draft.state}
          onChange={(e) => onChange({ state: e.target.value as Decision })}
          aria-label={`Use for .${prefix}-${row.part}`}
        >
          <option value="open">Not decided</option>
          <option value="confirmed">Site class</option>
          <option value="ignored">Template class</option>
        </select>
      </td>
    </tr>
  );
}
