"use client";

/** Last-resort error page; renders its own document, so styles are inline. */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          padding: 32,
          color: "#1b2030",
          background: "#f5f6f8",
        }}
      >
        <main role="alert">
          <h1 style={{ fontSize: "1.3rem" }}>AuthorKit hit an unexpected error</h1>
          <p>Try again. If it keeps happening, give an admin this reference for the server log.</p>
          {error.digest && (
            <p>
              Reference: <code>{error.digest}</code>
            </p>
          )}
          <button
            type="button"
            onClick={() => retry()}
            style={{ font: "inherit", padding: "8px 16px" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
