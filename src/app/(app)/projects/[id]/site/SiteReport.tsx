import ui from "@/components/ui/ui.module.css";
import { CSS_TEMPLATE_LABELS, type SiteFile, type SitePart } from "@/lib/model";
import styles from "./SiteReport.module.css";

const KIND = { block: "Block", element: "Element", modifier: "Variant" } as const;

/** What the last site read found: pages, notes, and suggestions per template part. */
export function SiteReport({ prefix, data }: { prefix: string; data: SiteFile | null }) {
  if (!data) {
    return (
      <p className={ui.muted}>
        The site has not been read yet. Choose <strong>Read site</strong> in the left panel.
      </p>
    );
  }

  const components = [...new Set(data.parts.map((p) => p.componentId))];
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

      {components.map((id) => (
        <section key={id} className={ui.card} aria-labelledby={`site-${id}`}>
          <h2 id={`site-${id}`} className={ui.sectionHeading}>
            {CSS_TEMPLATE_LABELS[id]}
          </h2>
          <div className={styles.scroll}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Template class</th>
                  <th scope="col">Suggested site class</th>
                  <th scope="col">Other candidates</th>
                </tr>
              </thead>
              <tbody>
                {data.parts
                  .filter((p) => p.componentId === id)
                  .map((p) => (
                    <PartRow key={p.part} prefix={prefix} part={p} pages={data.pages.length} />
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

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

function PartRow({ prefix, part, pages }: { prefix: string; part: SitePart; pages: number }) {
  const [best, ...others] = part.suggestions;
  return (
    <tr>
      <th scope="row" className={styles.part}>
        <code className={ui.code}>
          .{prefix}-{part.part}
        </code>
        <div className={ui.muted}>{KIND[part.kind]}</div>
      </th>
      <td>
        {best ? (
          <>
            <code className={ui.code}>{best.selector}</code>{" "}
            <span className={styles.badge} data-confidence={best.confidence}>
              {best.confidence}
            </span>
            <div className={styles.reason}>
              {best.reason} · ×{best.count}
              {pages > 1 && ` on ${best.pages.length} page${best.pages.length === 1 ? "" : "s"}`}
            </div>
            <details className={styles.sample}>
              <summary>Markup</summary>
              <pre tabIndex={0} aria-label={`Markup sample for ${best.selector}`}>
                {best.sample}
              </pre>
            </details>
          </>
        ) : (
          <span className={ui.muted}>Not found</span>
        )}
      </td>
      <td>
        {others.length === 0 ? (
          <span className={ui.muted}>—</span>
        ) : (
          others.map((o) => (
            <div key={o.selector}>
              <code className={ui.code}>{o.selector}</code>{" "}
              <span className={styles.badge} data-confidence={o.confidence}>
                {o.confidence}
              </span>
            </div>
          ))
        )}
      </td>
    </tr>
  );
}
