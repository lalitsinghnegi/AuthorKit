// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Project, ResponsiveFile } from "@/lib/model";
import { ResponsiveReport } from "./ResponsiveReport";

const project = {
  prefix: "acme",
  approach: "mobile-first",
  breakpoints: {
    breakpoints: [
      { id: "m", name: "mobile", maxWidth: 767 },
      { id: "t", name: "tablet", minWidth: 768, maxWidth: 1023 },
      { id: "d", name: "desktop", minWidth: 1024 },
    ],
  },
} as unknown as Project;

const data: ResponsiveFile = {
  schemaVersion: 1,
  components: {
    footer: {
      mode: "breakpoints",
      frames: [
        {
          linkId: "a",
          nodeId: "5:2",
          nodeName: "Footer / Mobile",
          breakpointId: "m",
          tagged: true,
        },
        {
          linkId: "b",
          nodeId: "5:1",
          nodeName: "Footer / Desktop",
          breakpointId: "d",
          tagged: true,
        },
      ],
      values: {
        m: { "footer-direction": { value: "column", source: "frame" } },
        t: { "footer-direction": { value: "column", source: "inferred" } },
        d: { "footer-direction": { value: "row", source: "frame" } },
      },
      notes: ["No footer frame for tablet; values were copied from the nearest breakpoint."],
    },
    cta: {
      mode: "fluid",
      frames: [{ linkId: "c", nodeId: "3:1", nodeName: "CTA", breakpointId: "m", tagged: false }],
      values: {
        m: { "btn-font-size": { value: "clamp(16px, 12.8px + 1vw, 20px)", source: "fluid" } },
        t: { "btn-font-size": { value: "clamp(16px, 12.8px + 1vw, 20px)", source: "fluid" } },
        d: { "btn-font-size": { value: "clamp(16px, 12.8px + 1vw, 20px)", source: "fluid" } },
      },
      notes: [],
    },
  },
};

describe("ResponsiveReport", () => {
  it("shows the coverage matrix", () => {
    render(<ResponsiveReport project={project} data={data} />);
    const coverage = screen.getByRole("region", { name: "Coverage" });
    const footer = within(coverage).getByRole("row", { name: /Footer/ });
    expect(footer).toHaveTextContent("✓ Footer / Mobile");
    expect(footer).toHaveTextContent("inferred");
    expect(footer).toHaveTextContent("Per breakpoint");
    const cta = within(coverage).getByRole("row", { name: /CTA buttons/ });
    expect(cta).toHaveTextContent("(untagged)");
    expect(cta).toHaveTextContent("Estimated (fluid)");
    expect(within(coverage).getByRole("row", { name: /Header/ })).toHaveTextContent("No frames");
  });

  it("shows values with sources and the generated CSS", () => {
    render(<ResponsiveReport project={project} data={data} />);
    const footer = screen.getByRole("region", { name: /Footer/ });
    expect(footer).toHaveTextContent("No footer frame for tablet");
    expect(within(footer).getByRole("row", { name: /--acme-footer-direction/ })).toHaveTextContent(
      "columnframecolumninferredrowframe",
    );
    expect(footer.querySelector("pre")).toHaveTextContent(
      "@media (min-width: 1024px) { .acme-footer { --acme-footer-direction: row; } }",
    );
    const cta = screen.getByRole("region", { name: /CTA buttons/ });
    expect(cta.querySelector("pre")!.textContent).not.toContain("@media");
  });

  it("explains when nothing has been extracted", () => {
    render(<ResponsiveReport project={project} data={null} />);
    expect(screen.getByText(/Nothing extracted yet/)).toBeInTheDocument();
  });
});
