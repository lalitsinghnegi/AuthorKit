"use client";

import { useActionState, useState, useTransition } from "react";
import { PanelActions } from "@/components/AppShell/PanelActions";
import { PanelButton, PanelSection } from "@/components/AppShell/PanelSection";
import ui from "@/components/ui/ui.module.css";
import type { FigmaStatus } from "@/lib/storage/settings";
import {
  removeFigmaTokenAction,
  saveFigmaTokenAction,
  testFigmaConnectionAction,
  type SettingsResult,
} from "./actions";

type Props = { initialStatus: FigmaStatus; keyConfigured: boolean };

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function SettingsView({ initialStatus, keyConfigured }: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [result, setResult] = useState<SettingsResult | null>(null);
  const [busy, start] = useTransition();

  const [saveResult, saveAction, saving] = useActionState(
    async (prev: SettingsResult | null, data: FormData) => {
      const r = await saveFigmaTokenAction(prev, data);
      if (r.status) setStatus(r.status);
      setResult(r);
      return r;
    },
    null,
  );

  const run = (action: () => Promise<SettingsResult>) =>
    start(async () => {
      const r = await action();
      if (r.status) setStatus(r.status);
      setResult(r);
    });

  const remove = () => {
    if (
      !confirm(
        "Remove the saved Figma token? Figma features stop working until a new one is saved.",
      )
    )
      return;
    run(removeFigmaTokenAction);
  };

  return (
    <div className={ui.sections}>
      <PanelActions>
        <PanelSection title="Figma">
          <PanelButton
            onClick={() => run(testFigmaConnectionAction)}
            disabled={!status.connected || busy}
          >
            {busy ? "Checking…" : "Test connection"}
          </PanelButton>
          <PanelButton variant="danger" onClick={remove} disabled={!status.connected || busy}>
            Remove token
          </PanelButton>
        </PanelSection>
      </PanelActions>

      {result && (
        <p
          role="status"
          className={result.ok ? undefined : ui.error}
          style={result.ok ? { color: "#2e7d32", margin: 0 } : undefined}
        >
          {result.ok ? result.message : result.error}
        </p>
      )}

      {!keyConfigured && (
        <section className={ui.card} role="alert" aria-labelledby="key-missing">
          <h2 id="key-missing" className={ui.sectionHeading}>
            Encryption key needed
          </h2>
          <p style={{ marginTop: 0 }}>
            AuthorKit encrypts the Figma token before saving it. Add{" "}
            <code className={ui.code}>ENCRYPTION_KEY</code> to <code className={ui.code}>.env</code>{" "}
            and restart the app:
          </p>
          <pre className={ui.code} style={{ whiteSpace: "pre-wrap" }}>
            node -e
            &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;base64&apos;))&quot;
          </pre>
        </section>
      )}

      <section className={ui.card} aria-labelledby="figma-status">
        <h2 id="figma-status" className={ui.sectionHeading}>
          Figma connection
        </h2>
        {status.connected ? (
          <p style={{ margin: 0 }}>
            Connected as <strong>{status.account?.handle}</strong>
            {status.account?.email && <span className={ui.muted}> ({status.account.email})</span>}
            {status.savedAt && (
              <span className={ui.muted}>
                {" "}
                · saved {dateFormat.format(new Date(status.savedAt))}
              </span>
            )}
          </p>
        ) : (
          <p className={ui.muted} style={{ margin: 0 }}>
            Not connected. Projects can still be configured, but reading designs from Figma needs a
            token.
          </p>
        )}
      </section>

      <section className={ui.card} aria-labelledby="figma-token">
        <h2 id="figma-token" className={ui.sectionHeading}>
          {status.connected ? "Replace token" : "Add a token"}
        </h2>
        <form action={saveAction} className={ui.form}>
          <div className={ui.field}>
            <label htmlFor="token" className={ui.label}>
              Figma personal access token
            </label>
            <input
              id="token"
              name="token"
              type="password"
              className={`${ui.input} ${ui.code}`}
              autoComplete="off"
              spellCheck={false}
              required
              disabled={!keyConfigured}
              aria-describedby="token-hint"
              aria-invalid={saveResult && !saveResult.ok ? true : undefined}
            />
            <span id="token-hint" className={ui.hint}>
              Create one in Figma under Settings → Security → Personal access tokens, with read
              access to files. It is checked with Figma, encrypted, stored on the server only, and
              never shown again.
            </span>
          </div>
          <button type="submit" className={ui.button} disabled={!keyConfigured || saving}>
            {saving ? "Checking with Figma…" : "Save & test"}
          </button>
        </form>
      </section>
    </div>
  );
}
