"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PanelActions } from "@/components/AppShell/PanelActions";
import { PanelButton, PanelSection } from "@/components/AppShell/PanelSection";
import panel from "@/components/AppShell/AppShell.module.css";
import ui from "@/components/ui/ui.module.css";
import type { GeneratedFile, Problem } from "@/lib/generator/types";
import { CSS_TEMPLATE_LABELS, type ScaffoldTree, type TreeNode } from "@/lib/model";
import type { GenerationReport } from "@/lib/templates/sources";
import type { QualityReport } from "@/lib/quality/run";
import { DesignSources } from "./DesignSources";
import { QualityCard } from "./QualityCard";
import styles from "./GenerateView.module.css";

export type ViewFile = GeneratedFile & { size: number };

type Props = {
  projectId: string;
  zipName: string;
  scaffold: ScaffoldTree;
  approach: string;
  breakpointCount: number;
  problems: Problem[];
  blocked: boolean;
  files: ViewFile[];
  initialPath?: string;
  /** Where every value came from (absent when generation is blocked). */
  report?: GenerationReport;
  prefix?: string;
  /** Automatic fixes and checks; errors block the download. */
  quality?: QualityReport;
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function GenerateView(props: Props) {
  const { files, problems, blocked } = props;
  const router = useRouter();
  const byPath = new Map(files.map((f) => [f.path, f]));
  const firstTemplate = files.find((f) => f.source === "template") ?? files[0];
  const [selected, setSelected] = useState<string | undefined>(
    props.initialPath && byPath.has(props.initialPath) ? props.initialPath : firstTemplate?.path,
  );
  const [regenerating, startRegenerate] = useTransition();
  const [copied, setCopied] = useState(false);

  const file = selected ? byPath.get(selected) : undefined;
  // Files AuthorKit adds itself: root files first, then generated folders such as style-guide/.
  const autoRoot = files.filter(
    (f) => f.source === "entry" || f.source === "readme" || f.source === "devkit",
  );
  const autoFolders = new Map<string, ViewFile[]>();
  for (const f of files.filter((f) => f.source === "styleguide")) {
    const folder = f.path.split("/")[0];
    autoFolders.set(folder, [...(autoFolders.get(folder) ?? []), f]);
  }
  const total = files.reduce((n, f) => n + f.size, 0);
  const errors = problems.filter((p) => p.severity === "error");
  const warnings = problems.filter((p) => p.severity === "warning");

  const select = (path: string) => {
    setSelected(path);
    setCopied(false);
    // Keep the selection linkable without a server round trip.
    window.history.replaceState(null, "", `?file=${encodeURIComponent(path)}`);
  };

  const copy = async () => {
    if (!file) return;
    await navigator.clipboard.writeText(file.content);
    setCopied(true);
  };

  const downloadFile = () => {
    if (!file) return;
    const url = URL.createObjectURL(new Blob([file.content], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = file.path.split("/").pop()!;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.layout}>
      <PanelActions>
        <PanelSection title="Package">
          {blocked ? (
            <>
              <PanelButton disabled>Download zip</PanelButton>
              <p className={panel.panelHint}>Fix the errors to download.</p>
            </>
          ) : (
            <a
              className={panel.panelButton}
              href={`/api/projects/${props.projectId}/package`}
              download={props.zipName}
            >
              Download zip
            </a>
          )}
          <PanelButton
            variant="secondary"
            onClick={() => startRegenerate(() => router.refresh())}
            disabled={regenerating}
          >
            {regenerating ? "Regenerating…" : "Regenerate"}
          </PanelButton>
          <dl className={styles.summary}>
            <dt>Files</dt>
            <dd>{files.length}</dd>
            <dt>Size</dt>
            <dd>{formatBytes(total)}</dd>
            <dt>Approach</dt>
            <dd>{props.approach}</dd>
            <dt>Breakpoints</dt>
            <dd>{props.breakpointCount}</dd>
          </dl>
        </PanelSection>
      </PanelActions>

      {problems.length > 0 && (
        <section className={ui.card} aria-labelledby="gen-problems">
          <h2 id="gen-problems" className={ui.sectionHeading}>
            {blocked ? "Fix these errors to generate the package" : "Warnings"}
          </h2>
          <ul className={styles.problems}>
            {[...errors, ...warnings].map((p, i) => (
              <li key={i} data-severity={p.severity}>
                {p.path && <code className={ui.code}>{p.path}</code>}
                {p.path && ": "}
                {p.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {props.quality && <QualityCard quality={props.quality} />}

      {props.report && (
        <DesignSources
          report={props.report}
          prefix={props.prefix ?? ""}
          projectId={props.projectId}
        />
      )}

      {files.length > 0 && (
        <div className={styles.columns}>
          <section className={ui.card} aria-labelledby="gen-files">
            <h2 id="gen-files" className={ui.sectionHeading}>
              Files
            </h2>
            <ul className={styles.tree}>
              <li>
                <span className={styles.folder}>📁 {props.scaffold.name}/</span>
                <ul className={styles.tree}>
                  {autoRoot.map((f) => (
                    <FileRow
                      key={f.path}
                      file={f}
                      name={f.path}
                      auto
                      selected={selected}
                      onSelect={select}
                    />
                  ))}
                  {[...autoFolders].map(([folder, folderFiles]) => (
                    <li key={folder}>
                      <span className={styles.folder}>
                        📁 {folder}/ <span className={styles.auto}>auto</span>
                      </span>
                      <ul className={styles.tree}>
                        {folderFiles.map((f) => (
                          <FileRow
                            key={f.path}
                            file={f}
                            name={f.path.slice(folder.length + 1)}
                            selected={selected}
                            onSelect={select}
                          />
                        ))}
                      </ul>
                    </li>
                  ))}
                  {props.scaffold.children.map((child) => (
                    <TreeRow
                      key={child.id}
                      node={child}
                      path={child.name}
                      byPath={byPath}
                      selected={selected}
                      onSelect={select}
                    />
                  ))}
                </ul>
              </li>
            </ul>
          </section>

          <section className={`${ui.card} ${styles.viewer}`} aria-label="File contents">
            {file ? (
              <>
                <div className={styles.viewerHeader}>
                  <div>
                    <h2 className={ui.sectionHeading} style={{ margin: 0 }}>
                      <code className={ui.code}>{file.path}</code>
                    </h2>
                    <span className={ui.muted}>
                      {formatBytes(file.size)} · {describeSource(file)}
                    </span>
                  </div>
                  <div className={styles.viewerActions}>
                    <button type="button" className={styles.smallButton} onClick={copy}>
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <button type="button" className={styles.smallButton} onClick={downloadFile}>
                      Download file
                    </button>
                  </div>
                </div>
                {file.content ? (
                  <pre className={styles.code} tabIndex={0} aria-label={`Contents of ${file.path}`}>
                    <code>
                      {file.content
                        .replace(/\n$/, "")
                        .split("\n")
                        .map((line, i) => (
                          <span key={i} className={styles.line}>
                            {line}
                            {"\n"}
                          </span>
                        ))}
                    </code>
                  </pre>
                ) : (
                  <p className={ui.muted}>This file is empty.</p>
                )}
              </>
            ) : (
              <p className={ui.muted}>Select a file to see its contents.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function describeSource(file: ViewFile): string {
  switch (file.source) {
    case "template":
      return `${CSS_TEMPLATE_LABELS[file.templateId!]} template`;
    case "entry":
      return "Generated entry stylesheet";
    case "readme":
      return "Generated README";
    case "empty-css":
      return "No template assigned";
    default:
      return "Empty file";
  }
}

type RowProps = { selected?: string; onSelect: (path: string) => void };

function TreeRow({
  node,
  path,
  byPath,
  ...rest
}: RowProps & { node: TreeNode; path: string; byPath: Map<string, ViewFile> }) {
  if (node.type === "file") return <FileRow file={byPath.get(path)!} name={node.name} {...rest} />;
  return (
    <li>
      <span className={styles.folder}>📁 {node.name}/</span>
      {node.children.length > 0 && (
        <ul className={styles.tree}>
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              path={`${path}/${child.name}`}
              byPath={byPath}
              {...rest}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function FileRow({
  file,
  name,
  auto,
  selected,
  onSelect,
}: RowProps & { file: ViewFile; name: string; auto?: boolean }) {
  return (
    <li>
      <button
        type="button"
        className={styles.fileButton}
        aria-current={selected === file.path ? "true" : undefined}
        onClick={() => onSelect(file.path)}
      >
        <span>📄 {name}</span>
        {auto && <span className={styles.auto}>auto</span>}
        <span className={styles.size}>{formatBytes(file.size)}</span>
      </button>
    </li>
  );
}
