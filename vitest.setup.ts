import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// `server-only` throws outside the React Server bundle; tests import server modules directly.
vi.mock("server-only", () => ({}));

// Tests must never reach the network (and especially never the real Figma API).
// Tests that exercise HTTP code inject their own fetch implementation.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is disabled in tests. Inject a fetch implementation instead.");
});
