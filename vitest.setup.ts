import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// `server-only` throws outside the React Server bundle; tests import server modules directly.
vi.mock("server-only", () => ({}));
