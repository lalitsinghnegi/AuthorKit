import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { Page } from "playwright-core";

/** Installed Chrome (or CHROME_PATH); browser tests are skipped without it. */
export const CHROME = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].find((p): p is string => Boolean(p && existsSync(p)));

export type AxeViolation = { id: string; impact: string | null; targets: string[] };

/** Run axe-core (WCAG 2.1 A/AA rules) on the page; returns serious and critical violations. */
export async function axeViolations(page: Page): Promise<AxeViolation[]> {
  const source = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
  await page.addScriptTag({ content: source });
  return page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            ctx: Document,
            opts: object,
          ) => Promise<{
            violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[];
          }>;
        };
      }
    ).axe;
    const { violations } = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    });
    return violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({
        id: v.id,
        impact: v.impact,
        targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
      }));
  });
}
