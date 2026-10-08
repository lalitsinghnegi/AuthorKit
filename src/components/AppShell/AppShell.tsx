"use client";

import { Suspense, useEffect, useState } from "react";
import { PANEL_PORTAL_ID } from "./PanelActions";
import { SideNav, SideNavFallback } from "./SideNav";
import styles from "./AppShell.module.css";

type Props = {
  /** Context actions for the current screen, from the `@actions` slot. */
  actions: React.ReactNode;
  /** Signed-in user box, shown at the bottom of the panel. */
  account?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Two-pane admin layout: a left action panel (navigation and screen actions)
 * and a right work area. The panel collapses on desktop and becomes a drawer
 * on narrow viewports.
 */
export function AppShell({ actions, account, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className={styles.shell} data-collapsed={collapsed} data-drawer-open={drawerOpen}>
      <header className={styles.topBar}>
        <button
          type="button"
          className={styles.iconButton}
          aria-controls="action-panel"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((open) => !open)}
        >
          Menu
        </button>
        <span className={styles.brand}>AuthorKit</span>
      </header>

      <aside id="action-panel" className={styles.panel} aria-label="Action panel">
        <div className={styles.panelHeader}>
          <span className={styles.brand}>AuthorKit</span>
          <button
            type="button"
            className={styles.collapseButton}
            aria-expanded={!collapsed}
            aria-controls="action-panel-content"
            onClick={() => setCollapsed((c) => !c)}
          >
            <span aria-hidden="true">{collapsed ? "»" : "«"}</span>
            <span className={styles.visuallyHidden}>
              {collapsed ? "Expand panel" : "Collapse panel"}
            </span>
          </button>
        </div>

        <div id="action-panel-content" className={styles.panelContent}>
          <Suspense fallback={<SideNavFallback />}>
            <SideNav onNavigate={closeDrawer} />
          </Suspense>
          <div className={styles.actions}>{actions}</div>
          {/* Interactive screens render their actions here via <PanelActions>. */}
          <div id={PANEL_PORTAL_ID} className={styles.actions} />
          {account}
        </div>
      </aside>

      {drawerOpen && <div className={styles.backdrop} onClick={closeDrawer} aria-hidden="true" />}

      <main className={styles.workArea}>{children}</main>
    </div>
  );
}
