// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PANEL_PORTAL_ID } from "@/components/AppShell/PanelActions";
import type { FolderNode } from "@/lib/model";
import { GenerateView, formatBytes, type ViewFile } from "./GenerateView";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const scaffold: FolderNode = {
  id: "r",
  type: "folder",
  name: "acme",
  children: [
    {
      id: "css",
      type: "folder",
      name: "css",
      children: [{ id: "g", type: "file", name: "global.css", cssTemplateId: "global" }],
    },
    { id: "e", type: "folder", name: "empty", children: [] },
  ],
};

const files: ViewFile[] = [
  {
    path: "acme.css",
    content: '@import url("css/global.css");\n',
    source: "entry",
    templateId: null,
    size: 31,
  },
  { path: "README.md", content: "# Acme\n", source: "readme", templateId: null, size: 7 },
  {
    path: "style-guide/index.html",
    content: "<!doctype html>",
    source: "styleguide",
    templateId: null,
    size: 15,
  },
  {
    path: "css/global.css",
    content: "body {\n  margin: 0;\n}\n",
    source: "template",
    templateId: "global",
    size: 2048,
  },
];

function setup(props: Partial<React.ComponentProps<typeof GenerateView>> = {}) {
  const portal = document.createElement("div");
  portal.id = PANEL_PORTAL_ID;
  document.body.appendChild(portal);
  render(
    <GenerateView
      projectId="p1"
      zipName="acme-css-package.zip"
      scaffold={scaffold}
      approach="mobile-first"
      breakpointCount={3}
      problems={[]}
      blocked={false}
      files={files}
      {...props}
    />,
  );
  return { panel: within(portal) };
}

const viewer = () => screen.getByRole("region", { name: "File contents" });

beforeEach(() => {
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
});

describe("GenerateView", () => {
  it("shows the first template file, the tree with auto files, and a download link", () => {
    const { panel } = setup();
    expect(within(viewer()).getByText("css/global.css")).toBeInTheDocument();
    expect(viewer()).toHaveTextContent("margin: 0;");
    expect(viewer()).toHaveTextContent("2.0 KB · Global (type, links, base) template");
    // Two generated root files plus the generated style-guide/ folder.
    expect(screen.getAllByText("auto")).toHaveLength(3);
    expect(screen.getByText(/📁 style-guide\//)).toBeInTheDocument();
    expect(screen.getByText("📁 empty/")).toBeInTheDocument();

    const link = panel.getByRole("link", { name: "Download zip" });
    expect(link).toHaveAttribute("href", "/api/projects/p1/package");
    expect(link).toHaveAttribute("download", "acme-css-package.zip");
    expect(panel.getByText("2.1 KB", { exact: false })).toBeInTheDocument(); // 31 + 7 + 15 + 2048 bytes
  });

  it("selects a file, updates the URL and copies its contents", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    setup();
    fireEvent.click(screen.getByRole("button", { name: /acme\.css/ }));
    expect(viewer()).toHaveTextContent('@import url("css/global.css");');
    expect(window.location.search).toBe("?file=acme.css");
    expect(screen.getByRole("button", { name: /acme\.css/ })).toHaveAttribute(
      "aria-current",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await screen.findByRole("button", { name: "Copied" });
    expect(writeText).toHaveBeenCalledWith('@import url("css/global.css");\n');
  });

  it("opens the file from the URL when given", () => {
    setup({ initialPath: "README.md" });
    expect(viewer()).toHaveTextContent("# Acme");
  });

  it("blocks download and lists errors when the package has errors", () => {
    const { panel } = setup({
      blocked: true,
      files: [],
      problems: [
        { severity: "error", message: "Breakpoints: tablet and desktop both match 1024px" },
      ],
    });
    expect(screen.getByText("Fix these errors to generate the package")).toBeInTheDocument();
    expect(
      screen.getByText("Breakpoints: tablet and desktop both match 1024px"),
    ).toBeInTheDocument();
    expect(panel.getByRole("button", { name: "Download zip" })).toBeDisabled();
    expect(screen.queryByRole("region", { name: "File contents" })).not.toBeInTheDocument();
  });

  it("regenerates by refreshing the route", () => {
    const { panel } = setup();
    fireEvent.click(panel.getByRole("button", { name: "Regenerate" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("shows design sources, needs attention with links, and defaults by file", () => {
    setup({
      prefix: "acme",
      report: {
        rows: [
          {
            kind: "token",
            name: "color-primary",
            file: "tokens.css",
            source: "figma-token",
            value: "#8a0b4f",
          },
          {
            kind: "component",
            name: "footer-gap",
            file: "footer.css",
            source: "responsive",
            value: "24px",
          },
          {
            kind: "token",
            name: "color-text",
            file: "tokens.css",
            source: "default",
            value: "#1f2329",
          },
          {
            kind: "component",
            name: "btn-radius",
            file: "cta.css",
            source: "default",
            value: "var(--{{prefix}}-radius-pill)",
          },
        ],
        attention: [
          { message: "2 tokens are waiting for review and not used yet.", screen: "tokens" },
        ],
      },
    });
    const section = screen.getByRole("region", { name: "Design sources" });
    expect(section).toHaveTextContent("2 values from Figma · 2 defaults");
    expect(within(section).getByText(/waiting for review/)).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "Open Tokens" })).toHaveAttribute(
      "href",
      "/projects/p1/tokens",
    );
    expect(within(section).getByText("Measured per breakpoint")).toBeInTheDocument();
    expect(section).toHaveTextContent("cta.css: --acme-btn-radius");
  });

  it("shows quality checks, issues, fixes and sizes; errors keep the files visible but block download", () => {
    const { panel } = setup({
      blocked: true,
      quality: {
        checks: [
          { id: "stylelint", label: "Stylelint rules", errors: 1, warnings: 0 },
          { id: "unused", label: "Unused variables", errors: 0, warnings: 1 },
          { id: "classes", label: "Classes match the component docs", errors: 0, warnings: 0 },
        ],
        issues: [
          {
            check: "stylelint",
            severity: "error",
            message: 'Class ".btn" must be BEM',
            path: "css/global.css",
            line: 12,
          },
          { check: "unused", severity: "warning", message: "6 tokens are defined but not used" },
        ],
        fixes: [{ path: "css/global.css", description: "Duplicate rule .acme-btn" }],
        sizes: [{ path: "css/global.css", bytes: 2048, gzip: 700, rules: 10, declarations: 30 }],
        blocked: true,
      },
    });
    const card = screen.getByRole("region", { name: /Quality checks/ });
    expect(card).toHaveTextContent("1 error: download blocked");
    expect(card).toHaveTextContent("✗ Stylelint rules 1 error");
    expect(card).toHaveTextContent('css/global.css:12: Class ".btn" must be BEM');
    expect(card).toHaveTextContent("Automatic fixes (1)");
    expect(card).toHaveTextContent("File sizes (2.0 KB, 700 B gzipped)");
    expect(panel.getByRole("button", { name: "Download zip" })).toBeDisabled();
    expect(screen.getByRole("region", { name: "File contents" })).toBeInTheDocument();
  });
});
