// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import { isActive } from "./nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/projects/abc" }));

describe("isActive", () => {
  it("matches the item path and nested paths only", () => {
    expect(isActive("/projects", "/projects")).toBe(true);
    expect(isActive("/projects", "/projects/abc")).toBe(true);
    expect(isActive("/projects", "/projects-old")).toBe(false);
    expect(isActive("/settings", "/projects")).toBe(false);
  });
});

describe("AppShell", () => {
  const renderShell = () =>
    render(
      <AppShell actions={<button>New project</button>}>
        <p>Work area content</p>
      </AppShell>,
    );

  it("renders navigation, screen actions and the work area", () => {
    renderShell();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toHaveTextContent("Projects");
    expect(nav).toHaveTextContent("Templates");
    expect(nav).toHaveTextContent("Settings");
    expect(screen.getByRole("button", { name: "New project" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Work area content");
  });

  it("marks the current section as the active page", () => {
    renderShell();
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Settings" })).not.toHaveAttribute("aria-current");
  });

  it("toggles the collapse state", () => {
    const { container } = renderShell();
    const toggle = screen.getByRole("button", { name: "Collapse panel" });
    fireEvent.click(toggle);
    expect(container.firstChild).toHaveAttribute("data-collapsed", "true");
    expect(screen.getByRole("button", { name: "Expand panel" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("opens the mobile drawer and closes it with Escape", () => {
    const { container } = renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(container.firstChild).toHaveAttribute("data-drawer-open", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(container.firstChild).toHaveAttribute("data-drawer-open", "false");
  });
});
