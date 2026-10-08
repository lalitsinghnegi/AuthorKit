import ui from "@/components/ui/ui.module.css";
import type { QualityReport } from "@/lib/quality/run";
import styles from "./GenerateView.module.css";

const kb = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`);

/** Results of the quality checks and the automatic fixes applied to the package. */
export function QualityCard({ quality }: { quality: QualityReport }) {
  const errors = quality.issues.filter((i) => i.severity === "error");
  const warnings = quality.issues.filter((i) => i.severity === "warning");
  const total = quality.sizes.reduce(
    (s, f) => ({ bytes: s.bytes + f.bytes, gzip: s.gzip + f.gzip }),
    { bytes: 0, gzip: 0 },
  );

  return (
    <section className={ui.card} aria-labelledby="quality">
      <h2 id="quality" className={ui.sectionHeading}>
        Quality checks{" "}
        <span className={styles.qualityBadge} data-ok={!quality.blocked || undefined}>
          {quality.blocked
            ? `${errors.length} error${errors.length === 1 ? "" : "s"}: download blocked`
            : "Passed"}
        </span>
      </h2>

      <ul className={styles.checks}>
        {quality.checks.map((c) => (
          <li key={c.id} data-state={c.errors ? "error" : c.warnings ? "warning" : "ok"}>
            <span aria-hidden="true">{c.errors ? "✗" : c.warnings ? "!" : "✓"}</span> {c.label}
            {(c.errors > 0 || c.warnings > 0) && (
              <span className={styles.checkCounts}>
                {c.errors > 0 && ` ${c.errors} error${c.errors === 1 ? "" : "s"}`}
                {c.warnings > 0 && ` ${c.warnings} warning${c.warnings === 1 ? "" : "s"}`}
              </span>
            )}
          </li>
        ))}
      </ul>

      {[...errors, ...warnings].length > 0 && (
        <ul className={styles.problems}>
          {[...errors, ...warnings].map((i, n) => (
            <li key={n} data-severity={i.severity}>
              {i.path && (
                <code className={ui.code}>
                  {i.path}
                  {i.line ? `:${i.line}` : ""}
                </code>
              )}
              {i.path && ": "}
              {i.message}
            </li>
          ))}
        </ul>
      )}

      {quality.fixes.length > 0 && (
        <details>
          <summary>Automatic fixes ({quality.fixes.length})</summary>
          <ul className={styles.defaultsList}>
            {quality.fixes.map((f, n) => (
              <li key={n}>
                {f.path && <code className={ui.code}>{f.path}</code>}
                {f.path && ": "}
                {f.description}
              </li>
            ))}
          </ul>
        </details>
      )}

      <details>
        <summary>
          File sizes ({kb(total.bytes)}, {kb(total.gzip)} gzipped)
        </summary>
        <table className={`${ui.table} ${styles.sourceTable}`}>
          <thead>
            <tr>
              <th scope="col">File</th>
              <th scope="col">Size</th>
              <th scope="col">Gzipped</th>
              <th scope="col">Rules</th>
              <th scope="col">Declarations</th>
            </tr>
          </thead>
          <tbody>
            {quality.sizes.map((s) => (
              <tr key={s.path}>
                <td>
                  <code className={ui.code}>{s.path}</code>
                </td>
                <td>{kb(s.bytes)}</td>
                <td>{kb(s.gzip)}</td>
                <td>{s.rules}</td>
                <td>{s.declarations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
