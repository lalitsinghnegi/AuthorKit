"use client";

import { useActionState, useState, useTransition } from "react";
import ui from "@/components/ui/ui.module.css";
import { CSS_TEMPLATE_LABELS, type CssTemplateId } from "@/lib/model";
import { resetPatternsAction, savePatternsAction, type PatternsState } from "./patternActions";

type Props = { initial: Record<string, string[]>; customised: boolean };

export function PatternsCard({ initial, customised }: Props) {
  const [patterns, setPatterns] = useState(initial);
  const [isCustom, setIsCustom] = useState(customised);
  // Remount the fields after a save or reset so they show the stored values.
  const [version, setVersion] = useState(0);
  const [resetResult, setResetResult] = useState<PatternsState | null>(null);
  const [resetting, startReset] = useTransition();

  const [state, action, saving] = useActionState(async (prev: PatternsState, data: FormData) => {
    const result = await savePatternsAction(prev, data);
    if (result.patterns) {
      setPatterns(result.patterns);
      setIsCustom(true);
      setVersion((v) => v + 1);
    }
    setResetResult(null);
    return result;
  }, {});

  const reset = () =>
    startReset(async () => {
      const result = await resetPatternsAction();
      if (result.patterns) setPatterns(result.patterns);
      setIsCustom(false);
      setVersion((v) => v + 1);
      setResetResult(result);
    });

  const shown = resetResult ?? state;

  return (
    <section className={ui.card} aria-labelledby="patterns-title">
      <h2 id="patterns-title" className={ui.sectionHeading}>
        Component name patterns {isCustom ? "" : <span className={ui.muted}>(defaults)</span>}
      </h2>
      <p className={ui.hint} style={{ marginTop: 0 }}>
        Keywords that identify a component from a Figma frame name, separated by commas. They match
        whole words and ignore case, so “isi” matches “ISI / Desktop” but not “Visible”.
      </p>
      <form action={action} className={ui.form} style={{ maxWidth: 720 }} key={version}>
        {Object.entries(patterns).map(([id, keywords]) => (
          <div key={id} className={ui.field}>
            <label htmlFor={`pattern-${id}`} className={ui.label}>
              {CSS_TEMPLATE_LABELS[id as CssTemplateId]}
            </label>
            <input
              id={`pattern-${id}`}
              name={id}
              className={ui.input}
              defaultValue={keywords.join(", ")}
              maxLength={1000}
            />
          </div>
        ))}
        {shown.error && (
          <p role="alert" className={ui.error}>
            {shown.error}
          </p>
        )}
        {shown.message && (
          <p role="status" style={{ margin: 0, color: "#2e7d32" }}>
            {shown.message}
          </p>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" className={ui.button} disabled={saving}>
            {saving ? "Saving…" : "Save patterns"}
          </button>
          <button
            type="button"
            className={ui.button}
            onClick={reset}
            disabled={!isCustom || resetting}
            style={{
              background: "transparent",
              color: "var(--ui-fg)",
              border: "1px solid var(--ui-border)",
            }}
          >
            Reset to defaults
          </button>
        </div>
      </form>
    </section>
  );
}
