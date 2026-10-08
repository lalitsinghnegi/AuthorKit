import { sortBreakpoints } from "@/lib/breakpoints";
import {
  CSS_TEMPLATE_LABELS,
  type CssTemplateId,
  type Project,
  type ResponsiveEntry,
  type ResponsiveFile,
} from "@/lib/model";
import { MAPPABLE_COMPONENTS } from "@/lib/mapping/patterns";
import { renderResponsiveCss } from "@/lib/responsive/preview";
import ui from "@/components/ui/ui.module.css";
import styles from "./ResponsiveReport.module.css";

type Target = CssTemplateId | "typography";
const MODE: Record<ResponsiveEntry["mode"] | "missing", string> = {
  breakpoints: "Per breakpoint",
  fluid: "Estimated (fluid)",
  none: "Nothing measurable",
  missing: "No frames",
};
const label = (t: Target) => (t === "typography" ? "Typography" : CSS_TEMPLATE_LABELS[t]);

/** Coverage matrix, values per breakpoint and the CSS they produce. Server-rendered from responsive.json. */
export function ResponsiveReport({
  project,
  data,
}: {
  project: Project;
  data: ResponsiveFile | null;
}) {
  const breakpoints = sortBreakpoints(project.breakpoints.breakpoints);
  const targets: Target[] = ["typography", ...MAPPABLE_COMPONENTS.filter((c) => c !== "global")];
  const entryOf = (t: Target) => (t === "typography" ? data?.typography : data?.components[t]);
  const options = {
    prefix: project.prefix,
    approach: project.approach,
    breakpoints: project.breakpoints.breakpoints,
  };

  if (!data) {
    return (
      <section className={ui.card}>
        <p className={ui.muted} style={{ margin: 0 }}>
          Nothing extracted yet. Until then, the generated CSS uses the template defaults at every
          breakpoint.
        </p>
      </section>
    );
  }

  return (
    <div className={ui.sections}>
      <section className={ui.card} aria-labelledby="coverage">
        <h2 id="coverage" className={ui.sectionHeading}>
          Coverage
        </h2>
        <div className={styles.wrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">Component</th>
                {breakpoints.map((b) => (
                  <th key={b.id} scope="col">
                    {b.name}
                  </th>
                ))}
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((t) => {
                const entry = entryOf(t);
                return (
                  <tr key={t}>
                    <th scope="row">{label(t)}</th>
                    {breakpoints.map((b) => {
                      const frame = entry?.frames.find((f) => f.breakpointId === b.id);
                      const source = entry
                        ? Object.values(entry.values[b.id] ?? {})[0]?.source
                        : undefined;
                      return (
                        <td
                          key={b.id}
                          className={styles.cell}
                          data-cell={frame ? "frame" : (source ?? "none")}
                        >
                          {frame ? (
                            <>
                              ✓ <span className={styles.frameName}>{frame.nodeName}</span>
                              {!frame.tagged && <span className={styles.note}> (untagged)</span>}
                            </>
                          ) : source === "fluid" ? (
                            "fluid"
                          ) : source === "inferred" ? (
                            "inferred"
                          ) : (
                            "—"
                          )}
                        </td>
                      );
                    })}
                    <td>
                      <span className={styles.mode} data-mode={entry?.mode ?? "missing"}>
                        {MODE[entry?.mode ?? "missing"]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {targets.map((t) => {
        const entry = entryOf(t);
        if (!entry || entry.mode === "none") return null;
        const variables = [
          ...new Set(Object.values(entry.values).flatMap((v) => Object.keys(v))),
        ].sort();
        const css = renderResponsiveCss(t, entry, options);
        return (
          <section key={t} className={ui.card} aria-labelledby={`resp-${t}`}>
            <h2 id={`resp-${t}`} className={ui.sectionHeading}>
              {label(t)}{" "}
              <span className={styles.mode} data-mode={entry.mode}>
                {MODE[entry.mode]}
              </span>
            </h2>
            {entry.notes.length > 0 && (
              <ul className={styles.notes}>
                {entry.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            <div className={styles.wrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th scope="col">Variable</th>
                    {breakpoints.map((b) => (
                      <th key={b.id} scope="col">
                        {b.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {variables.map((v) => (
                    <tr key={v}>
                      <th scope="row">
                        <code className={ui.code}>
                          --{project.prefix}-{v}
                        </code>
                      </th>
                      {breakpoints.map((b) => {
                        const cell = entry.values[b.id]?.[v];
                        return (
                          <td key={b.id}>
                            {cell ? (
                              <>
                                <code className={ui.code}>
                                  {cell.value.replaceAll("{{prefix}}", project.prefix)}
                                </code>
                                <span className={styles.source} data-source={cell.source}>
                                  {cell.source}
                                </span>
                              </>
                            ) : (
                              <span className={ui.muted}>default</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className={styles.preview} open={entry.mode === "breakpoints"}>
              <summary>Generated CSS</summary>
              <pre className={styles.code}>
                <code>{css || "/* Same values at every breakpoint: base styles only. */"}</code>
              </pre>
            </details>
          </section>
        );
      })}
    </div>
  );
}
