import Link from "next/link";
import ui from "@/components/ui/ui.module.css";
import type { GenerationReport, SourceKind } from "@/lib/templates/sources";
import styles from "./GenerateView.module.css";

const SCREENS = { tokens: "Tokens", mapping: "Components", responsive: "Responsive" } as const;
const SOURCE_LABEL: Record<SourceKind, string> = {
  "figma-token": "Figma token",
  override: "Your override",
  responsive: "Measured per breakpoint",
  "responsive-fluid": "Estimated (fluid)",
  default: "Default",
};

/** Where the package's values came from, what still uses defaults, and what needs attention. */
export function DesignSources({
  report,
  prefix,
  projectId,
}: {
  report: GenerationReport;
  prefix: string;
  projectId: string;
}) {
  const fromFigma = report.rows.filter((r) => r.source !== "default");
  const defaults = report.rows.filter((r) => r.source === "default");
  const byFile = new Map<string, string[]>();
  for (const r of defaults) byFile.set(r.file, [...(byFile.get(r.file) ?? []), r.name]);

  return (
    <section className={ui.card} aria-labelledby="design-sources">
      <h2 id="design-sources" className={ui.sectionHeading}>
        Design sources
      </h2>
      <p style={{ marginTop: 0 }}>
        <strong>{fromFigma.length}</strong> value{fromFigma.length === 1 ? "" : "s"} from Figma ·{" "}
        <strong>{defaults.length}</strong> default{defaults.length === 1 ? "" : "s"}
      </p>

      {report.attention.length > 0 && (
        <div className={styles.attention}>
          <h3 className={styles.subheading}>Needs attention ({report.attention.length})</h3>
          <ul>
            {report.attention.map((a, i) => (
              <li key={i}>
                {a.message}
                {a.screen && (
                  <>
                    {" "}
                    <Link href={`/projects/${projectId}/${a.screen}`}>
                      Open {SCREENS[a.screen]}
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {fromFigma.length > 0 && (
        <details>
          <summary>Values from Figma ({fromFigma.length})</summary>
          <table className={`${ui.table} ${styles.sourceTable}`}>
            <thead>
              <tr>
                <th scope="col">Variable</th>
                <th scope="col">File</th>
                <th scope="col">Source</th>
                <th scope="col">Base value</th>
              </tr>
            </thead>
            <tbody>
              {fromFigma.map((r) => (
                <tr key={`${r.file}-${r.name}`}>
                  <td>
                    <code className={ui.code}>
                      --{prefix}-{r.name}
                    </code>
                  </td>
                  <td>{r.file}</td>
                  <td>{SOURCE_LABEL[r.source]}</td>
                  <td>
                    <code className={ui.code}>{r.value.replaceAll("{{prefix}}", prefix)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {defaults.length > 0 && (
        <details>
          <summary>Defaults used ({defaults.length})</summary>
          <ul className={styles.defaultsList}>
            {[...byFile].map(([file, names]) => (
              <li key={file}>
                <strong>{file}</strong>:{" "}
                {names.map((n) => (
                  <code key={n} className={ui.code}>
                    --{prefix}-{n}{" "}
                  </code>
                ))}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
