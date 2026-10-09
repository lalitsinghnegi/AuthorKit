"use client";

import ui from "@/components/ui/ui.module.css";

/** Unexpected errors on a screen: a plain message and a reference, never internal details. */
export default function ScreenError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <section className={ui.card} role="alert" aria-labelledby="error-title">
      <h1 id="error-title" style={{ margin: "0 0 8px", fontSize: "1.3rem" }}>
        Something went wrong
      </h1>
      <p style={{ margin: "0 0 16px" }}>
        This screen could not be loaded. Try again; if it keeps happening, give an admin the
        reference below so they can find the details in the server log.
      </p>
      {error.digest && (
        <p className={ui.muted} style={{ margin: "0 0 16px" }}>
          Reference: <code className={ui.code}>{error.digest}</code>
        </p>
      )}
      <button type="button" className={ui.button} onClick={() => retry()}>
        Try again
      </button>
    </section>
  );
}
