"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { PanelActions } from "@/components/AppShell/PanelActions";
import { PanelButton, PanelSection } from "@/components/AppShell/PanelSection";
import panel from "@/components/AppShell/AppShell.module.css";
import ui from "@/components/ui/ui.module.css";
import { TOKEN_TYPES, type DesignToken, type TokenType } from "@/lib/model";
import { TEMPLATE_TOKENS, templateTokensOfType } from "@/lib/tokens/naming";
import { TOKEN_NAME, validateTokenValue } from "@/lib/tokens/validateValue";
import { extractTokensAction, saveTokensAction, type TokenEdit } from "./actions";
import { TokenPreview } from "./TokenPreview";
import styles from "./TokenReview.module.css";

type Props = {
  projectId: string;
  initialTokens: DesignToken[];
  figmaConnected: boolean;
  sourceLinks: number;
};
type Filter = "all" | "review" | "excluded";
type Status = { kind: "idle" | "ok" | "error"; message?: string; notes?: string[] };

const TYPE_LABELS: Record<TokenType, string> = {
  color: "Colors",
  fontFamily: "Font families",
  fontSize: "Font sizes",
  fontWeight: "Font weights",
  lineHeight: "Line heights",
  letterSpacing: "Letter spacing",
  spacing: "Spacing",
  radius: "Radius",
  border: "Borders",
  shadow: "Shadows",
  zIndex: "Z-index",
  duration: "Durations",
  size: "Sizes",
};
const STATUS_LABELS: Record<DesignToken["status"], string> = {
  auto: "To review",
  accepted: "Accepted",
  overridden: "Overridden",
  excluded: "Excluded",
};

const edits = (tokens: DesignToken[]): TokenEdit[] =>
  tokens.map(({ id, name, value, status }) => ({ id, name, value, status }));

export function TokenReview({ projectId, initialTokens, figmaConnected, sourceLinks }: Props) {
  const [tokens, setTokens] = useState(initialTokens);
  const [saved, setSaved] = useState(initialTokens);
  const [filter, setFilter] = useState<Filter>("all");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [busy, start] = useTransition();

  const dirty = JSON.stringify(edits(tokens)) !== JSON.stringify(edits(saved));
  const active = tokens.filter((t) => t.status !== "excluded");

  // Per-token problems that block saving.
  const problems = useMemo(() => {
    const out = new Map<string, string>();
    const names = new Map<string, number>();
    for (const t of active) names.set(t.name, (names.get(t.name) ?? 0) + 1);
    for (const t of tokens) {
      if (!TOKEN_NAME.test(t.name)) out.set(t.id, "Use lowercase kebab-case, e.g. color-primary");
      else if (t.status !== "excluded" && (names.get(t.name) ?? 0) > 1)
        out.set(t.id, `Another token is already named ${t.name}`);
      else {
        const err = validateTokenValue(t.type, t.value);
        if (err) out.set(t.id, err);
      }
    }
    return out;
  }, [tokens, active]);

  const counts = {
    review: tokens.filter((t) => t.status === "auto").length,
    excluded: tokens.length - active.length,
  };
  const visible = tokens.filter((t) =>
    filter === "review"
      ? t.status === "auto"
      : filter === "excluded"
        ? t.status === "excluded"
        : true,
  );
  const covered = new Set(active.map((t) => t.name));
  const onDefaults = [...TEMPLATE_TOKENS.keys()].filter((n) => !covered.has(n));
  const background = active.find((t) => t.name === "color-background")?.value ?? "#ffffff";

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (id: string, patch: Partial<DesignToken>) => {
    setTokens((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    setStatus({ kind: "idle" });
  };
  const setValue = (t: DesignToken, value: string) =>
    update(t.id, {
      value,
      status:
        t.status === "excluded"
          ? "excluded"
          : value.trim() !== t.originalValue
            ? "overridden"
            : "accepted",
    });

  const extract = () => {
    if (
      dirty &&
      !confirm("Extracting reloads tokens from Figma and discards unsaved edits. Continue?")
    )
      return;
    start(async () => {
      const result = await extractTokensAction(projectId);
      if (!result.ok) return setStatus({ kind: "error", message: result.error });
      setTokens(result.tokens);
      setSaved(result.tokens);
      const { added, changed, missing } = result.summary;
      setStatus({
        kind: "ok",
        message: `Extracted from Figma: ${added} new, ${changed} changed, ${missing} no longer found.`,
        notes: result.notes,
      });
    });
  };

  const acceptAll = () =>
    setTokens((list) =>
      list.map((t) => (t.status === "auto" && !t.meta?.missing ? { ...t, status: "accepted" } : t)),
    );

  const save = () =>
    start(async () => {
      const result = await saveTokensAction(projectId, edits(tokens));
      if (!result.ok) return setStatus({ kind: "error", message: result.error });
      setTokens(result.tokens);
      setSaved(result.tokens);
      setStatus({ kind: "ok", message: "Tokens saved." });
    });

  const discard = () => {
    if (!confirm("Discard unsaved changes?")) return;
    setTokens(saved);
    setStatus({ kind: "idle" });
  };

  const canExtract = figmaConnected && sourceLinks > 0;

  return (
    <div className={ui.sections}>
      <PanelActions>
        <PanelSection title="Tokens">
          {dirty && <span className={panel.dirty}>Unsaved changes</span>}
          <PanelButton onClick={extract} disabled={!canExtract || busy}>
            {busy ? "Working…" : "Extract from Figma"}
          </PanelButton>
          <PanelButton
            variant="secondary"
            onClick={acceptAll}
            disabled={busy || counts.review === 0}
          >
            Accept all
          </PanelButton>
          <PanelButton
            variant="secondary"
            onClick={save}
            disabled={!dirty || problems.size > 0 || busy}
          >
            Save
          </PanelButton>
          {dirty && problems.size > 0 && (
            <p className={panel.panelHint}>Fix the highlighted tokens to save.</p>
          )}
          <PanelButton variant="secondary" onClick={discard} disabled={!dirty || busy}>
            Discard changes
          </PanelButton>
          <dl className={styles.counts}>
            <dt>To review</dt>
            <dd>{counts.review}</dd>
            <dt>Excluded</dt>
            <dd>{counts.excluded}</dd>
          </dl>
        </PanelSection>
      </PanelActions>

      {!canExtract && (
        <p className={ui.hint} style={{ margin: 0 }}>
          {!figmaConnected ? (
            <>
              <Link href="/settings">Connect Figma in Settings</Link> to extract tokens.
            </>
          ) : (
            <>
              Add a Figma link for global styles or a component under{" "}
              <Link href={`/projects/${projectId}/figma`}>Figma</Link> to extract tokens.
            </>
          )}
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

      {tokens.length === 0 ? (
        <section className={ui.card}>
          <p className={ui.muted} style={{ margin: 0 }}>
            No tokens yet. Use <strong>Extract from Figma</strong> in the left panel. Until tokens
            are accepted, the generated CSS uses AuthorKit&apos;s defaults.
          </p>
        </section>
      ) : (
        <>
          <div className={styles.filters} role="group" aria-label="Show">
            {(
              [
                ["all", `All (${tokens.length})`],
                ["review", `To review (${counts.review})`],
                ["excluded", `Excluded (${counts.excluded})`],
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

          {TOKEN_TYPES.filter((type) => visible.some((t) => t.type === type)).map((type) => (
            <section key={type} className={ui.card} aria-labelledby={`tokens-${type}`}>
              <h2 id={`tokens-${type}`} className={ui.sectionHeading}>
                {TYPE_LABELS[type]}
              </h2>
              <datalist id={`names-${type}`}>
                {templateTokensOfType(type).map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              <div className={styles.tableWrap}>
                <table className={`${ui.table} ${styles.table}`}>
                  <thead>
                    <tr>
                      <th scope="col">Preview</th>
                      <th scope="col">Name</th>
                      <th scope="col">Value</th>
                      <th scope="col">From Figma</th>
                      <th scope="col">Notes</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible
                      .filter((t) => t.type === type)
                      .map((t) => (
                        <TokenRow
                          key={t.id}
                          token={t}
                          problem={problems.get(t.id)}
                          background={background}
                          onName={(name) => update(t.id, { name })}
                          onValue={(value) => setValue(t, value)}
                          onStatus={(s) =>
                            update(
                              t.id,
                              s === "auto" ? { status: s, value: t.originalValue } : { status: s },
                            )
                          }
                          onDelete={() => setTokens((list) => list.filter((x) => x.id !== t.id))}
                        />
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}

      {onDefaults.length > 0 && (
        <details className={ui.card}>
          <summary>
            {onDefaults.length} template token{onDefaults.length === 1 ? "" : "s"} will use
            AuthorKit defaults
          </summary>
          <p className={ui.hint}>
            No active token has these names. Rename an extracted token to one of them to use it.
          </p>
          <p className={styles.defaultList}>
            {onDefaults.map((n) => (
              <code key={n} className={ui.code}>
                {n}
              </code>
            ))}
          </p>
        </details>
      )}
    </div>
  );
}

type RowProps = {
  token: DesignToken;
  problem?: string;
  background: string;
  onName: (name: string) => void;
  onValue: (value: string) => void;
  onStatus: (status: DesignToken["status"]) => void;
  onDelete: () => void;
};

function TokenRow({
  token: t,
  problem,
  background,
  onName,
  onValue,
  onStatus,
  onDelete,
}: RowProps) {
  const meta = t.meta;
  const excluded = t.status === "excluded";
  const nodeUrl =
    t.source?.nodeId && t.source.fileKey
      ? `https://www.figma.com/design/${t.source.fileKey}?node-id=${t.source.nodeId.replace(":", "-")}`
      : undefined;
  const errorId = `token-error-${t.id}`;

  return (
    <tr className={styles.row} data-status={t.status} data-invalid={problem ? true : undefined}>
      <td>
        <TokenPreview type={t.type} value={t.value} background={background} />
      </td>
      <td>
        <input
          className={`${ui.input} ${ui.code} ${styles.nameInput}`}
          value={t.name}
          list={`names-${t.type}`}
          onChange={(e) => onName(e.target.value)}
          aria-label={`Name for ${meta?.figmaName ?? t.name}`}
          aria-invalid={problem && !TOKEN_NAME.test(t.name) ? true : undefined}
          spellCheck={false}
          disabled={excluded}
        />
        <div className={styles.sub}>
          {(meta?.mapped ?? TEMPLATE_TOKENS.has(t.name)) ? (
            <span className={styles.mapped}>fills the CSS</span>
          ) : (
            <span className={styles.custom}>not used</span>
          )}
        </div>
      </td>
      <td>
        <input
          className={`${ui.input} ${ui.code} ${styles.valueInput}`}
          value={t.value}
          onChange={(e) => onValue(e.target.value)}
          aria-label={`Value of ${t.name}`}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? errorId : undefined}
          spellCheck={false}
          disabled={excluded}
        />
        {t.status === "overridden" && t.originalValue && (
          <div className={styles.sub}>
            Figma: <code className={ui.code}>{t.originalValue}</code>
          </div>
        )}
        {problem && (
          <div id={errorId} className={ui.error} role="alert">
            {problem}
          </div>
        )}
      </td>
      <td className={styles.source}>
        {meta ? (
          <>
            {nodeUrl ? (
              <a href={nodeUrl} target="_blank" rel="noopener noreferrer">
                {meta.figmaName}
              </a>
            ) : (
              meta.figmaName
            )}
            <div className={styles.sub}>
              {meta.origin} · used {meta.usage}×
            </div>
          </>
        ) : (
          <span className={ui.muted}>Added by hand</span>
        )}
      </td>
      <td>
        {meta && (
          <>
            {meta.reasons.length > 0 && (
              <ul className={styles.reasons}>
                {meta.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            {meta.note && <p className={styles.note}>{meta.note}</p>}
          </>
        )}
      </td>
      <td>
        <span className={styles.status} data-status={t.status}>
          {STATUS_LABELS[t.status]}
        </span>
        <div className={styles.actions}>
          {(t.status === "auto" || excluded) && (
            <button
              type="button"
              onClick={() => onStatus("accepted")}
              aria-label={`Accept ${t.name}`}
            >
              Accept
            </button>
          )}
          {!excluded && (
            <button
              type="button"
              onClick={() => onStatus("excluded")}
              aria-label={`Exclude ${t.name}`}
            >
              Exclude
            </button>
          )}
          {(t.status === "overridden" || t.status === "accepted") && (
            <button type="button" onClick={() => onStatus("auto")} aria-label={`Reset ${t.name}`}>
              Reset
            </button>
          )}
          {meta?.missing && (
            <button
              type="button"
              className={styles.danger}
              onClick={onDelete}
              aria-label={`Delete ${t.name}`}
            >
              Delete
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
