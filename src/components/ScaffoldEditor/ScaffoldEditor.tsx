"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { PanelActions } from "@/components/AppShell/PanelActions";
import { PanelButton, PanelSection } from "@/components/AppShell/PanelSection";
import panel from "@/components/AppShell/AppShell.module.css";
import ui from "@/components/ui/ui.module.css";
import type { SaveResult } from "@/lib/actions/result";
import { CSS_TEMPLATE_LABELS, type ScaffoldTree, type TreeNode } from "@/lib/model";
import {
  addNode,
  assignTemplate,
  cloneWithNewIds,
  createFile,
  createFolder,
  deleteNode,
  findNode,
  moveNode,
  nodePath,
  renameNode,
  renderTreeText,
  shiftNode,
  treeHasErrors,
  uniqueChildName,
  unusedTemplates,
  validateTree,
} from "@/lib/scaffold";
import { TreeView } from "./TreeView";
import { useHistory } from "./useHistory";
import styles from "./ScaffoldEditor.module.css";

export type Meta = { name: string; description: string };
export type ScaffoldSavePayload = { tree: ScaffoldTree; name?: string; description?: string };
export type PresetOption = { id: string; name: string; tree: ScaffoldTree };
export type SaveAsPresetResult =
  { ok: true; id: string; name: string } | { ok: false; error: string };

type Props = {
  initialTree: ScaffoldTree;
  /** Editable name/description (scaffold presets). Omit for project scaffolds. */
  initialMeta?: Meta;
  readOnly?: boolean;
  onSave: (payload: ScaffoldSavePayload) => Promise<SaveResult>;
  /** Presets offered by "Apply preset". */
  presets?: PresetOption[];
  onSaveAsPreset?: (name: string, tree: ScaffoldTree) => Promise<SaveAsPresetResult>;
};

type Status = { kind: "idle" | "saved" | "error"; message?: React.ReactNode };
type Doc = { tree: ScaffoldTree; meta?: Meta };

const metaError = (meta?: Meta) =>
  meta &&
  (meta.name.trim() === ""
    ? "Name is required"
    : meta.name.trim().length > 80
      ? "Name must be 80 characters or fewer"
      : null);

export function ScaffoldEditor({
  initialTree,
  initialMeta,
  readOnly = false,
  onSave,
  presets,
  onSaveAsPreset,
}: Props) {
  const router = useRouter();
  const history = useHistory<Doc>({ tree: initialTree, meta: initialMeta });
  const { tree, meta } = history.value;
  const [saved, setSaved] = useState<Doc>(history.value);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [busy, startTransition] = useTransition();

  const issues = useMemo(() => validateTree(tree), [tree]);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const nameError = metaError(meta);
  const dirty = JSON.stringify(history.value) !== JSON.stringify(saved);
  const blocked = treeHasErrors(issues) || Boolean(nameError);
  const unused = useMemo(() => unusedTemplates(tree), [tree]);

  const commitTree = (next: ScaffoldTree) => {
    history.commit({ tree: next, meta });
    setStatus({ kind: "idle" });
  };
  const commitMeta = (next: Meta) => {
    history.commit({ tree, meta: next });
    setStatus({ kind: "idle" });
  };

  // Keyboard undo/redo, unless the user is typing in a field (which has its own undo).
  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select")) return;
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) history.redo();
      else history.undo();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [history, readOnly]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const add = (parentId: string, type: "folder" | "file") => {
    const parent = findNode(tree, parentId)!.node;
    if (parent.type !== "folder") return;
    const node =
      type === "folder"
        ? createFolder(uniqueChildName(parent, "new-folder"))
        : createFile(uniqueChildName(parent, "new-file.css"));
    commitTree(addNode(tree, parentId, node));
    setCollapsed((c) => {
      const next = new Set(c);
      next.delete(parentId);
      return next;
    });
    setEditingId(node.id);
  };

  const remove = (node: TreeNode) => {
    if (node.type === "folder" && node.children.length > 0) {
      if (!confirm(`Delete "${node.name}" and everything in it?`)) return;
    }
    commitTree(deleteNode(tree, node.id));
  };

  const move = (id: string, targetFolderId: string, index?: number) => {
    commitTree(moveNode(tree, id, targetFolderId, index));
    setCollapsed((c) => {
      const next = new Set(c);
      next.delete(targetFolderId);
      return next;
    });
  };

  const applyPreset = (presetId: string) => {
    const preset = presets?.find((p) => p.id === presetId);
    if (!preset || !confirm(`Replace the current folder structure with "${preset.name}"?`)) return;
    // Keep the package root name; take everything else from the preset.
    commitTree({ ...cloneWithNewIds(preset.tree), name: tree.name });
  };

  const discard = () => {
    if (!confirm("Discard unsaved changes?")) return;
    history.reset(saved);
    setStatus({ kind: "idle" });
  };

  const save = () =>
    startTransition(async () => {
      const result = await onSave({
        tree,
        name: meta?.name.trim(),
        description: meta?.description.trim(),
      });
      if (result.ok) {
        setSaved(history.value);
        setStatus({ kind: "saved", message: "Saved." });
        router.refresh();
      } else {
        setStatus({ kind: "error", message: result.error });
      }
    });

  const saveAsPreset = () => {
    if (!onSaveAsPreset) return;
    const name = prompt("Name for the new preset:")?.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await onSaveAsPreset(name, tree);
      setStatus(
        result.ok
          ? {
              kind: "saved",
              message: (
                <>
                  Saved as preset{" "}
                  <Link href={`/templates/scaffolds/${result.id}`}>{result.name}</Link>.
                </>
              ),
            }
          : { kind: "error", message: result.error },
      );
    });
  };

  return (
    <div className={styles.layout}>
      {!readOnly && (
        <PanelActions>
          <PanelSection title="Scaffold">
            {dirty && <span className={panel.dirty}>Unsaved changes</span>}
            <PanelButton onClick={save} disabled={!dirty || blocked || busy}>
              {busy ? "Saving…" : "Save"}
            </PanelButton>
            {dirty && blocked && <p className={panel.panelHint}>Fix the errors to save.</p>}
            <PanelButton variant="secondary" onClick={history.undo} disabled={!history.canUndo}>
              Undo
            </PanelButton>
            <PanelButton variant="secondary" onClick={history.redo} disabled={!history.canRedo}>
              Redo
            </PanelButton>
            {presets && presets.length > 0 && (
              <>
                <label className={panel.visuallyHidden} htmlFor="scaffold-preset">
                  Apply a preset
                </label>
                <select
                  id="scaffold-preset"
                  className={panel.panelSelect}
                  value=""
                  onChange={(e) => applyPreset(e.target.value)}
                >
                  <option value="" disabled>
                    Apply preset…
                  </option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            {onSaveAsPreset && (
              <PanelButton
                variant="secondary"
                onClick={saveAsPreset}
                disabled={treeHasErrors(issues) || busy}
              >
                Save as preset
              </PanelButton>
            )}
            <PanelButton variant="secondary" onClick={discard} disabled={!dirty}>
              Discard changes
            </PanelButton>
          </PanelSection>
        </PanelActions>
      )}

      <p aria-live="polite" className={styles.status} data-kind={status.kind}>
        {status.message}
      </p>

      {meta && (
        <section className={ui.card} aria-label="Preset details">
          <div className={ui.form} style={{ maxWidth: "none" }}>
            <div className={ui.field}>
              <label htmlFor="preset-name" className={ui.label}>
                Preset name
              </label>
              <input
                id="preset-name"
                className={ui.input}
                value={meta.name}
                readOnly={readOnly}
                maxLength={80}
                aria-invalid={Boolean(nameError) || undefined}
                onChange={(e) => commitMeta({ ...meta, name: e.target.value })}
              />
              {nameError && <p className={ui.error}>{nameError}</p>}
            </div>
            <div className={ui.field}>
              <label htmlFor="preset-description" className={ui.label}>
                Description
              </label>
              <input
                id="preset-description"
                className={ui.input}
                value={meta.description}
                readOnly={readOnly}
                maxLength={500}
                onChange={(e) => commitMeta({ ...meta, description: e.target.value })}
              />
            </div>
          </div>
        </section>
      )}

      <div className={styles.columns}>
        <section className={ui.card} aria-labelledby="scaffold-tree">
          <h2 id="scaffold-tree" className={ui.sectionHeading}>
            Folders and files
          </h2>
          {!readOnly && (
            <p className={`${ui.hint} ${styles.help}`}>
              Click a name to rename it. Drag rows to move them, or use ↑ ↓ and “Move to…”. Assign a
              CSS template to each stylesheet.
            </p>
          )}
          <TreeView
            tree={tree}
            readOnly={readOnly}
            issuesFor={(id) => issues.filter((i) => i.nodeId === id)}
            collapsed={collapsed}
            toggle={(id) =>
              setCollapsed((c) => {
                const next = new Set(c);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            editingId={editingId}
            setEditingId={setEditingId}
            rename={(id, name) => commitTree(renameNode(tree, id, name))}
            add={add}
            remove={remove}
            shift={(id, delta) => commitTree(shiftNode(tree, id, delta))}
            move={move}
            assign={(id, templateId) => commitTree(assignTemplate(tree, id, templateId))}
          />
        </section>

        <div className={styles.side}>
          <section className={ui.card} aria-labelledby="scaffold-preview">
            <h2 id="scaffold-preview" className={ui.sectionHeading}>
              Package preview
            </h2>
            <pre className={styles.preview}>
              <code>{renderTreeText(tree)}</code>
            </pre>
            {unused.length > 0 && (
              <p className={ui.hint}>
                Not included: {unused.map((id) => CSS_TEMPLATE_LABELS[id]).join(", ")}.
              </p>
            )}
          </section>

          <section className={ui.card} aria-labelledby="scaffold-problems">
            <h2 id="scaffold-problems" className={ui.sectionHeading}>
              Problems{" "}
              {issues.length > 0 && `(${errors.length} errors, ${warnings.length} warnings)`}
            </h2>
            {issues.length === 0 ? (
              <p className={ui.muted} style={{ margin: 0 }}>
                No problems.
              </p>
            ) : (
              <ul className={styles.problems}>
                {[...errors, ...warnings].map((issue, i) => (
                  <li key={i} data-severity={issue.severity}>
                    <code className={ui.code}>{nodePath(tree, issue.nodeId)}</code>: {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
