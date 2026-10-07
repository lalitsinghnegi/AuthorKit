import type { Breakpoint } from "@/lib/model";

export type BreakpointPreset = { id: string; label: string; breakpoints: Omit<Breakpoint, "id">[] };

export const BREAKPOINT_PRESETS: BreakpointPreset[] = [
  {
    id: "three-step",
    label: "3-step (mobile, tablet, desktop)",
    breakpoints: [
      { name: "mobile", maxWidth: 767 },
      { name: "tablet", minWidth: 768, maxWidth: 1023 },
      { name: "desktop", minWidth: 1024 },
    ],
  },
  {
    id: "four-step",
    label: "4-step (+ large desktop)",
    breakpoints: [
      { name: "mobile", maxWidth: 767 },
      { name: "tablet", minWidth: 768, maxWidth: 1023 },
      { name: "desktop", minWidth: 1024, maxWidth: 1439 },
      { name: "large", minWidth: 1440 },
    ],
  },
];
