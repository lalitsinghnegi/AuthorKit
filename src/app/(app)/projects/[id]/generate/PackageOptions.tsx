"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import ui from "@/components/ui/ui.module.css";
import type { NpmOptions } from "@/lib/model";
import { savePackageOptionsAction } from "./actions";

type Props = { projectId: string; initial: NpmOptions };

/** Options for how the package is shaped; currently npm packaging. */
export function PackageOptions({ projectId, initial }: Props) {
  const router = useRouter();
  const [options, setOptions] = useState(initial);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, start] = useTransition();
  const dirty = JSON.stringify(options) !== JSON.stringify(initial);

  const save = () =>
    start(async () => {
      const result = await savePackageOptionsAction(projectId, options);
      setStatus(
        result.ok
          ? { ok: true, message: "Saved. The package now reflects these options." }
          : { ok: false, message: result.error },
      );
      if (result.ok) router.refresh();
    });

  return (
    <section className={ui.card} aria-labelledby="package-options">
      <h2 id="package-options" className={ui.sectionHeading}>
        Package options
      </h2>
      <form
        className={ui.form}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label>
          <input
            type="checkbox"
            checked={options.enabled}
            onChange={(e) => setOptions({ ...options, enabled: e.target.checked })}
          />{" "}
          Include a <code className={ui.code}>package.json</code> so developers can install the CSS
          as an npm package
        </label>
        {options.enabled && (
          <>
            <div className={ui.field}>
              <label htmlFor="npm-name" className={ui.label}>
                Package name
              </label>
              <input
                id="npm-name"
                className={`${ui.input} ${ui.code}`}
                value={options.name}
                onChange={(e) => setOptions({ ...options, name: e.target.value })}
                spellCheck={false}
                autoComplete="off"
              />
              <span className={ui.hint}>
                Lowercase, for example acme-health-css or @acme/health-css.
              </span>
            </div>
            <div className={ui.field}>
              <label htmlFor="npm-version" className={ui.label}>
                Version
              </label>
              <input
                id="npm-version"
                className={`${ui.input} ${ui.code}`}
                value={options.version}
                onChange={(e) => setOptions({ ...options, version: e.target.value })}
                spellCheck={false}
                autoComplete="off"
              />
            </div>
          </>
        )}
        {status && (
          <p
            role="status"
            className={status.ok ? undefined : ui.error}
            style={status.ok ? { margin: 0, color: "#2e7d32" } : undefined}
          >
            {status.message}
          </p>
        )}
        <button type="submit" className={ui.button} disabled={!dirty || busy}>
          {busy ? "Saving…" : "Save options"}
        </button>
      </form>
    </section>
  );
}
