import ui from "@/components/ui/ui.module.css";
import type { SiteFile } from "@/lib/model";
import styles from "./SiteReport.module.css";

/** What the last site read found: pages, notes and the most used classes. */
export function SiteReport({ data }: { data: SiteFile | null }) {
  if (!data) {
    return (
      <p className={ui.muted}>
        The site has not been read yet. Choose <strong>Read site</strong> in the left panel.
      </p>
    );
  }

  const matched = data.parts.filter((p) => p.suggestions.length > 0).length;

  return (
    <div className={ui.sections}>
      <section className={ui.card} aria-labelledby="site-read">
        <h2 id="site-read" className={ui.sectionHeading}>
          Last read
        </h2>
        <p className={ui.muted} style={{ marginTop: 0 }}>
          {new Date(data.readAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC · {matched} of{" "}
          {data.parts.length} template parts have a suggestion · {data.classes.length} classes found
        </p>
        <table className={ui.table}>
          <thead>
            <tr>
              <th scope="col">Page</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {data.pages.map((p) => (
              <tr key={p.url}>
                <td className={styles.url}>
                  <code className={ui.code}>{p.url}</code>
                  {p.title && <div className={ui.muted}>{p.title}</div>}
                </td>
                <td>
                  {p.ok ? (
                    `${p.elements ?? 0} elements`
                  ) : (
                    <span className={ui.error} style={{ margin: 0 }}>
                      {p.error}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.notes.length > 0 && (
          <ul className={styles.notes}>
            {data.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </section>

      {data.classes.length > 0 && (
        <section className={ui.card} aria-labelledby="site-classes">
          <h2 id="site-classes" className={ui.sectionHeading}>
            Classes on the site
          </h2>
          <details>
            <summary>Most used {Math.min(100, data.classes.length)} classes</summary>
            <ul className={styles.classes}>
              {data.classes.slice(0, 100).map((c) => (
                <li key={c.name}>
                  <code className={ui.code}>.{c.name}</code>{" "}
                  <span className={ui.muted}>×{c.count}</span>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </div>
  );
}
