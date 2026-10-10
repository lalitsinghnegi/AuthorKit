"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { PanelActions } from "@/components/AppShell/PanelActions";
import { PanelButton, PanelSection } from "@/components/AppShell/PanelSection";
import panel from "@/components/AppShell/AppShell.module.css";
import ui from "@/components/ui/ui.module.css";
import {
  describeRange,
  fixAll,
  hasErrors,
  mediaQueries,
  validateBreakpoints,
  type Issue,
  type QueryMode,
} from "@/lib/breakpoints";
import { takeBreakpoints, type BreakpointValues } from "@/lib/breakpoints/presets";
import { MAX_BREAKPOINTS, type Breakpoint, type BreakpointSet, type Project } from "@/lib/model";
import { applyChanges, parseRows, sortRows, toRow, uniqueName, type Row } from "./rows";
import styles from "./BreakpointEditor.module.css";

type Approach = Project["approach"];
export type BreakpointSavePayload = { approach?: Approach; breakpoints: BreakpointSet };
export type BreakpointSaveResult = { ok: true; savedAt: string } | { ok: false; error: string };
export type TemplateBreakpoints = { id: string; name: string; breakpoints: BreakpointValues[] };

type Props = {
  /** Class prefix used in the media query preview. */
  prefix: string;
  initialBreakpoints: Breakpoint[];
  /** Projects only: shows the responsive approach section. */
  initialApproach?: Approach;
  /** Templates offered by "Apply from template". */
  templates?: TemplateBreakpoints[];
  onSave: (payload: BreakpointSavePayload) => Promise<BreakpointSaveResult>;
};
type Status = { kind: "idle" | "saved" | "error"; message?: string };

const snapshot = (approach: Approach | undefined, rows: Row[]) =>
  JSON.stringify({ approach, rows });

export function BreakpointEditor({
  prefix,
  initialBreakpoints,
  initialApproach,
  templates,
  onSave,
}: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => sortRows(initialBreakpoints.map(toRow)));
  const [approach, setApproach] = useState<Approach | undefined>(initialApproach);
  const [saved, setSaved] = useState(() => snapshot(initialApproach, rows));
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [previewMode, setPreviewMode] = useState<QueryMode>(initialApproach ?? "mobile-first");
  const [saving, startSaving] = useTransition();
  const focusRowId = useRef<string | null>(null);

  const { breakpoints, errors: fieldErrors } = useMemo(() => parseRows(rows), [rows]);
  const issues = useMemo(() => validateBreakpoints(breakpoints), [breakpoints]);
  const dirty = snapshot(approach, rows) !== saved;
  const blocked = fieldErrors.size > 0 || hasErrors(issues);
  const canSave = dirty && !blocked && !saving;
  const fixable = fieldErrors.size === 0 && issues.some((i) => i.fixes.length > 0);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Move focus to a newly added row.
  useEffect(() => {
    if (!focusRowId.current) return;
    document.getElementById(`bp-name-${focusRowId.current}`)?.focus();
    focusRowId.current = null;
  }, [rows]);

  const edit = (next: Row[]) => {
    setRows(next);
    setStatus({ kind: "idle" });
  };
  const updateRow = (id: string, patch: Partial<Row>) =>
    edit(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addRow = () => {
    const id = crypto.randomUUID();
    focusRowId.current = id;
    edit([...rows, { id, name: uniqueName(rows), min: "", max: "" }]);
  };
  const removeRow = (id: string) => edit(rows.filter((r) => r.id !== id));
  const applyIssueFix = (issue: Issue, fixIndex: number) =>
    edit(sortRows(applyChanges(rows, issue.fixes[fixIndex].changes)));
  const runFixAll = () => edit(sortRows(fixAll(breakpoints).map(toRow)));

  /** Replace the rows with a template's breakpoints, keeping ids of same-named rows. */
  const applyTemplate = (templateId: string) => {
    const template = templates?.find((t) => t.id === templateId);
    if (!template || !confirm(`Replace the current breakpoints with those of "${template.name}"?`))
      return;
    const current = rows.map((r) => ({ id: r.id, name: r.name }));
    edit(
      sortRows(
        takeBreakpoints(template.breakpoints, () => crypto.randomUUID(), current).map(toRow),
      ),
    );
  };

  const discard = () => {
    if (!confirm("Discard unsaved changes?")) return;
    const restored = JSON.parse(saved) as { approach?: Approach; rows: Row[] };
    setApproach(restored.approach);
    setPreviewMode(restored.approach ?? "mobile-first");
    edit(restored.rows);
  };

  const save = () =>
    startSaving(async () => {
      const result = await onSave({ approach, breakpoints: { breakpoints } });
      if (result.ok) {
        setSaved(snapshot(approach, rows));
        setStatus({ kind: "saved", message: "Breakpoints saved." });
        router.refresh();
      } else {
        setStatus({ kind: "error", message: result.error });
      }
    });

  const issuesFor = (id: string) => issues.filter((i) => i.breakpointIds.includes(id));

  return (
    <div className={styles.layout}>
      <PanelActions>
        <PanelSection title="Breakpoints">
          {dirty && <span className={panel.dirty}>Unsaved changes</span>}
          <PanelButton onClick={save} disabled={!canSave} aria-describedby="bp-save-hint">
            {saving ? "Saving…" : "Save breakpoints"}
          </PanelButton>
          {dirty && blocked && (
            <p id="bp-save-hint" className={panel.panelHint}>
              Fix the errors to save.
            </p>
          )}
          <PanelButton
            variant="secondary"
            onClick={addRow}
            disabled={rows.length >= MAX_BREAKPOINTS}
          >
            Add breakpoint
          </PanelButton>
          {rows.length >= MAX_BREAKPOINTS && (
            <p className={panel.panelHint}>Up to {MAX_BREAKPOINTS} breakpoints.</p>
          )}
          <PanelButton variant="secondary" onClick={runFixAll} disabled={!fixable}>
            Fix all
          </PanelButton>
          {templates && templates.length > 0 && (
            <>
              <label className={panel.visuallyHidden} htmlFor="bp-template">
                Apply breakpoints from a template
              </label>
              <select
                id="bp-template"
                className={panel.panelSelect}
                value=""
                onChange={(e) => applyTemplate(e.target.value)}
              >
                <option value="" disabled>
                  Apply from template…
                </option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.breakpoints.map((b) => b.name).join(", ")})
                  </option>
                ))}
              </select>
            </>
          )}
          <PanelButton variant="secondary" onClick={discard} disabled={!dirty}>
            Discard changes
          </PanelButton>
        </PanelSection>
      </PanelActions>

      <p aria-live="polite" className={styles.status} data-kind={status.kind}>
        {status.message}
      </p>

      {approach && (
        <section className={ui.card} aria-labelledby="bp-approach">
          <h2 id="bp-approach" className={ui.sectionHeading}>
            Approach
          </h2>
          <div className={ui.radioRow} role="radiogroup" aria-labelledby="bp-approach">
            {(["mobile-first", "desktop-first"] as const).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="approach"
                  value={value}
                  checked={approach === value}
                  onChange={() => {
                    setApproach(value);
                    setPreviewMode(value);
                    setStatus({ kind: "idle" });
                  }}
                />{" "}
                {value === "mobile-first"
                  ? "Mobile-first: base styles for the smallest screen, min-width queries"
                  : "Desktop-first: base styles for the largest screen, max-width queries"}
              </label>
            ))}
          </div>
        </section>
      )}

      <section className={ui.card} aria-labelledby="bp-table">
        <h2 id="bp-table" className={ui.sectionHeading}>
          Ranges
        </h2>
        <table className={`${ui.table} ${styles.table}`}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Min width (px)</th>
              <th scope="col">Max width (px)</th>
              <th scope="col">Range</th>
              <th scope="col">
                <span className={panel.visuallyHidden}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const errs = fieldErrors.get(row.id) ?? {};
              const rowIssues = issuesFor(row.id);
              const label = row.name || `row ${index + 1}`;
              const parsed = breakpoints.find((b) => b.id === row.id)!;
              const messages = [
                ...Object.values(errs).map((m) => ({ severity: "error" as const, message: m })),
                ...rowIssues,
              ];
              return (
                <Fragment key={row.id}>
                  <tr data-severity={rowSeverity(errs, rowIssues)} className={styles.row}>
                    <td>
                      <input
                        id={`bp-name-${row.id}`}
                        className={`${ui.input} ${ui.code}`}
                        value={row.name}
                        aria-label={`Name of ${label}`}
                        aria-invalid={Boolean(errs.name) || undefined}
                        onChange={(e) => updateRow(row.id, { name: e.target.value })}
                        spellCheck={false}
                      />
                    </td>
                    <td>
                      <input
                        className={ui.input}
                        inputMode="numeric"
                        value={row.min}
                        placeholder="none"
                        aria-label={`Min width of ${label} in pixels`}
                        aria-invalid={Boolean(errs.min) || undefined}
                        onChange={(e) => updateRow(row.id, { min: e.target.value })}
                        onBlur={() => setRows(sortRows(rows))}
                      />
                    </td>
                    <td>
                      <input
                        className={ui.input}
                        inputMode="numeric"
                        value={row.max}
                        placeholder="none"
                        aria-label={`Max width of ${label} in pixels`}
                        aria-invalid={Boolean(errs.max) || undefined}
                        onChange={(e) => updateRow(row.id, { max: e.target.value })}
                        onBlur={() => setRows(sortRows(rows))}
                      />
                    </td>
                    <td className={ui.muted}>{describeRange(parsed)}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.removeButton}
                        onClick={() => removeRow(row.id)}
                        disabled={rows.length === 1}
                        aria-label={`Remove ${label}`}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                  {messages.length > 0 && (
                    <tr className={styles.messageRow}>
                      <td colSpan={5}>
                        <ul className={styles.messages}>
                          {messages.map((m, i) => (
                            <li key={i} data-severity={m.severity}>
                              {m.message}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        <Ruler breakpoints={breakpoints} />
      </section>

      <section className={ui.card} aria-labelledby="bp-issues">
        <h2 id="bp-issues" className={ui.sectionHeading}>
          Problems {issues.length > 0 && `(${issues.length})`}
        </h2>
        {issues.length === 0 ? (
          <p className={ui.muted} style={{ margin: 0 }}>
            No overlaps, gaps or conflicts. Every width is covered by exactly one breakpoint.
          </p>
        ) : (
          <ul className={styles.issues}>
            {issues.map((issue, i) => (
              <li key={`${issue.code}-${i}`} data-severity={issue.severity}>
                <span className={styles.severity}>{issue.severity}</span>
                <span>{issue.message}</span>
                <span className={styles.fixes}>
                  {issue.fixes.map((fix, f) => (
                    <button
                      key={f}
                      type="button"
                      className={styles.fixButton}
                      onClick={() => applyIssueFix(issue, f)}
                      disabled={fieldErrors.size > 0}
                    >
                      {fix.label}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={ui.card} aria-labelledby="bp-preview">
        <h2 id="bp-preview" className={ui.sectionHeading}>
          Media query preview
        </h2>
        <div className={styles.modes} role="group" aria-label="Output style">
          {(["mobile-first", "desktop-first", "range"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={styles.modeButton}
              aria-pressed={previewMode === mode}
              onClick={() => setPreviewMode(mode)}
            >
              {mode}
              {mode === approach && " (project)"}
            </button>
          ))}
        </div>
        {blocked && (
          <p className={ui.error}>Preview may be wrong until the errors above are fixed.</p>
        )}
        <pre className={styles.code}>
          <code>{previewCss(breakpoints, previewMode, prefix)}</code>
        </pre>
      </section>
    </div>
  );
}

function rowSeverity(errs: object, issues: Issue[]) {
  if (Object.keys(errs).length || issues.some((i) => i.severity === "error")) return "error";
  if (issues.length) return "warning";
  return undefined;
}

function previewCss(list: Breakpoint[], mode: QueryMode, prefix: string): string {
  const byId = new Map(list.map((b) => [b.id, b]));
  return mediaQueries(list, mode)
    .map(({ breakpointId, name, condition }) => {
      const range = describeRange(byId.get(breakpointId)!);
      const selector = `.${prefix}-example`;
      if (!condition) {
        return `/* ${name} (${range}): base styles, no media query */\n${selector} { … }`;
      }
      return `/* ${name} (${range}) */\n@media ${condition} {\n  ${selector} { … }\n}`;
    })
    .join("\n\n");
}

/** Width ruler: one bar per breakpoint so gaps and overlaps are visible at a glance. */
function Ruler({ breakpoints }: { breakpoints: Breakpoint[] }) {
  const bounds = breakpoints
    .flatMap((b) => [b.minWidth, b.maxWidth])
    .filter((n) => n !== undefined);
  const scale = Math.max(1600, Math.max(0, ...bounds) + 400);
  const ticks = [...new Set([0, ...bounds])].sort((a, b) => a - b);
  const pct = (n: number) => `${(Math.min(n, scale) / scale) * 100}%`;

  return (
    <div className={styles.ruler} aria-hidden="true">
      {breakpoints.map((b) => {
        const from = b.minWidth ?? 0;
        const to = b.maxWidth === undefined ? scale : b.maxWidth + 1;
        const invalid = to <= from;
        return (
          <div key={b.id} className={styles.track}>
            <div
              className={styles.bar}
              data-invalid={invalid || undefined}
              style={{
                left: pct(from),
                width: invalid ? "2px" : `calc(${pct(to)} - ${pct(from)})`,
              }}
            >
              {b.name}
            </div>
          </div>
        );
      })}
      <div className={styles.ticks}>
        {ticks.map((t) => (
          <span key={t} style={{ left: pct(t) }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
