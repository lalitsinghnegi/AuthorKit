"use client";

import { createContext, useContext, useState } from "react";
import {
  CSS_TEMPLATE_IDS,
  CSS_TEMPLATE_LABELS,
  type CssTemplateId,
  type FolderNode,
  type ScaffoldTree,
  type TreeNode,
} from "@/lib/model";
import { listFolders, moveBlocker, validateName, type TreeIssue } from "@/lib/scaffold";
import styles from "./ScaffoldEditor.module.css";

export type DropPosition = "before" | "after" | "inside";

/** Everything rows need from the editor, passed by context to avoid prop drilling. */
export type TreeContext = {
  tree: ScaffoldTree;
  readOnly: boolean;
  issuesFor: (id: string) => TreeIssue[];
  collapsed: Set<string>;
  toggle: (id: string) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  rename: (id: string, name: string) => void;
  add: (parentId: string, type: "folder" | "file") => void;
  remove: (node: TreeNode) => void;
  shift: (id: string, delta: -1 | 1) => void;
  move: (id: string, targetFolderId: string, index?: number) => void;
  assign: (id: string, templateId: CssTemplateId | null) => void;
};

const Ctx = createContext<TreeContext | null>(null);
const useTree = () => useContext(Ctx)!;

type Drag = { id: string | null; over: { id: string; position: DropPosition } | null };
const DragCtx = createContext<{ drag: Drag; setDrag: (d: Drag) => void } | null>(null);

export function TreeView(props: TreeContext) {
  const [drag, setDrag] = useState<Drag>({ id: null, over: null });
  return (
    <Ctx.Provider value={props}>
      <DragCtx.Provider value={{ drag, setDrag }}>
        <ul className={styles.tree} aria-label="Folder structure">
          <Row node={props.tree} parent={null} index={0} depth={0} />
        </ul>
      </DragCtx.Provider>
    </Ctx.Provider>
  );
}

function Row({
  node,
  parent,
  index,
  depth,
}: {
  node: TreeNode;
  parent: FolderNode | null;
  index: number;
  depth: number;
}) {
  const ctx = useTree();
  const { drag, setDrag } = useContext(DragCtx)!;
  const isRoot = parent === null;
  const isFolder = node.type === "folder";
  const open = isFolder && !ctx.collapsed.has(node.id);
  const issues = ctx.issuesFor(node.id);
  const severity = issues.some((i) => i.severity === "error")
    ? "error"
    : issues.length
      ? "warning"
      : undefined;
  const dropHere = drag.over?.id === node.id ? drag.over.position : undefined;

  /** Where a drop at this row lands, or null if not allowed. */
  const dropTarget = (position: DropPosition) => {
    if (!drag.id) return null;
    const target =
      position === "inside"
        ? { folderId: node.id, index: undefined }
        : { folderId: parent!.id, index: position === "before" ? index : index + 1 };
    return moveBlocker(ctx.tree, drag.id, target.folderId) ? null : target;
  };

  const positionAt = (e: React.DragEvent<HTMLElement>): DropPosition => {
    if (isRoot) return "inside";
    const rect = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - rect.top) / rect.height;
    if (!isFolder) return y < 0.5 ? "before" : "after";
    return y < 0.25 ? "before" : y > 0.75 ? "after" : "inside";
  };

  const dragHandlers = ctx.readOnly
    ? {}
    : {
        draggable: !isRoot && ctx.editingId !== node.id,
        onDragStart: (e: React.DragEvent<HTMLElement>) => {
          e.stopPropagation();
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", node.id);
          setDrag({ id: node.id, over: null });
        },
        onDragEnd: () => setDrag({ id: null, over: null }),
        onDragOver: (e: React.DragEvent<HTMLElement>) => {
          const position = positionAt(e);
          if (!dropTarget(position)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (drag.over?.id !== node.id || drag.over.position !== position) {
            setDrag({ ...drag, over: { id: node.id, position } });
          }
        },
        onDrop: (e: React.DragEvent<HTMLElement>) => {
          e.preventDefault();
          const target = dropTarget(positionAt(e));
          if (target && drag.id) ctx.move(drag.id, target.folderId, target.index);
          setDrag({ id: null, over: null });
        },
      };

  return (
    <li>
      <div
        className={styles.row}
        data-severity={severity}
        data-drop={dropHere}
        data-dragging={drag.id === node.id || undefined}
        style={{ paddingLeft: depth * 20 + 4 }}
        {...dragHandlers}
      >
        {isFolder ? (
          <button
            type="button"
            className={styles.toggle}
            onClick={() => ctx.toggle(node.id)}
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`}
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className={styles.toggle} aria-hidden="true" />
        )}
        <span aria-hidden="true">{isFolder ? "📁" : "📄"}</span>

        <NameCell node={node} siblings={parent?.children.filter((c) => c.id !== node.id) ?? []} />

        {node.type === "file" &&
          (ctx.readOnly ? (
            node.cssTemplateId && (
              <span className={styles.templateTag}>{CSS_TEMPLATE_LABELS[node.cssTemplateId]}</span>
            )
          ) : (
            <select
              className={styles.select}
              value={node.cssTemplateId ?? ""}
              onChange={(e) =>
                ctx.assign(node.id, (e.target.value || null) as CssTemplateId | null)
              }
              aria-label={`CSS template for ${node.name}`}
            >
              <option value="">No template</option>
              {CSS_TEMPLATE_IDS.map((id) => (
                <option key={id} value={id}>
                  {CSS_TEMPLATE_LABELS[id]}
                </option>
              ))}
            </select>
          ))}

        {!ctx.readOnly && (
          <span className={styles.actions}>
            {isFolder && (
              <>
                <button
                  type="button"
                  onClick={() => ctx.add(node.id, "folder")}
                  aria-label={`Add folder in ${node.name}`}
                  title="Add folder"
                >
                  +📁
                </button>
                <button
                  type="button"
                  onClick={() => ctx.add(node.id, "file")}
                  aria-label={`Add file in ${node.name}`}
                  title="Add file"
                >
                  +📄
                </button>
              </>
            )}
            {!isRoot && (
              <>
                <button
                  type="button"
                  onClick={() => ctx.shift(node.id, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${node.name} up`}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => ctx.shift(node.id, 1)}
                  disabled={index === parent.children.length - 1}
                  aria-label={`Move ${node.name} down`}
                  title="Move down"
                >
                  ↓
                </button>
                <MoveTo node={node} parentId={parent.id} />
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => ctx.remove(node)}
                  aria-label={`Delete ${node.name}`}
                  title="Delete"
                >
                  ✕
                </button>
              </>
            )}
          </span>
        )}
      </div>

      {issues.length > 0 && (
        <ul className={styles.rowIssues} style={{ paddingLeft: depth * 20 + 48 }}>
          {issues.map((issue, i) => (
            <li key={i} data-severity={issue.severity}>
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      {node.type === "folder" && open && node.children.length > 0 && (
        <ul className={styles.tree}>
          {node.children.map((child, i) => (
            <Row key={child.id} node={child} parent={node} index={i} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function NameCell({ node, siblings }: { node: TreeNode; siblings: TreeNode[] }) {
  const ctx = useTree();
  const editing = ctx.editingId === node.id;
  const [draft, setDraft] = useState(node.name);
  const error = editing ? validateName(draft.trim(), siblings) : null;

  if (!editing) {
    return ctx.readOnly ? (
      <span className={styles.name}>{node.name}</span>
    ) : (
      <button
        type="button"
        className={styles.name}
        onClick={() => {
          setDraft(node.name);
          ctx.setEditingId(node.id);
        }}
        aria-label={`Rename ${node.name}`}
        title="Click to rename"
      >
        {node.name}
      </button>
    );
  }

  const commit = () => {
    if (!error && draft.trim() !== node.name) ctx.rename(node.id, draft.trim());
    ctx.setEditingId(null);
  };

  return (
    <span className={styles.nameEdit}>
      <input
        autoFocus
        className={styles.nameInput}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          // Select the stem so typing replaces "new-file" but keeps ".css".
          const dot = e.target.value.lastIndexOf(".");
          e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (!error) commit();
          } else if (e.key === "Escape") {
            ctx.setEditingId(null);
          }
        }}
        onBlur={commit}
        aria-label={`New name for ${node.name}`}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `name-error-${node.id}` : undefined}
        spellCheck={false}
      />
      {error && (
        <span id={`name-error-${node.id}`} role="alert" className={styles.nameError}>
          {error}
        </span>
      )}
    </span>
  );
}

function MoveTo({ node, parentId }: { node: TreeNode; parentId: string }) {
  const ctx = useTree();
  const targets = listFolders(ctx.tree).filter(
    (f) => f.id !== parentId && !moveBlocker(ctx.tree, node.id, f.id),
  );
  if (targets.length === 0) return null;
  return (
    <select
      className={styles.select}
      value=""
      onChange={(e) => e.target.value && ctx.move(node.id, e.target.value)}
      aria-label={`Move ${node.name} to folder`}
      title="Move to folder"
    >
      <option value="">Move to…</option>
      {targets.map((f) => (
        <option key={f.id} value={f.id}>
          {f.path}/
        </option>
      ))}
    </select>
  );
}
